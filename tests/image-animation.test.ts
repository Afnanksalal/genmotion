import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { imageAnimationSchema } from '../src/ir/image-animation.js';
import { imageSourceFrame, spriteFrameRect } from '../src/engine/image-animation.js';
import { renderFrame } from '../src/engine/draw.js';
import { projectSchema } from '../src/ir/schema.js';
import { projectAssetReferences } from '../src/ir/asset-references.js';

describe('image sequences and sprite sheets', () => {
  it('maps seek time independently of output FPS, including reverse and ping-pong', () => {
    const animation = imageAnimationSchema.parse({ type: 'sequence', frames: ['a.png', 'b.png', 'c.png'], fps: 2, loop: 'ping-pong' });
    expect([0, .5, 1, 1.5, 2, 2.5].map((time) => imageSourceFrame(animation, time))).toEqual([0, 1, 2, 1, 0, 1]);
    expect(imageSourceFrame({ ...animation, reverse: true }, 0)).toBe(2);
    expect(imageSourceFrame(animation, .5 - 1e-10)).toBe(0); expect(imageSourceFrame(animation, .5)).toBe(1);
    expect(imageSourceFrame(animation, 900, 1.9)).toBe(1);
  });
  it('handles grid gutters and rejects fractional or overflowing cells', () => {
    const animation = imageAnimationSchema.parse({ type: 'sprite', columns: 2, rows: 2, count: 3, margin: 2, gap: 1 });
    if (animation.type !== 'sprite') throw new Error('Unexpected fixture');
    expect(spriteFrameRect(animation, 2, 25, 45)).toEqual({ x: 2, y: 23, width: 10, height: 20 });
    expect(() => spriteFrameRect(animation, 0, 26, 45)).toThrow(/integer/);
    expect(() => spriteFrameRect(animation, 3, 25, 45)).toThrow(/outside/);
  });
  it('renders sequence and sheet frames through the same native image path', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-image-animation-test-'));
    try {
      for (const [name, color] of [['red', '#f00'], ['blue', '#00f']]) { const canvas = createCanvas(16, 16), context = canvas.getContext('2d'); context.fillStyle = color!; context.fillRect(0, 0, 16, 16); await writeFile(path.join(directory, name + '.png'), canvas.toBuffer('image/png')); }
      const sheet = createCanvas(32, 16), context = sheet.getContext('2d'); context.fillStyle = '#f00'; context.fillRect(0, 0, 16, 16); context.fillStyle = '#00f'; context.fillRect(16, 0, 16, 16); await writeFile(path.join(directory, 'sheet.png'), sheet.toBuffer('image/png'));
      const project = projectSchema.parse({ schemaVersion: 1, id: 'sequence', title: 'Sequence', width: 64, height: 64, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Sequence', duration: 2, background: '#000', layers: [{ id: 'image', type: 'image', src: 'red.png', x: 0, y: 0, width: 32, height: 32, sourceAnimation: { type: 'sequence', frames: ['red.png', 'blue.png'], fps: 2 } }] }] });
      const pixel = (frame: Buffer) => [...frame.subarray((16 * 64 + 16) * 4, (16 * 64 + 16) * 4 + 4)];
      expect(pixel(await renderFrame(project, directory, 14.9))).toEqual([255, 0, 0, 255]); expect(pixel(await renderFrame(project, directory, 15))).toEqual([0, 0, 255, 255]);
      expect(projectAssetReferences(project)).toContain('blue.png');
      const layer = project.scenes[0]!.layers[0]!;
      if (layer.type !== 'image') throw new Error('Unexpected fixture');
      layer.src = 'sheet.png'; layer.sourceAnimation = imageAnimationSchema.parse({ type: 'sprite', columns: 2, rows: 1, count: 2, fps: 2 });
      expect(pixel(await renderFrame(project, directory, 15))).toEqual([0, 0, 255, 255]);
    } finally {
      const relative = path.relative(os.tmpdir(), directory);
      if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('genmotion-image-animation-test-')) await rm(directory, { recursive: true, force: true });
    }
  });
});
