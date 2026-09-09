import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { z } from 'zod';
import { runProcess, throwIfAborted } from '../engine/process.js';

const unit = z.number().finite().min(0).max(1), time = z.number().finite().nonnegative();
const regionSchema = z.object({ id: z.string().min(1).max(200), x: unit, y: unit, width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1) }).strict()
  .refine(region => region.x + region.width <= 1 && region.y + region.height <= 1, 'Comparison region must remain inside the frame');
const exclusionSchema = regionSchema.extend({ reason: z.string().min(1).max(4000) }).strict();
const alignmentSchema = z.object({ id: z.string().min(1).max(200), referenceTime: time, outputTime: time, boundary: z.boolean().default(false), regions: z.array(regionSchema).max(100).default([]), exclusions: z.array(exclusionSchema).max(100).default([]) }).strict();
export const referenceComparisonOptionsSchema = z.object({
  reference: z.string().min(1), output: z.string().min(1), destination: z.string().min(1),
  alignments: z.array(alignmentSchema).min(1).max(100), differenceThreshold: z.number().int().min(0).max(255).default(12),
}).strict().superRefine((value, context) => { if (new Set(value.alignments.map(item => item.id)).size !== value.alignments.length) context.addIssue({ code: 'custom', message: 'Alignment IDs must be unique' }); });
export type ReferenceComparisonOptions = z.input<typeof referenceComparisonOptionsSchema>;

async function hashFile(file: string): Promise<string> { const digest = createHash('sha256'); for await (const chunk of createReadStream(file)) digest.update(chunk as Buffer); return digest.digest('hex'); }
async function extractFrame(source: string, at: number, output: string, signal?: AbortSignal): Promise<void> {
  await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(9), '-i', path.resolve(source), '-frames:v', '1', '-f', 'image2', output], undefined, { ...(signal ? { signal } : {}), timeoutMs: 30_000, maxOutputBytes: 256 * 1024 });
}
type Metric = { pixels: number; meanAbsoluteError: number; rmse: number; psnr: number | null; changedRatio: number };
function metric(reference: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, region: { x: number; y: number; width: number; height: number }, exclusions: Array<{ x: number; y: number; width: number; height: number }>, threshold: number): Metric {
  const left = Math.floor(region.x * width), top = Math.floor(region.y * height), right = Math.ceil((region.x + region.width) * width), bottom = Math.ceil((region.y + region.height) * height);
  let pixels = 0, absolute = 0, squared = 0, changed = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const nx = (x + .5) / width, ny = (y + .5) / height;
    if (exclusions.some(mask => nx >= mask.x && nx <= mask.x + mask.width && ny >= mask.y && ny <= mask.y + mask.height)) continue;
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel++) { const delta = Math.abs(reference[(y * width + x) * 4 + channel]! - output[(y * width + x) * 4 + channel]!); absolute += delta; squared += delta * delta; if (delta > threshold) pixelChanged = true; }
    pixels++; if (pixelChanged) changed++;
  }
  if (!pixels) return { pixels: 0, meanAbsoluteError: 0, rmse: 0, psnr: null, changedRatio: 0 };
  const samples = pixels * 4, mse = squared / samples, rmse = Math.sqrt(mse);
  return { pixels, meanAbsoluteError: absolute / samples, rmse, psnr: mse === 0 ? null : 20 * Math.log10(255 / rmse), changedRatio: changed / pixels };
}

