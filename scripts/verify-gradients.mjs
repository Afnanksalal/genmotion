import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectSchema, renderFramePng } from '../dist/index.js';
const directory = path.resolve('output/playwright/gradient-qa');
await mkdir(directory, { recursive: true });
const stops = [{ offset: 0, color: '#66edc0' }, { offset: .5, color: '#559aff' }, { offset: 1, color: '#9d5fe9' }];
const layers = ['linear', 'radial', 'conic'].flatMap((type, index) => [
  { id: type, type: 'shape', shape: 'round-rect', x: 20 + index * 260, y: 20, width: 240, height: 190, radius: 16, gradientFill: { type, stops } },
  { id: type + '-label', type: 'text', text: type, x: 20 + index * 260, y: 230, width: 240, height: 30, fontFamily: 'Arial', fontSize: 22, color: '#fff', align: 'center' },
]);
layers.push({ id: 'gradient-text', type: 'text', text: 'GENMOTION', x: 20, y: 285, width: 760, height: 85, fontFamily: 'Arial', fontSize: 72, fontWeight: 800, color: '#fff', align: 'center', gradientFill: { type: 'linear', stops } });
const project = projectSchema.parse({ schemaVersion: 1, id: 'gradient-qa', title: 'Native gradients', width: 800, height: 400, fps: 30,
  brand: { background: '#111820', foreground: '#fff', accent: '#66edc0', muted: '#789' }, scenes: [{ id: 'gradients', purpose: 'Inspect fill types and glyph shading', duration: 1, background: '#111820', layers }],
});
await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(project, null, 2));
await writeFile(path.join(directory, 'contact-sheet.png'), await renderFramePng(project, directory, 0));
