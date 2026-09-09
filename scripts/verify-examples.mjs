import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../dist/ir/loader.js';
import { validateProject } from '../dist/ir/validate.js';
import { probeVideo } from '../dist/engine/probe.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examples = JSON.parse(await readFile(join(root, 'examples', 'manifest.json'), 'utf8'));
if (examples.length !== 11 || new Set(examples.map(item => item.id)).size !== examples.length) throw new Error('The public gallery must contain eleven unique examples.');

for (const example of examples) {
  const directory = join(root, 'examples', example.id);
  const loaded = await loadProject(directory);
  const findings = await validateProject(loaded);
  if (findings.length) throw new Error(`${example.id} has validation findings:\n${JSON.stringify(findings, null, 2)}`);
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

await import('./verify-gallery-examples.mjs');
