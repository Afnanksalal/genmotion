import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { gradientSchema } from '../src/ir/paint.js';
import { createGradient, interpolateGradient } from '../src/engine/paint.js';
import { projectSchema } from '../src/ir/schema.js';
import { renderFrame } from '../src/engine/draw.js';

const gradient = gradientSchema.parse({ type: 'linear', stops: [{ offset: 0, color: '#f00' }, { offset: 1, color: '#00f' }] });
describe('native gradient paint', () => {
  it('renders each gradient kind with native color and alpha', () => {
    for (const type of ['linear', 'radial', 'conic'] as const) {
      const context = createCanvas(100, 100).getContext('2d');
      context.fillStyle = createGradient(context, { ...gradient, type }, { x: 0, y: 0, width: 100, height: 100 });
      context.fillRect(0, 0, 100, 100);
      const pixels = context.getImageData(0, 0, 100, 100).data;
      expect(pixels.filter((_, index) => index % 4 === 3).every((value) => value === 255)).toBe(true);
      expect(new Set(pixels.filter((_, index) => index % 4 === 0)).size).toBeGreaterThan(20);
    }
    const context = createCanvas(100, 10).getContext('2d');
    context.fillStyle = createGradient(context, { ...gradient, stops: [{ offset: 0, color: '#ff000000' }, { offset: 1, color: '#ff0000' }] }, { x: 0, y: 0, width: 100, height: 10 });
    context.fillRect(0, 0, 100, 10);
    expect(context.getImageData(0, 0, 1, 1).data[3]).toBeLessThan(5);
    expect(context.getImageData(99, 0, 1, 1).data[3]).toBeGreaterThan(250);
    const rotated = createCanvas(100, 100).getContext('2d');
    rotated.fillStyle = createGradient(rotated, { ...gradient, type: 'conic', angle: 0 }, { x: 0, y: 0, width: 100, height: 100 });
    rotated.fillRect(0, 0, 100, 100);
    expect(rotated.getImageData(99, 50, 1, 1).data[0]).toBeGreaterThan(250);
    rotated.fillStyle = createGradient(rotated, { ...gradient, type: 'conic', angle: 180 }, { x: 0, y: 0, width: 100, height: 100 });
    rotated.fillRect(0, 0, 100, 100);
    expect(rotated.getImageData(99, 50, 1, 1).data[0]).toBeLessThan(150);
  });
  it('interpolates stop positions and perceptual colors while refusing incompatible gradients', () => {
    const end = gradientSchema.parse({ ...gradient, angle: 90, stops: [{ offset: 0.2, color: '#0f0' }, { offset: 0.8, color: '#fff' }] });
    const mid = interpolateGradient(gradient, end, 0.5);
    expect(mid.angle).toBe(45); expect(mid.stops.map((stop) => stop.offset)).toEqual([0.1, 0.9]);
    expect(mid.stops[0]?.color).not.toBe(gradient.stops[0]?.color);
    expect(() => interpolateGradient(gradient, { ...end, type: 'radial' }, 0.5)).toThrow('types');
    expect(() => interpolateGradient(gradient, { ...end, stops: [...end.stops, { offset: 1, color: '#fff' }] }, 0.5)).toThrow('counts');
    expect(() => gradientSchema.parse({ ...gradient, stops: [...gradient.stops].reverse() })).toThrow('ordered');
  });
  it('evaluates gradient animation through the native frame renderer', async () => {
    const project = projectSchema.parse({ schemaVersion: 1, id: 'gradient', title: 'Gradient', width: 100, height: 100, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Gradient', duration: 2, background: '#000', layers: [{ id: 'paint', type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100, gradientFill: gradient,
        tracks: [{ id: 'gradient-turn', target: 'gradientFill', keyframes: [{ at: 0, value: gradient }, { at: 1, value: { ...gradient, angle: 90 } }] }],
      }] }],
    });
    const first = await renderFrame(project, process.cwd(), 0), mid = await renderFrame(project, process.cwd(), 15), last = await renderFrame(project, process.cwd(), 30);
    expect(mid.equals(first)).toBe(false); expect(mid.equals(last)).toBe(false);
    expect((await renderFrame(project, process.cwd(), 15)).equals(mid)).toBe(true);
    expect(first[(50 * 100) * 4]).toBeGreaterThan(250);
    expect(last[(50 * 100) * 4]).toBeLessThan(200);
  });
});
