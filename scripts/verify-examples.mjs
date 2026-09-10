import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../dist/ir/loader.js';
import { validateProject } from '../dist/ir/validate.js';
import { probeVideo } from '../dist/engine/probe.js';
import { createLayerGraphSampler, effectiveLayerStart } from '../dist/engine/constraints.js';
import { layerBox } from '../dist/engine/geometry.js';
import { layerIsActive } from '../dist/engine/timeline.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examples = JSON.parse(await readFile(join(root, 'examples', 'manifest.json'), 'utf8'));
if (examples.length !== 11 || new Set(examples.map(item => item.id)).size !== examples.length) throw new Error('The public gallery must contain eleven unique examples.');

for (const example of examples) {
  const directory = join(root, 'examples', example.id);
  const loaded = await loadProject(directory);
  const findings = await validateProject(loaded);
  if (findings.length) throw new Error(`${example.id} has validation findings:\n${JSON.stringify(findings, null, 2)}`);
  for (const scene of loaded.project.scenes) {
    const sample = createLayerGraphSampler(scene.layers, loaded.project.seed);
    const frameCount = Math.round(scene.duration * loaded.project.fps);
    for (let frame = 0; frame < frameCount; frame++) {
      const time = frame / loaded.project.fps;
      const resolved = sample(time);
      for (let index = 0; index < resolved.length; index++) {
        const layer = resolved[index];
        const source = scene.layers[index];
        if (!layer || !source || (layer.type !== 'text' && layer.type !== 'caption') || !layer.visible || Number(layer.transform.opacity) <= .01 || !layerIsActive(effectiveLayerStart(source), source.duration, scene.duration, time)) continue;
        const box = layerBox(layer);
        const width = box.width * Math.abs(Number(layer.transform.scaleX));
        const height = box.height * Math.abs(Number(layer.transform.scaleY));
        const radians = Number(layer.transform.rotation) * Math.PI / 180;
        const transformedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
        const transformedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
        const centerX = box.x + box.width / 2 + Number(layer.transform.x);
        const centerY = box.y + box.height / 2 + Number(layer.transform.y);
        const bounds = { left: centerX - transformedWidth / 2, top: centerY - transformedHeight / 2, right: centerX + transformedWidth / 2, bottom: centerY + transformedHeight / 2 };
        if (bounds.left < -.01 || bounds.top < -.01 || bounds.right > loaded.project.width + .01 || bounds.bottom > loaded.project.height + .01) throw new Error(`${example.id}: ${scene.id}/${layer.id} leaves the frame at frame ${frame}: ${JSON.stringify(bounds)}`);
      }
    }
  }
  await Promise.all([
    access(join(directory, 'contact-sheet.png')),
    access(join(directory, 'assets', 'Inter.ttf')),
    access(join(directory, 'assets', 'OFL.txt')),
    access(join(directory, 'review', 'opening.png')),
    access(join(directory, 'review', 'midpoint.png')),
    access(join(directory, 'review', 'final-hold.png')),
  ]);
  const probe = await probeVideo(join(directory, `${example.id}.mp4`));
  if (probe.width !== 1920 || probe.height !== 1080 || probe.frameRate !== 30 || Math.abs(probe.duration - example.duration) > .05) throw new Error(`${example.id} has an invalid encoded contract: ${JSON.stringify(probe)}`);
  if (example.audio !== Boolean(probe.audioCodec)) throw new Error(`${example.id} audio contract does not match its source project.`);
  console.log(`${example.id}: strict, ${probe.width}x${probe.height}, ${probe.duration}s, ${probe.videoCodec}${probe.audioCodec ? ` + ${probe.audioCodec}` : ''}`);
}

const caption = (await loadProject(join(root, 'examples', 'caption-cinema'))).project;
if (!caption.captionPreviewLanguages.includes('en') || !caption.scenes[0].layers.some(layer => layer.type === 'caption' && layer.language === 'en' && layer.stylePresetId === 'cinema')) throw new Error('Caption Cinema does not exercise the language-filtered editorial caption contract.');
const camera = (await loadProject(join(root, 'examples', 'camera-flight'))).project;
if (!camera.scenes[0].layers.some(layer => layer.motionBlur && layer.tracks.some(item => item.target === 'transform.scaleX'))) throw new Error('Camera Flight does not exercise camera scaling with temporal sampling.');
const temporal = (await loadProject(join(root, 'examples', 'motion-lab'))).project;
if (!temporal.scenes[0].layers.some(layer => layer.motionBlur) || !temporal.scenes[0].layers.some(layer => layer.motionTrail)) throw new Error('Motion Lab must exercise blur and trails independently.');
const typeBeat = (await loadProject(join(root, 'examples', 'type-beat'))).project;
const beatTimes = Array.from({ length: 13 }, (_, index) => .25 + index * .5);
for (const layer of typeBeat.scenes[0].layers.filter(layer => layer.id.startsWith('meter-'))) {
  const peaks = layer.tracks[0].keyframes.filter(keyframe => beatTimes.some(beat => Math.abs(beat - keyframe.at) < 1e-6));
  if (peaks.length !== beatTimes.length || peaks.some(keyframe => Number(keyframe.value) <= .18)) throw new Error(`${layer.id} is not keyed on the Type Beat audio grid.`);
}
const pulseWav = await readFile(join(root, 'examples', 'type-beat', 'assets', 'original-pulse.wav'));
const sampleRate = pulseWav.readUInt32LE(24), channels = pulseWav.readUInt16LE(22), dataOffset = pulseWav.indexOf(Buffer.from('data')) + 8;
const rms = (start, end) => { let sum = 0, count = 0; for (let sample = Math.floor(start * sampleRate); sample < Math.floor(end * sampleRate); sample++) { const value = pulseWav.readInt16LE(dataOffset + sample * channels * 2) / 32768; sum += value * value; count++; } return Math.sqrt(sum / count); };
for (const beat of beatTimes) if (rms(beat, beat + .07) < rms(beat - .18, beat - .11) * 4) throw new Error(`Type Beat lacks a strong audio transient at ${beat}s.`);

await import('./verify-gallery-examples.mjs');