export async function compareReferenceOutput(input: ReferenceComparisonOptions, signal?: AbortSignal) {
  const options = referenceComparisonOptionsSchema.parse(input), reference = path.resolve(options.reference), output = path.resolve(options.output), destination = path.resolve(options.destination);
  if (reference === output) throw new Error('Reference and output must be distinct files');
  await mkdir(destination, { recursive: true }); const temporary = await mkdtemp(path.join(destination, `.comparison-${randomUUID()}-`));
  try {
    const sampleDirectory = path.join(destination, 'samples'); await mkdir(sampleDirectory, { recursive: true });
    const samples = [] as Array<{ id: string; referenceTime: number; outputTime: number; boundary: boolean; metrics: { global: Metric; regions: Array<{ id: string; metric: Metric }> }; exclusions: Array<{ id: string; reason: string }>; referenceFrame: string; outputFrame: string }>;
    const sheetWidth = 1440, cellWidth = 480, cellHeight = 300, sheet = createCanvas(sheetWidth, cellHeight * options.alignments.length), sheetContext = sheet.getContext('2d'); sheetContext.fillStyle = '#101217'; sheetContext.fillRect(0, 0, sheet.width, sheet.height);
    for (const [index, alignment] of options.alignments.entries()) {
      throwIfAborted(signal); const referenceFrame = path.join(temporary, `${alignment.id}-reference.png`), outputFrame = path.join(temporary, `${alignment.id}-output.png`);
      await extractFrame(reference, alignment.referenceTime, referenceFrame, signal); await extractFrame(output, alignment.outputTime, outputFrame, signal);
      const referenceImage = await loadImage(referenceFrame), outputImage = await loadImage(outputFrame), width = referenceImage.width, height = referenceImage.height;
      const referenceCanvas = createCanvas(width, height), outputCanvas = createCanvas(width, height); referenceCanvas.getContext('2d').drawImage(referenceImage, 0, 0, width, height); outputCanvas.getContext('2d').drawImage(outputImage, 0, 0, width, height);
      const referencePixels = referenceCanvas.getContext('2d').getImageData(0, 0, width, height).data, outputPixels = outputCanvas.getContext('2d').getImageData(0, 0, width, height).data;
      const all = { x: 0, y: 0, width: 1, height: 1 }, global = metric(referencePixels, outputPixels, width, height, all, alignment.exclusions, options.differenceThreshold);
      const regions = alignment.regions.map(region => ({ id: region.id, metric: metric(referencePixels, outputPixels, width, height, region, alignment.exclusions, options.differenceThreshold) }));
      const difference = createCanvas(width, height), differenceContext = difference.getContext('2d'), differenceData = differenceContext.createImageData(width, height);
      for (let offset = 0; offset < differenceData.data.length; offset += 4) { differenceData.data[offset] = Math.abs(referencePixels[offset]! - outputPixels[offset]!); differenceData.data[offset + 1] = Math.abs(referencePixels[offset + 1]! - outputPixels[offset + 1]!); differenceData.data[offset + 2] = Math.abs(referencePixels[offset + 2]! - outputPixels[offset + 2]!); differenceData.data[offset + 3] = 255; } differenceContext.putImageData(differenceData, 0, 0);
      for (const [column, canvas] of [referenceCanvas, outputCanvas, difference].entries()) sheetContext.drawImage(canvas, column * cellWidth, index * cellHeight, cellWidth, cellHeight);
      const retainedReference = path.join(sampleDirectory, `${alignment.id}-reference.png`), retainedOutput = path.join(sampleDirectory, `${alignment.id}-output.png`); await copyFile(referenceFrame, retainedReference); await copyFile(outputFrame, retainedOutput);
      samples.push({ id: alignment.id, referenceTime: alignment.referenceTime, outputTime: alignment.outputTime, boundary: alignment.boundary, metrics: { global, regions }, exclusions: alignment.exclusions.map(mask => ({ id: mask.id, reason: mask.reason })), referenceFrame: path.relative(destination, retainedReference).replaceAll('\\', '/'), outputFrame: path.relative(destination, retainedOutput).replaceAll('\\', '/') });
    }
    const contactSheet = path.join(destination, 'reference-comparison.png'); await writeFile(contactSheet, sheet.toBuffer('image/png'));
    const report = { version: 1 as const, reference: { path: reference, sha256: await hashFile(reference) }, output: { path: output, sha256: await hashFile(output) }, threshold: options.differenceThreshold, samples, boundarySamples: samples.filter(sample => sample.boundary).map(sample => sample.id), preservationDefects: samples.filter(sample => sample.metrics.global.changedRatio > 0).map(sample => ({ alignmentId: sample.id, changedRatio: sample.metrics.global.changedRatio, rmse: sample.metrics.global.rmse })), intentionalDifferences: options.alignments.flatMap(alignment => alignment.exclusions.map(mask => ({ alignmentId: alignment.id, regionId: mask.id, reason: mask.reason }))), contactSheet: { path: contactSheet, sha256: await hashFile(contactSheet) } };
    await writeFile(path.join(destination, 'reference-comparison.json'), `${JSON.stringify(report, null, 2)}\n`); return report;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
