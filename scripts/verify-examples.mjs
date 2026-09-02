import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../dist/ir/loader.js';
import { validateProject } from '../dist/ir/validate.js';
import { probeVideo } from '../dist/engine/probe.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examples = [
  { id: 'kinetic-type', duration: 12, audio: false },
  { id: 'data-pulse', duration: 14, audio: false },
  { id: 'arc-one', duration: 15, audio: true },
  { id: 'native-milestones', duration: 4, audio: false, font: false },
];

for (const example of examples) {
  const directory = join(root, 'examples', example.id);
  const loaded = await loadProject(directory);
  const findings = await validateProject(loaded);
  if (findings.length > 0) throw new Error(`${example.id} has validation findings:\n${JSON.stringify(findings, null, 2)}`);
  await access(join(directory, 'contact-sheet.png'));
  if (example.font !== false) await access(join(directory, 'assets', 'Inter.ttf'));
  const probe = await probeVideo(join(directory, `${example.id}.mp4`));
  if (probe.width !== 1920 || probe.height !== 1080 || probe.frameRate !== 30 || Math.abs(probe.duration - example.duration) > 0.05) {
    throw new Error(`${example.id} has an invalid encoded contract: ${JSON.stringify(probe)}`);
  }
  if (example.audio !== Boolean(probe.audioCodec)) throw new Error(`${example.id} audio contract does not match its source project.`);
  console.log(`${example.id}: strict, ${probe.width}x${probe.height}, ${probe.duration}s, ${probe.videoCodec}${probe.audioCodec ? ` + ${probe.audioCodec}` : ''}`);
}
