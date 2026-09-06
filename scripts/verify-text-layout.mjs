import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectSchema, renderFramePng, measureTextLayer } from '../dist/index.js';
const directory = path.resolve('output/playwright/text-layout-qa');
await mkdir(directory, { recursive: true });
const panels = [
  { text: 'Every word stays in this complete headline', maxLines: 2, fit: 'shrink' },
  { text: 'Supercalifragilisticexpialidocious', maxLines: 3, fit: 'shrink' },
  { text: 'AUTOMATIC\nBOX HEIGHT', autoSize: 'height', fit: 'none', fontSize: 30 },
];
const layers = panels.flatMap((settings, index) => [
  { id: 'box-' + index, type: 'shape', shape: 'rect', x: 30 + index * 300, y: 60, width: 270, height: 130, fill: '#1a2838', stroke: '#557999', strokeWidth: 1 },
  { id: 'text-' + index, type: 'text', x: 40 + index * 300, y: 70, width: 250, height: 110, fontFamily: 'Arial', fontSize: 48, fontWeight: 700, color: '#ffffff', ...settings },
]);
const project = projectSchema.parse({ schemaVersion: 1, id: 'text-qa', title: 'Native text fit', width: 940, height: 240, fps: 30, brand: { background: '#101820', foreground: '#fff', accent: '#68dfcb', muted: '#789' }, scenes: [{ id: 'text', duration: 1, purpose: 'Verify complete text and fitted line boxes', background: '#101820', layers }] });
await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(project, null, 2));
await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(project.scenes[0].layers.filter(layer => layer.type === 'text').map(measureTextLayer), null, 2));
await writeFile(path.join(directory, 'contact-sheet.png'), await renderFramePng(project, directory, 0));
