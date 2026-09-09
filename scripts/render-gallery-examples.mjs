import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProject } from '../dist/ir/loader.js';
import { validateProject } from '../dist/ir/validate.js';
import { renderFramePng } from '../dist/engine/draw.js';
import { renderProject, resolveRenderRange } from '../dist/engine/render.js';
import { makeContactSheet } from '../dist/engine/probe.js';
import { runProcess } from '../dist/engine/process.js';

const manifest = JSON.parse(await readFile(path.resolve('examples/manifest.json'), 'utf8'));
const allIds = manifest.map(example => example.id);
const ids = process.argv.includes('--all') ? allIds : process.argv.slice(2).filter(id => id !== '--stills');
for (const id of ids.length ? ids : allIds) {
  if (!allIds.includes(id)) throw new Error(`Unknown gallery example: ${id}`);
  const dir = path.resolve('examples', id), loaded = await loadProject(dir);
  const findings = await validateProject(loaded);
  if (findings.length) throw new Error(JSON.stringify({ id, findings }, null, 2));
  await mkdir(path.join(dir, 'review'), { recursive: true });
  const totalFrames = resolveRenderRange(loaded.project, {}).endFrame;
  const reviewFrames = new Set([0, ...[.1, .25, .5, .75, .95].map(fraction => Math.floor((totalFrames - 1) * fraction)), totalFrames - 1]);
  let elapsed = 0;
  for (const scene of loaded.project.scenes.slice(0, -1)) { elapsed += scene.duration; const boundary = Math.ceil(elapsed * loaded.project.fps - 1e-9); for (const delta of [-1, 0, 1]) reviewFrames.add(boundary + delta); }
  const renderedReviewFrames = new Map();
  for (const frame of [...reviewFrames].sort((a, b) => a - b)) {
    const png = await renderFramePng(loaded.project, dir, frame);
    renderedReviewFrames.set(frame, png);
    await writeFile(path.join(dir, 'review', `frame-${frame}.png`), png);
  }
  const representatives = { 'opening.png': 0, 'midpoint.png': Math.floor((totalFrames - 1) / 2), 'final-hold.png': totalFrames - 1 };
  for (const [filename, frame] of Object.entries(representatives)) {
    const png = renderedReviewFrames.get(frame) ?? await renderFramePng(loaded.project, dir, frame);
    await writeFile(path.join(dir, 'review', filename), png);
  }
  if (process.argv.includes('--stills')) { console.log(`${id}: strict validation and native review frames passed`); continue; }
  const result = await renderProject(loaded, { output: path.join(dir, `${id}.mp4`), quality: 'high', workers: 2, maxBufferedFrames: 3 });
  await runProcess('ffmpeg', ['-v', 'error', '-i', result.output, '-f', 'null', '-']);
  await makeContactSheet(result.output, path.join(dir, 'contact-sheet.png'), 6, 3);
  await writeFile(path.join(dir, 'render-report.json'), JSON.stringify({ width: result.probe.width, height: result.probe.height, fps: result.probe.frameRate, duration: result.probe.duration, codec: result.probe.videoCodec, audio: result.probe.audioCodec ?? null, strictValidation: 'passed', fullDecode: 'passed', nativeReviewFrames: [...reviewFrames].sort((a, b) => a - b), alphaOutput: result.alphaOutput, renderId: result.renderId }, null, 2) + '\n');
  console.log(`${id}: encoded and decoded ${result.probe.width}x${result.probe.height}, ${result.probe.duration}s`);
}
