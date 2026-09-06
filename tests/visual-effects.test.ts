import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { applyVisualEffects } from '../src/engine/effects.js';
import { projectSchema, visualEffectSchema, visualEffectTypeSchema } from '../src/ir/schema.js';
import { renderFrame } from '../src/engine/draw.js';

describe('native visual compositing', () => {
  it('preserves deterministic execution and valid pixels across every registered pass', () => {
    const source = createCanvas(32, 32), context = source.getContext('2d');
    context.fillStyle = '#f804'; context.fillRect(4, 4, 20, 20); context.fillStyle = '#00ffff'; context.fillRect(10, 10, 20, 12);
    for (const type of visualEffectTypeSchema.options) {
      const stack = [visualEffectSchema.parse({ id: 'fx', type, ...(type === 'custom' ? { kernel: { version: 1, name: 'Identity', rgba: ['r', 'g', 'b', 'a'].map((name) => ({ op: 'input', name })) } } : {}), ...(type === 'lut' ? { lut: { version: 1, kind: '1d', size: 2, data: [0, 0, 0, 1, 1, 1], inputColorSpace: 'srgb', outputColorSpace: 'srgb' } } : {}) })];
      const first = applyVisualEffects(source, stack, .35, 81), second = applyVisualEffects(source, stack, .35, 81);
      expect(first.toBuffer('image/png').equals(second.toBuffer('image/png')), type).toBe(true);
      expect(first.width).toBe(32); expect(first.height).toBe(32);
    }
  });
  it('respects effect order, bypass and premultiplied box blur', () => {
    const source = createCanvas(9, 9), context = source.getContext('2d'); context.fillStyle = '#ff0000'; context.fillRect(4, 4, 1, 1);
    const effect = (type: string, amount: number) => visualEffectSchema.parse({ id: type, type, amount });
    const blurred = applyVisualEffects(source, [effect('box-blur', 1)], 0).getContext('2d').getImageData(4, 4, 1, 1).data;
    expect(blurred[0]).toBeGreaterThan(250); expect(blurred[3]).toBeGreaterThan(20); expect(blurred[3]).toBeLessThan(35);
    const invert = effect('invert', 1), brightness = effect('brightness', .5);
    const first = applyVisualEffects(source, [invert, brightness], 0), second = applyVisualEffects(source, [brightness, invert], 0);
    expect(first.toBuffer('image/png').equals(second.toBuffer('image/png'))).toBe(false);
    expect(applyVisualEffects(source, [{ ...invert, enabled: false }], 0)).toBe(source);
  });
  it('composites adjustment regions without changing pixels outside their masks', async () => {
    const project = projectSchema.parse({ schemaVersion: 1, id: 'effects', title: 'Effects', width: 100, height: 100, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Effects', duration: 2, background: '#f00', layers: [
        { id: 'adjust', type: 'adjustment', x: 0, y: 0, width: 50, height: 100, effects: [{ id: 'invert', type: 'invert' }] },
        { id: 'top', z: 1, type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#0f0' },
      ] }],
    });
    const frame = await renderFrame(project, process.cwd(), 0);
    const pixel = (x: number, y: number) => [...frame.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 4)];
    expect(pixel(25, 50)).toEqual([0, 255, 255, 255]); expect(pixel(75, 50)).toEqual([255, 0, 0, 255]); expect(pixel(5, 5)).toEqual([0, 255, 0, 255]);
  });
  it('applies nested composition opacity once across overlapping children', async () => {
    const rectangle = { type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#fff' };
    const project = projectSchema.parse({ schemaVersion: 1, id: 'groups', title: 'Groups', width: 100, height: 100, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, compositions: [{ id: 'nested', width: 100, height: 100, duration: 2, layers: [{ ...rectangle, id: 'a' }, { ...rectangle, id: 'b', width: 50 }] }],
      scenes: [{ id: 'main', purpose: 'Opacity', duration: 2, background: '#000', layers: [{ id: 'group', type: 'composition', compositionId: 'nested', x: 0, y: 0, width: 100, height: 100, transform: { opacity: .5 } }] }],
    });
    const frame = await renderFrame(project, process.cwd(), 0);
    expect(frame[(50 * 100 + 25) * 4]).toBe(frame[(50 * 100 + 75) * 4]);
    expect(frame[(50 * 100 + 25) * 4]).toBeGreaterThanOrEqual(127); expect(frame[(50 * 100 + 25) * 4]).toBeLessThanOrEqual(128);
  });
});
