#!/usr/bin/env node
import { Command } from 'commander';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from './ir/loader.js';
import { hasErrors, summarizeProject, validateProject } from './ir/validate.js';
import { renderFramePng } from './engine/draw.js';
import { renderProject, type RenderQuality, type VideoCodec } from './engine/render.js';
import { startPreview } from './engine/preview.js';
import { doctor } from './commands/doctor.js';
import { initializeProject } from './commands/init.js';
import { searchCatalog } from './commands/catalog.js';
import { GenmotionError } from './errors.js';
import { makeContactSheet, probeVideo } from './engine/probe.js';
import { auditCatalog } from './catalog/audit.js';
import { isEntrypoint } from './entrypoint.js';
import { getStudioRequests, resolveStudioRequest, startStudio } from './studio/server.js';
import { GENMOTION_VERSION } from './version.js';
import { parseCaptions, serializeCaptions } from './captions.js';
import type { ParameterValue } from './ir/parameters.js';

const program = new Command();
program.name('genmotion').description('Agent-native motion design engine and visual editor.').version(GENMOTION_VERSION).option('--json', 'Emit machine-readable JSON.');

function output(value: unknown): void {
  if (program.opts<{ json?: boolean }>().json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === 'string') process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseResolution(value: string): { width: number; height: number } {
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(value.trim());
  if (!match) throw new GenmotionError('INVALID_RENDER_RESOLUTION', 'Resolution must use WIDTHxHEIGHT, for example 1920x1080.');
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function loadConfiguredProject(input: string, options: { params?: string; variant?: string }) {
  const initial = await loadProject(input);
  const variant = options.variant ? initial.sourceProject.variants.find((candidate) => candidate.id === options.variant) : undefined;
  if (options.variant && !variant) throw new GenmotionError('VARIANT_UNKNOWN', `Unknown project variant: ${options.variant}`);
  const explicit = options.params ? JSON.parse(options.params) as Record<string, ParameterValue> : {};
  return loadProject(input, { ...(variant?.values ?? {}), ...explicit });
}

program.command('init')
  .argument('<directory>')
  .requiredOption('--title <title>')
  .requiredOption('--promise <promise>')
  .requiredOption('--proof <proof>', 'One verified proof point')
  .requiredOption('--action <action>', 'Desired viewer action')
  .option('--audience <audience>', 'Primary audience', 'Product buyers and users')
  .option('--mode <mode>', 'walkthrough, launch, pitch, or explainer', 'launch')
  .option('--duration <seconds>', 'Target duration', '30')
  .action(async (directory: string, options: { title: string; promise: string; proof: string; action: string; audience: string; mode: 'walkthrough' | 'launch' | 'pitch' | 'explainer'; duration: string }) => {
    output(await initializeProject(directory, { title: options.title, promise: options.promise, proof: options.proof, desiredAction: options.action, audience: options.audience, mode: options.mode, duration: Number(options.duration) }));
  });

program.command('validate').alias('check')
  .argument('<project>')
  .option('--strict', 'Treat warnings as failures')
  .option('--params <json>', 'Typed parameter overrides as a JSON object')
  .option('--variant <id>', 'Named project variant')
  .action(async (input: string, options: { strict?: boolean; params?: string; variant?: string }) => {
    const loaded = await loadConfiguredProject(input, options);
    const findings = await validateProject(loaded);
    output({ ok: !hasErrors(findings) && (!options.strict || findings.length === 0), summary: summarizeProject(loaded.project), findings });
    if (hasErrors(findings) || (options.strict && findings.length > 0)) process.exitCode = 1;
  });

program.command('frame')
  .argument('<project>')
  .requiredOption('--at <seconds>')
  .requiredOption('--output <file>')
  .option('--params <json>', 'Typed parameter overrides as a JSON object')
  .option('--variant <id>', 'Named project variant')
  .action(async (input: string, options: { at: string; output: string; params?: string; variant?: string }) => {
    const loaded = await loadConfiguredProject(input, options);
    const frame = Math.floor(Number(options.at) * loaded.project.fps);
    const png = await renderFramePng(loaded.project, loaded.projectDir, frame);
    const destination = path.resolve(options.output);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, png);
    output({ output: destination, frame, at: frame / loaded.project.fps });
  });

program.command('render')
  .argument('<project>')
  .requiredOption('--output <file>')
  .option('--quality <quality>', 'draft, standard, or high', 'high')
  .option('--codec <codec>', 'h264, h265, vp9, or prores', 'h264')
  .option('--workers <count>', 'Frame workers')
  .option('--resolution <WIDTHxHEIGHT>', 'Exact even-sized output resolution; must preserve the project aspect ratio')
  .option('--hardware', 'Require a platform hardware encoder')
  .option('--params <json>', 'Typed parameter overrides as a JSON object')
  .option('--variant <id>', 'Named project variant')
  .action(async (input: string, options: { output: string; quality: RenderQuality; codec: VideoCodec; workers?: string; resolution?: string; hardware?: boolean; params?: string; variant?: string }) => {
    const loaded = await loadConfiguredProject(input, options);
    const findings = await validateProject(loaded);
    if (hasErrors(findings)) throw new GenmotionError('VALIDATION_FAILED', 'Render blocked by validation errors.', findings);
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    let lastReport = 0;
    const result = await renderProject(loaded, {
      output: options.output, quality: options.quality, codec: options.codec,
      ...(options.workers ? { workers: Number(options.workers) } : {}),
      ...(options.resolution ? { resolution: parseResolution(options.resolution) } : {}),
      hardwareAcceleration: options.hardware ?? false, signal: controller.signal,
      onProgress: (progress) => {
        if (program.opts<{ json?: boolean }>().json || performance.now() - lastReport < 500) return;
        lastReport = performance.now();
        process.stderr.write(`\rRendered ${String(progress.encodedFrames)}/${String(progress.totalFrames)} frames · ${progress.fps.toFixed(1)} fps`);
      },
    });
    if (!program.opts<{ json?: boolean }>().json) process.stderr.write('\n');
    output(result);
  });

program.command('render-variants')
  .description('Render every named project variant deterministically from one Creative IR document.')
  .argument('<project>')
  .requiredOption('--output <directory>')
  .option('--quality <quality>', 'draft, standard, or high', 'high')
  .option('--codec <codec>', 'h264, h265, vp9, or prores', 'h264')
  .option('--workers <count>', 'Frame workers')
  .action(async (input: string, options: { output: string; quality: RenderQuality; codec: VideoCodec; workers?: string }) => {
    const source = await loadProject(input);
    if (source.sourceProject.variants.length === 0) throw new GenmotionError('VARIANTS_EMPTY', 'The project defines no named variants.');
    const directory = path.resolve(options.output); await mkdir(directory, { recursive: true });
    const results = [];
    for (const variant of source.sourceProject.variants) {
      const loaded = await loadProject(input, variant.values);
      const findings = await validateProject(loaded);
      if (hasErrors(findings)) throw new GenmotionError('VALIDATION_FAILED', `Variant ${variant.id} failed validation.`, findings);
      results.push({ variant: variant.id, ...await renderProject(loaded, { output: path.join(directory, `${source.sourceProject.id}-${variant.id}.mp4`), quality: options.quality, codec: options.codec, ...(options.workers ? { workers: Number(options.workers) } : {}) }) });
    }
    output({ output: directory, variants: results });
  });

program.command('preview')
  .argument('<project>')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--port <port>', 'Bind port', '4178')
  .action(async (input: string, options: { host: string; port: string }) => {
    const loaded = await loadProject(input);
    const preview = await startPreview(loaded, { host: options.host, port: Number(options.port) });
    output({ url: preview.url });
    await new Promise<void>((resolve) => { const stop = (): void => { void preview.close().then(resolve); }; process.once('SIGINT', stop); process.once('SIGTERM', stop); });
  });

function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

program.command('studio')
  .description('Open the local human-in-the-loop workflow and timeline editor.')
  .argument('<project>')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--port <port>', 'Bind port', '4180')
  .option('--workspace <directory>', 'Local project workspace', path.join(os.homedir(), 'Genmotion Projects'))
  .option('--no-open', 'Do not open the system browser')
  .action(async (input: string, options: { host: string; port: string; workspace: string; open: boolean }) => {
    const loaded = await loadProject(input);
    const studio = await startStudio(loaded, { host: options.host, port: Number(options.port), workspaceRoot: options.workspace });
    output({ url: studio.url, project: loaded.projectFile });
    if (options.open) openBrowser(studio.url);
    await new Promise<void>((resolve) => { const stop = (): void => { void studio.close().then(resolve); }; process.once('SIGINT', stop); process.once('SIGTERM', stop); });
  });

program.command('requests')
  .description('List human change requests queued from Genmotion Studio.')
  .argument('<project>')
  .option('--pending', 'Only show pending requests')
  .action(async (input: string, options: { pending?: boolean }) => {
    const loaded = await loadProject(input);
    const requests = await getStudioRequests(loaded.projectDir);
    output(options.pending ? requests.filter((request) => ['pending', 'queued', 'running'].includes(request.status)) : requests);
  });

program.command('request-resolve')
  .description('Resolve a Studio change request after applying and validating the requested edit.')
  .argument('<project>')
  .requiredOption('--id <id>', 'Request id')
  .requiredOption('--response <response>', 'Concise summary of the completed change')
  .action(async (input: string, options: { id: string; response: string }) => {
    const loaded = await loadProject(input);
    output(await resolveStudioRequest(loaded.projectDir, options.id, options.response));
  });

program.command('catalog')
  .argument('[query]', 'Describe the creative move, role, or mood', '')
  .option('--limit <count>', 'Maximum results', '12')
  .action((query: string, options: { limit: string }) => { output(searchCatalog(query, Number(options.limit))); });

program.command('doctor').action(async () => {
  const checks = await doctor();
  output({ ok: checks.every((check) => check.ok), checks });
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
});

program.command('probe')
  .argument('<video>')
  .action(async (file: string) => { output(await probeVideo(file)); });

program.command('contact-sheet')
  .argument('<video>')
  .requiredOption('--output <file>')
  .option('--count <count>', 'Number of representative frames', '12')
  .option('--columns <columns>', 'Sheet columns', '4')
  .action(async (file: string, options: { output: string; count: string; columns: string }) => {
    await makeContactSheet(file, options.output, Number(options.count), Number(options.columns));
    output({ output: path.resolve(options.output), source: path.resolve(file) });
  });

program.command('benchmark')
  .argument('<project>')
  .option('--frames <count>', 'Maximum frames', '60')
  .action(async (input: string, options: { frames: string }) => {
    const loaded = await loadProject(input);
    const frames = Math.max(1, Number(options.frames));
    const seconds = frames / loaded.project.fps;
    const firstScene = loaded.project.scenes[0];
    if (!firstScene) throw new Error('Project has no scenes.');
    loaded.project = { ...loaded.project, scenes: [{ ...firstScene, duration: Math.min(firstScene.duration, seconds), transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' } }], audio: [] };
    const directory = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'genmotion-benchmark-')));
    try {
      const result = await renderProject(loaded, { output: path.join(directory, 'benchmark.mp4'), quality: 'draft', workers: Math.min(4, os.availableParallelism()) });
      output(result);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

program.command('catalog-audit').description('Validate catalog cross-references and licenses.').action(() => {
  const result = auditCatalog();
  output(result);
  if (!result.ok) process.exitCode = 1;
});

program.command('captions-import')
  .description('Parse SRT, WebVTT, or timed JSON into Creative IR caption cues.')
  .argument('<file>')
  .option('--format <format>', 'srt, vtt, or json')
  .action(async (file: string, options: { format?: 'srt' | 'vtt' | 'json' }) => {
    const extension = path.extname(file).slice(1).toLowerCase();
    const format = options.format ?? (extension === 'vtt' ? 'vtt' : extension === 'json' ? 'json' : 'srt');
    output({ cues: parseCaptions(await readFile(file, 'utf8'), format) });
  });

program.command('captions-export')
  .description('Export a caption layer as SRT, WebVTT, or timed JSON.')
  .argument('<project>')
  .requiredOption('--layer <id>')
  .requiredOption('--format <format>', 'srt, vtt, or json')
  .requiredOption('--output <file>')
  .action(async (input: string, options: { layer: string; format: 'srt' | 'vtt' | 'json'; output: string }) => {
    const loaded = await loadProject(input);
    const layer = [...loaded.sourceProject.scenes.flatMap((scene) => scene.layers), ...loaded.sourceProject.compositions.flatMap((composition) => composition.layers)].find((candidate) => candidate.id === options.layer);
    if (!layer || layer.type !== 'caption') throw new GenmotionError('CAPTION_LAYER_UNKNOWN', `No caption layer found with id ${options.layer}.`);
    const destination = path.resolve(options.output);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, serializeCaptions(layer.cues, options.format));
    output({ output: destination, cues: layer.cues.length, format: options.format });
  });

async function main(): Promise<void> {
  try { await program.parseAsync(process.argv); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = error instanceof GenmotionError ? { ok: false, code: error.code, error: message, details: error.details } : { ok: false, code: 'UNEXPECTED', error: message };
    if (program.opts<{ json?: boolean }>().json) process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    else process.stderr.write(`Genmotion: ${message}\n`);
    process.exitCode = 1;
  }
}

if (isEntrypoint(import.meta.url, process.argv[1])) await main();
