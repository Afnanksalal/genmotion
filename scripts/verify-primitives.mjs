import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nativePrimitiveNames, projectSchema, renderFramePng } from '../dist/index.js';

const directory = path.resolve('output/playwright/primitive-qa');
await mkdir(directory, { recursive: true });
const layers = [];
for (const [index, shape] of nativePrimitiveNames.entries()) {
  const x = 30 + index % 5 * 194, y = 26 + Math.floor(index / 5) * 238;
  layers.push({ id: `panel-${shape}`, type: 'shape', shape: 'round-rect', x, y, width: 180, height: 218, radius: 14, fill: '#1b2530' });
  const open = ['arc', 'spiral', 'waveform', 'line-chart'].includes(shape);
  layers.push({ id: shape, type: 'shape', shape, x: x + 20, y: y + 18, width: 140, height: 140, radius: 14,
    ...(open ? { stroke: '#63edbd', strokeWidth: 3 } : { fill: '#63edbd' }),
    ...(shape === 'waveform' ? { samples: Array.from({ length: 80 }, (_, sample) => Math.sin(sample * 0.72) * Math.sin(sample / 79 * Math.PI)) } : {}),
  });
  layers.push({ id: `label-${shape}`, type: 'text', text: shape, x: x + 8, y: y + 177, width: 164, height: 28, fontFamily: 'Arial', fontSize: 16, color: '#f0f4f8', align: 'center' });
}
const project = projectSchema.parse({ schemaVersion: 1, id: 'native-primitives', title: 'Native vector primitives', width: 1000, height: 752, fps: 30,
  brand: { background: '#0e141b', foreground: '#f0f4f8', accent: '#63edbd', muted: '#8091a5' },
  scenes: [{ id: 'primitives', purpose: 'Inspect local vector geometry and contour topology', duration: 2, background: '#0e141b', layers }],
});
await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(project, null, 2));
await writeFile(path.join(directory, 'contact-sheet.png'), await renderFramePng(project, directory, 0));
process.stdout.write(path.join(directory, 'contact-sheet.png') + '\n');
