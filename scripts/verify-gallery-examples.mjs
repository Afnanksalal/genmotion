import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { renderFramePng } from '../dist/engine/draw.js';
import { loadProject } from '../dist/ir/loader.js';

const digest = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(await readFile(path.resolve('examples/manifest.json'), 'utf8'));
const writeReport = async (file, value) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { await writeFile(file, value); return; } catch (error) {
      if (attempt === 4) throw error;
      await delay(100 * (attempt + 1));
    }
  }
};

for (const example of manifest) {
  const directory = path.resolve('examples', example.id);
  const movie = path.join(directory, `${example.id}.mp4`);
  const loaded = await loadProject(directory);
  const expectedFrames = Math.round(example.duration * loaded.project.fps);
  const seekFrame = Math.min(expectedFrames - 1, Math.max(1, Math.round(expectedFrames * .37)));
  const firstSeek = await renderFramePng(loaded.project, directory, seekFrame);
  await renderFramePng(loaded.project, directory, Math.min(expectedFrames - 1, Math.round(expectedFrames * .73)));
  if (!firstSeek.equals(await renderFramePng(loaded.project, directory, seekFrame))) {
    throw new Error(`${example.id}: random-seek pixels changed`);
  }

  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', movie, '-vf', 'scale=160:90', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 16 * 1024 * 1024 });
  const frameBytes = 160 * 90;
  const decodedFrames = pixels.length / frameBytes;
  const hashes = new Set();
  const frameDeltas = [];
  let minimumRange = 255;
  if (decodedFrames !== expectedFrames) throw new Error(`${example.id}: expected ${expectedFrames} decoded frames, got ${decodedFrames}`);
  for (let frame = 0; frame < decodedFrames; frame++) {
    const bytes = pixels.subarray(frame * frameBytes, (frame + 1) * frameBytes);
    let min = 255;
    let max = 0;
    for (const value of bytes) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    minimumRange = Math.min(minimumRange, max - min);
    hashes.add(digest(bytes));
    if (frame > 0) {
      const previous = pixels.subarray((frame - 1) * frameBytes, frame * frameBytes);
      let difference = 0;
      for (let index = 0; index < frameBytes; index++) difference += Math.abs(bytes[index] - previous[index]);
      frameDeltas.push(difference / frameBytes);
    }
  }
  const minimumDistinctFrames = Math.max(12, Math.floor(expectedFrames * .05));
  if (minimumRange < 20 || hashes.size < minimumDistinctFrames) throw new Error(`${example.id}: blank or unexpectedly static output`);

  let audioChecks = null;
  if (example.audio) {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', movie, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 16 * 1024 * 1024 });
    const samples = pcm.length / 4;
    const edgeSamples = Math.min(samples, 240);
    let peak = 0;
    let initial5msPeak = 0;
    let final5msPeak = 0;
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
      const sample = Math.abs(pcm.readFloatLE(sampleIndex * 4));
      peak = Math.max(peak, sample);
      if (sampleIndex < edgeSamples) initial5msPeak = Math.max(initial5msPeak, sample);
      if (sampleIndex >= samples - edgeSamples) final5msPeak = Math.max(final5msPeak, sample);
    }
    if (peak < .02 || peak >= .98 || initial5msPeak > .03 || final5msPeak > .03) throw new Error(`${example.id}: audio is silent, clipped, or has an unclean edge`);
    audioChecks = { peak, initial5msPeak, final5msPeak, clipping: false };
  }

  const report = {
    width: loaded.project.width,
    height: loaded.project.height,
    fps: loaded.project.fps,
    duration: example.duration,
    strictValidation: 'passed',
    fullDecode: 'passed',
    decodedFrames,
    distinctDownsampledFrames: hashes.size,
    minimumLumaRange: minimumRange,
    randomSeekPixelEquality: true,
    timingChecks: {
      peakFrameDelta: Math.max(...frameDeltas),
      meanFrameDelta: frameDeltas.reduce((sum, value) => sum + value, 0) / frameDeltas.length,
      finalSecondMeanDelta: frameDeltas.slice(-loaded.project.fps).reduce((sum, value) => sum + value, 0) / loaded.project.fps,
    },
    audioChecks,
    sha256: {
      source: digest(await readFile(path.join(directory, 'genmotion.json'))),
      master: digest(await readFile(movie)),
      contactSheet: digest(await readFile(path.join(directory, 'contact-sheet.png'))),
    },
  };
  await writeReport(path.join(directory, 'render-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${example.id}: ${decodedFrames} nonblank decoded frames, ${hashes.size} distinct frames, final-second delta ${report.timingChecks.finalSecondMeanDelta.toFixed(3)}, deterministic random seeking${audioChecks ? ', clean unclipped audio' : ''}`);
}
