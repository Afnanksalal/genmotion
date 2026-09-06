import { describe, expect, it } from 'vitest';
import { createCanvas, DOMMatrix } from '@napi-rs/canvas';
import { layerMaskSchema } from '../src/ir/schema.js';
import { applyLayerMasks, evaluateMaskPath, validateLayerMasks } from '../src/engine/masks.js';

describe('native masks', () => {
  it('combines alpha masks in ordered add/subtract/intersect/exclude modes', () => {
    const source = createCanvas(40, 20), context = source.getContext('2d'); context.fillStyle = '#f00'; context.fillRect(0, 0, 40, 20);
    const left = layerMaskSchema.parse({ id: 'left', path: 'M0 0H25V20H0Z' });
    const middle = layerMaskSchema.parse({ id: 'middle', path: 'M15 0H35V20H15Z' });
    for (const mode of ['add', 'subtract', 'intersect', 'exclude'] as const) {
      const pixels = applyLayerMasks(source, [left, { ...middle, mode }], 0, new DOMMatrix()).getContext('2d').getImageData(0, 0, 40, 20).data;
      const alpha = (x: number) => pixels[(10 * 40 + x) * 4 + 3];
      expect(alpha(20), mode).toBe(mode === 'subtract' || mode === 'exclude' ? 0 : 255);
      expect(alpha(5), mode).toBe(mode === 'intersect' ? 0 : 255);
      expect(alpha(30), mode).toBe(mode === 'add' || mode === 'exclude' ? 255 : 0);
    }
  });
  it('validates animated topology and transforms path coverage', () => {
    const mask = layerMaskSchema.parse({ id: 'moving', path: { keyframes: [{ at: 0, value: 'M0 0H10V10H0Z' }, { at: 1, value: 'M10 0H20V10H10Z' }] } });
    expect(() => validateLayerMasks([mask])).not.toThrow(); expect(evaluateMaskPath(mask, .5)).not.toBe(evaluateMaskPath(mask, 0));
    const source = createCanvas(40, 20), context = source.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 40, 20);
    const pixels = applyLayerMasks(source, [mask], 0, new DOMMatrix().translate(20, 0)).getContext('2d').getImageData(0, 0, 40, 20).data;
    expect(pixels[(5 * 40 + 5) * 4 + 3]).toBe(0); expect(pixels[(5 * 40 + 25) * 4 + 3]).toBe(255);
    expect(() => validateLayerMasks([{ ...mask, path: { keyframes: [{ at: 1, value: 'M0 0L1 1', ease: 'linear' }, { at: 0, value: 'M0 0Z', ease: 'linear' }] } }])).toThrow();
  });
});
