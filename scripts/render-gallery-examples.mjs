import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProject } from '../dist/ir/loader.js';
import { validateProject } from '../dist/ir/validate.js';
import { renderFramePng } from '../dist/engine/draw.js';
import { renderProject } from '../dist/engine/render.js';
import { makeContactSheet } from '../dist/engine/probe.js';
import { runProcess } from '../dist/engine/process.js';

const ids = process.argv.slice(2).filter(id => id !== '--stills');
for (const id of ids.length ? ids : ['chromatic-orbit', 'route-study', 'type-beat']) {
  if (!['chromatic-orbit', 'route-study', 'type-beat'].includes(id)) throw new Error('Unknown gallery example');
  const dir = path.resolve('examples', id), loaded = await loadProject(dir);
  const findings = await validateProject(loaded);
  if (findings.length) throw new Error(JSON.stringify({ id, findings }, null, 2));
  await mkdir(path.join(dir, 'review'), { recursive: true });
  for (const time of [0, .5, 2, 4, 6, 7.9]) await writeFile(path.join(dir, 'review', `${time}.png`), await renderFramePng(loaded.project, dir, time * 30));
  if (process.argv.includes('--stills')) { console.log(`${id}: strict validation and native review frames passed`); continue; }
  const result = await renderProject(loaded, { output: path.join(dir, `${id}.mp4`), quality: 'high', workers: 2, maxBufferedFrames: 3 });
  await runProcess('ffmpeg', ['-v', 'error', '-i', result.output, '-f', 'null', '-']);
  await makeContactSheet(result.output, path.join(dir, 'contact-sheet.png'), 6, 3);
  await writeFile(path.join(dir, 'render-report.json'), JSON.stringify({ width: result.probe.width, height: result.probe.height, fps: result.probe.frameRate, duration: result.probe.duration, codec: result.probe.videoCodec, audio: result.probe.audioCodec ?? null, strictValidation: 'passed', fullDecode: 'passed', renderId: result.renderId }, null, 2) + '\n');
  console.log(`${id}: encoded and decoded ${result.probe.width}x${result.probe.height}, ${result.probe.duration}s`);
}
