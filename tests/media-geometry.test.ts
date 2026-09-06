import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { mediaSourceCrop, mediaRoundedPath } from '../src/engine/media-geometry.js';
import { imageLayerSchema } from '../src/ir/schema.js';

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
});
