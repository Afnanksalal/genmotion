import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { projectSchema, renderFramePng } from '../dist/index.js';

const directory = path.resolve('output/playwright/path-morph-qa');
await mkdir(directory, { recursive: true });
const project = projectSchema.parse({ schemaVersion: 1, id: 'path-morph', title: 'Native contour morph', width: 240, height: 240, fps: 30,
  brand: { background: '#101820', foreground: '#eef4fa', accent: '#63edbd', muted: '#8392a0' },
  scenes: [{ id: 'morph', purpose: 'Check contour shape and holes throughout the interpolation', duration: 2, background: '#101820', layers: [{ id: 'shape', type: 'shape', shape: 'path', x: 30, y: 30, width: 180, height: 180, fill: '#63edbd', path: 'M0 0H100V100H0Z M20 20V80H80V20Z', tracks: [{ id: 'morph', target: 'path', keyframes: [{ at: 0, value: 'M0 0H100V100H0Z M20 20V80H80V20Z' }, { at: 1, value: 'M50 0L100 100L0 100Z M50 30L30 75L70 75Z' }] }] }] }],
});
const sheet = createCanvas(1200, 280), context = sheet.getContext('2d');
context.fillStyle = '#101820'; context.fillRect(0, 0, 1200, 280);
for (const [index, time] of [0, .25, .5, .75, 1].entries()) {
  const png = await renderFramePng(project, directory, time * project.fps);
  await writeFile(path.join(directory, `frame-${index}.png`), png);
  context.drawImage(await loadImage(png), index * 240, 0);
  context.font = '18px Arial'; context.fillStyle = '#eef4fa'; context.textAlign = 'center';
  context.fillText(`${Math.round(time * 100)}%`, index * 240 + 120, 263);
}
await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(project, null, 2));
await writeFile(path.join(directory, 'contact-sheet.png'), sheet.toBuffer('image/png'));
process.stdout.write(path.join(directory, 'contact-sheet.png') + '\n');
