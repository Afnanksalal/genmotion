import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectSchema, renderFramePng } from '../dist/index.js';
import { loadProject } from '../dist/ir/loader.js';
import { renderProject } from '../dist/engine/render.js';
import { runProcess } from '../dist/engine/process.js';
import { makeContactSheet } from '../dist/engine/probe.js';
const directory = path.resolve('output/playwright/milestone-render');
await mkdir(directory, { recursive: true });
const text = 'Native motion, precise timing.';
const project = projectSchema.parse({ schemaVersion: 1, id: 'milestone-qa', title: 'Native milestone QA', width: 640, height: 360, fps: 24,
  brand: { background: '#111820', foreground: '#fff', accent: '#55d6b2', muted: '#789' },
  scenes: [{ id: 'main', purpose: 'Validate compositing and timed captions together', duration: 2, background: '#111820', layers: [
    { id: 'panel', type: 'shape', shape: 'round-rect', x: 32, y: 30, width: 576, height: 215, radius: 24,
      gradientFill: { type: 'linear', stops: [{ offset: 0, color: '#24609a' }, { offset: 1, color: '#35ac91' }] },
      masks: [{ id: 'reveal', path: 'M0 0H576V215H0Z', feather: 3 }],
      effects: [{ id: 'shadow', type: 'drop-shadow', amount: .7, radius: 10 }],
    },
    { id: 'headline', type: 'text', text: 'GENMOTION', x: 50, y: 100, width: 540, height: 72, fontFamily: 'Arial', fontWeight: 800, fontSize: 56, color: '#fff', align: 'center', effects: [{ id: 'reveal', type: 'linear-reveal', amount: { keyframes: [{ at: 0, value: 0 }, { at: .5, value: 1 }] } }] },
    { id: 'captions', type: 'caption', x: 32, y: 265, width: 576, height: 65, fontFamily: 'Arial', fontSize: 25, color: '#fff', highlightColor: '#55d6b2', highlightMode: 'karaoke', padding: 12,
      cues: [{ id: 'line', start: 0, end: 2, text, words: [{ text: 'Native', start: 0, end: .5 }, { text: 'motion,', start: .5, end: 1 }, { text: 'precise', start: 1, end: 1.5 }, { text: 'timing.', start: 1.5, end: 2 }] }] },
  ] }],
});
await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(project, null, 2));
for (const time of [.25, .75, 1.25, 1.75]) await writeFile(path.join(directory, `frame-${time}.png`), await renderFramePng(project, directory, time * project.fps));
const result = await renderProject(await loadProject(directory), { output: path.join(directory, 'milestone.mp4'), workers: 2, maxBufferedFrames: 2 });
await runProcess('ffmpeg', ['-v', 'error', '-i', result.output, '-f', 'null', '-']);
await makeContactSheet(result.output, path.join(directory, 'contact-sheet.png'), 4, 2);
console.log(JSON.stringify(result, null, 2));
