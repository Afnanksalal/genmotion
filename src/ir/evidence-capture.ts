import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import { GenmotionError } from '../errors.js';

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string().url() }).strict(),
  z.object({ type: z.literal('click'), selector: z.string().min(1).max(2000) }).strict(),
  z.object({ type: z.literal('fill'), selector: z.string().min(1).max(2000), value: z.string().max(100000) }).strict(),
  z.object({ type: z.literal('wait'), milliseconds: z.number().int().min(0).max(10000) }).strict(),
  z.object({ type: z.literal('screenshot'), label: z.string().min(1).max(100) }).strict(),
]);
export const evidenceCaptureOptionsSchema = z.object({
  startUrl: z.string().url(), outputDirectory: z.string().min(1), viewport: z.object({ width: z.number().int().min(320).max(7680), height: z.number().int().min(240).max(4320) }).strict().default({ width: 1440, height: 900 }),
  actions: z.array(actionSchema).max(100).default([]), video: z.boolean().default(false),
  maxDurationMs: z.number().int().min(1000).max(300000).default(30000), maxBytes: z.number().int().min(1024 * 1024).max(2 * 1024 ** 3).default(256 * 1024 ** 2), maxTextBytes: z.number().int().min(0).max(16 * 1024 ** 2).default(1024 * 1024),
}).strict();
export type EvidenceCaptureOptions = z.input<typeof evidenceCaptureOptionsSchema>;

function safeLabel(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'frame'; }
async function hash(file: string): Promise<string> { return createHash('sha256').update(await readFile(file)).digest('hex'); }

async function contactSheet(files: string[], target: string, width: number): Promise<void> {
  const cellWidth = Math.min(480, width), columns = Math.min(3, Math.max(1, files.length)), cellHeight = Math.round(cellWidth * 9 / 16), rows = Math.ceil(files.length / columns);
  const canvas = createCanvas(cellWidth * columns, cellHeight * rows), context = canvas.getContext('2d'); context.fillStyle = '#111318'; context.fillRect(0, 0, canvas.width, canvas.height);
  for (const [index, file] of files.entries()) { const image = await loadImage(file), scale = Math.min(cellWidth / image.width, cellHeight / image.height), x = index % columns * cellWidth + (cellWidth - image.width * scale) / 2, y = Math.floor(index / columns) * cellHeight + (cellHeight - image.height * scale) / 2; context.drawImage(image, x, y, image.width * scale, image.height * scale); }
  await writeFile(target, canvas.toBuffer('image/png'));
}

