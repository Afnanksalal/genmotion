import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { mediaSourceCrop, mediaRoundedPath } from '../src/engine/media-geometry.js';
import { imageLayerSchema, projectSchema } from '../src/ir/schema.js';
import { renderFrame } from '../src/engine/draw.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('media geometry', () => {
  it('evaluates ratio crop animation at source time and rejects source overflow', () => {
    const layer = imageLayerSchema.parse({ id: 'image', type: 'image', src: 'a.png', x: 0, y: 0, width: 100, height: 100, crop: { x: { keyframes: [{ at: 0, value: 0 }, { at: 1, value: .5 }] }, y: 0, width: .5, height: 1, unit: 'ratio' } });
    expect(mediaSourceCrop(layer, 1920, 1080, .5)).toEqual({ x: 480, y: 0, width: 960, height: 1080 });
    expect(mediaSourceCrop(layer, 1920, 1080, 1)).toEqual({ x: 960, y: 0, width: 960, height: 1080 });
    expect(() => mediaSourceCrop({ crop: { x: 100, y: 0, width: 101, height: 200 } }, 200, 200, 0)).toThrow(/inside/);
  });
  it('keeps independent square corners while rounding only selected corners', () => {
    const canvas = createCanvas(100, 100), context = canvas.getContext('2d');
    mediaRoundedPath(context, 0, 0, 100, 100, [40, 0, 40, 0]); context.fillStyle = '#fff'; context.fill();
    const alpha = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[3];
    expect(alpha(0, 0)).toBe(0); expect(alpha(99, 99)).toBe(0); expect(alpha(99, 0)).toBe(255); expect(alpha(0, 99)).toBe(255); expect(alpha(50, 50)).toBe(255);
  });
  it('renders animated inner borders inside rounded media without spilling outside', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-border-'));
    try {
      const canvas = createCanvas(16, 16), context = canvas.getContext('2d'); context.fillStyle = '#f00'; context.fillRect(0, 0, 16, 16);
      await writeFile(path.join(directory, 'red.png'), canvas.toBuffer('image/png'));
      const project = projectSchema.parse({ id: 'border', title: 'Border', schemaVersion: 1, width: 64, height: 64, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Border', duration: 1, background: '#000', layers: [{ id: 'image', type: 'image', src: 'red.png', x: 8, y: 8, width: 48, height: 48, cornerRadii: [12, 0, 12, 0], border: { color: '#0f0', width: { keyframes: [{ at: 0, value: 0 }, { at: 1, value: 8 }] } } }] }] });
      const frame = await renderFrame(project, directory, 15), first = await renderFrame(project, directory, 0);
      const pixel = (buffer: Buffer, x: number, y: number) => [...buffer.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3)];
      expect(pixel(frame, 6, 32)).toEqual([0, 0, 0]); expect(pixel(frame, 8, 8)).toEqual([0, 0, 0]);
      expect(pixel(frame, 10, 32)).toEqual([0, 255, 0]); expect(pixel(first, 10, 32)).toEqual([255, 0, 0]); expect(pixel(frame, 32, 32)).toEqual([255, 0, 0]);
    } finally { const relative = path.relative(os.tmpdir(), directory); if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('genmotion-border-')) await rm(directory, { recursive: true, force: true }); }
  });
});
