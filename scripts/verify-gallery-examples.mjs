import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { loadProject } from '../dist/ir/loader.js';
import { renderFramePng } from '../dist/engine/draw.js';

const digest = data => createHash('sha256').update(data).digest('hex');
for (const id of ['chromatic-orbit', 'route-study', 'type-beat']) {
  const dir = path.resolve('examples', id), loaded = await loadProject(dir), movie = path.join(dir, `${id}.mp4`);
  const first = await renderFramePng(loaded.project, dir, 30);
  await renderFramePng(loaded.project, dir, 160);
  if (!first.equals(await renderFramePng(loaded.project, dir, 30))) throw new Error(`${id}: random-seek pixels changed`);
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', movie, '-vf', 'scale=160:90', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 8 * 1024 * 1024 });
  const frameBytes = 160 * 90, frames = pixels.length / frameBytes, hashes = new Set(); let minimumRange = 255;
  if (frames !== 240) throw new Error(`${id}: expected 240 decoded frames, got ${frames}`);
  for (let frame = 0; frame < frames; frame++) {
    const bytes = pixels.subarray(frame * frameBytes, (frame + 1) * frameBytes); let min = 255, max = 0;
    for (const value of bytes) { min = Math.min(min, value); max = Math.max(max, value); }
    minimumRange = Math.min(minimumRange, max - min); hashes.add(digest(bytes));
  }
  if (minimumRange < 20 || hashes.size < 30) throw new Error(`${id}: blank or unexpectedly static output`);
  let audio = null;
  if (id === 'type-beat') {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', movie, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 4 * 1024 * 1024 });
    let peak = 0, startPeak = 0, endPeak = 0;
    for (let offset = 0; offset < pcm.length; offset += 4) { const sample = Math.abs(pcm.readFloatLE(offset)); peak = Math.max(peak, sample); if (offset < 4800 * 4) startPeak = Math.max(startPeak, sample); if (offset >= pcm.length - 12000 * 4) endPeak = Math.max(endPeak, sample); }
    if (peak < .05 || peak >= .98 || startPeak > .001 || endPeak > .001) throw new Error('Audio is silent, clipped or has an unclean edge');
    audio = { peak, initial100msPeak: startPeak, final250msPeak: endPeak, clipping: false };
  }
  const report = JSON.parse(await readFile(path.join(dir, 'render-report.json'), 'utf8'));
  Object.assign(report, { decodedFrames: frames, distinctDownsampledFrames: hashes.size, minimumLumaRange: minimumRange, randomSeekPixelEquality: true, audioChecks: audio,
    sha256: { source: digest(await readFile(path.join(dir, 'genmotion.json'))), master: digest(await readFile(movie)), contactSheet: digest(await readFile(path.join(dir, 'contact-sheet.png'))) } });
  await writeFile(path.join(dir, 'render-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${id}: 240 nonblank decoded frames, ${hashes.size} distinct frames, deterministic random seeking${audio ? ', unclipped audio with silent edges' : ''}`);
}