/** Capture real browser evidence into immutable local files and a truthful bounded manifest. */
export async function captureProductEvidence(raw: EvidenceCaptureOptions) {
  const options = evidenceCaptureOptionsSchema.parse(raw), started = Date.now(), id = randomUUID(), output = path.resolve(options.outputDirectory); await mkdir(output, { recursive: true });
  const screenshots: string[] = [], urls: Array<{ url: string; at: string; status?: number }> = [], skipped: Array<{ phase: string; reason: string }> = []; let bytes = 0, timedOut = false, navigationStatus: 'complete' | 'partial' | 'failed' = 'complete'; const artifactBudget = options.maxBytes - 256 * 1024;
  const browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: options.viewport, ...(options.video ? { recordVideo: { dir: output, size: options.viewport } } : {}) }); const page = await context.newPage();
  const remaining = (): number => Math.max(1, options.maxDurationMs - (Date.now() - started));
  const capture = async (label: string): Promise<void> => { const file = path.join(output, `${String(screenshots.length).padStart(3, '0')}-${safeLabel(label)}.png`), buffer = await page.screenshot({ type: 'png', timeout: remaining() }); if (bytes + buffer.length > artifactBudget) { skipped.push({ phase: `screenshot:${label}`, reason: 'Output byte budget exhausted' }); return; } await writeFile(file, buffer); bytes += buffer.length; screenshots.push(file); };
  try {
    const response = await page.goto(options.startUrl, { waitUntil: 'domcontentloaded', timeout: remaining() }); urls.push({ url: page.url(), at: new Date().toISOString(), ...(response ? { status: response.status() } : {}) }); await capture('initial');
    for (const [index, action] of options.actions.entries()) {
      if (remaining() <= 1) { timedOut = true; skipped.push({ phase: `action:${index}`, reason: 'Capture deadline reached' }); break; }
      try {
        if (action.type === 'navigate') { const result = await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: remaining() }); urls.push({ url: page.url(), at: new Date().toISOString(), ...(result ? { status: result.status() } : {}) }); }
        else if (action.type === 'click') await page.locator(action.selector).click({ timeout: remaining() });
        else if (action.type === 'fill') await page.locator(action.selector).fill(action.value, { timeout: remaining() });
        else if (action.type === 'wait') await page.waitForTimeout(Math.min(action.milliseconds, remaining()));
        else await capture(action.label);
      } catch (error) { navigationStatus = 'partial'; skipped.push({ phase: `action:${index}`, reason: error instanceof Error ? error.message.slice(0, 1000) : String(error) }); }
    }
    await capture('final');
    const text = (await page.locator('body').innerText({ timeout: remaining() })).slice(0, options.maxTextBytes), textFile = path.join(output, 'page-text.txt'), textBytes = Buffer.byteLength(text);
    if (bytes + textBytes <= artifactBudget) { await writeFile(textFile, text); bytes += textBytes; } else skipped.push({ phase: 'text', reason: 'Output byte budget exhausted' });
  } catch (error) { navigationStatus = screenshots.length ? 'partial' : 'failed'; skipped.push({ phase: 'navigation', reason: error instanceof Error ? error.message.slice(0, 1000) : String(error) }); }
  const video = page.video(); await context.close(); await browser.close();
  let videoFile: string | undefined;
  if (video) try { const recorded = await video.path(), size = (await stat(recorded)).size; if (bytes + size <= artifactBudget) { videoFile = recorded; bytes += size; } else { await rm(recorded, { force: true }); skipped.push({ phase: 'video', reason: 'Output byte budget exhausted' }); } } catch (error) { skipped.push({ phase: 'video', reason: error instanceof Error ? error.message : String(error) }); }
  let sheetFile: string | undefined;
  if (screenshots.length) { const candidate = path.join(output, 'contact-sheet.png'); await contactSheet(screenshots, candidate, options.viewport.width); const size = (await stat(candidate)).size; if (bytes + size <= artifactBudget) { sheetFile = candidate; bytes += size; } else { await rm(candidate, { force: true }); skipped.push({ phase: 'contact-sheet', reason: 'Output byte budget exhausted' }); } }
  const artifacts = await Promise.all([...screenshots, ...(videoFile ? [videoFile] : []), ...(sheetFile ? [sheetFile] : [])].map(async file => ({ path: path.relative(output, file).replaceAll('\\', '/'), sha256: await hash(file), bytes: (await stat(file)).size, pixelOrigin: 'captured-evidence' as const })));
  const manifest = { version: 1 as const, id, kind: 'real-product-capture' as const, status: navigationStatus === 'failed' ? 'failed' as const : timedOut || skipped.length ? 'partial' as const : 'complete' as const, startedAt: new Date(started).toISOString(), completedAt: new Date().toISOString(), sourceUrls: urls, viewport: options.viewport, limits: { maxDurationMs: options.maxDurationMs, maxBytes: options.maxBytes, maxTextBytes: options.maxTextBytes, concurrency: 1 }, navigationStatus, skipped, artifacts, totalBytes: bytes, reconstructionPolicy: 'Later reconstructed or generated graphics must use a different pixelOrigin and cannot be relabelled as captured evidence.' };
  const artifactBytes = manifest.totalBytes; let manifestText = ''; for (let index = 0; index < 3; index += 1) { manifestText = `${JSON.stringify(manifest, null, 2)}\n`; manifest.totalBytes = artifactBytes + Buffer.byteLength(manifestText); } manifestText = `${JSON.stringify(manifest, null, 2)}\n`; await writeFile(path.join(output, 'capture.manifest.json'), manifestText);
  if (manifest.totalBytes > options.maxBytes) throw new GenmotionError('CAPTURE_LIMIT_BREACH', 'Capture exceeded its declared byte budget.');
  return manifest;
}
