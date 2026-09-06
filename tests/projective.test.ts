import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { cubeTransitionQuads, perspectiveQuad, projectPoint, quadHomography, warpCanvasQuad, type Quad } from '../src/engine/projective.js';
import { applyVisualEffects } from '../src/engine/effects.js';
import { visualEffectSchema } from '../src/ir/schema.js';

describe('native projective and reveal passes', () => {
  it('maps source corners exactly and preserves the identity surface', () => {
    const quad: Quad = [[.1, .2], [.9, .1], [.8, .9], [.2, .8]], matrix = quadHomography(quad)!;
    for (const [index, point] of ([[0, 0], [1, 0], [1, 1], [0, 1]] as const).entries()) {
      const mapped = projectPoint(matrix, point[0], point[1])!;
      expect(mapped[0]).toBeCloseTo(quad[index]![0], 10); expect(mapped[1]).toBeCloseTo(quad[index]![1], 10);
    }
    const source = createCanvas(16, 16), context = source.getContext('2d');
    context.fillStyle = '#f804'; context.fillRect(0, 0, 8, 16); context.fillStyle = '#0cf'; context.fillRect(8, 0, 8, 16);
    expect(warpCanvasQuad(source, [[0, 0], [1, 0], [1, 1], [0, 1]]).toBuffer('image/png').equals(source.toBuffer('image/png'))).toBe(true);
    const edge = warpCanvasQuad(source, perspectiveQuad(16, 16, 90)).getContext('2d').getImageData(0, 0, 16, 16).data;
    expect(edge.every((value) => value === 0)).toBe(true);
  });
  it('lands cube faces at exact transition endpoints', () => {
    const identity = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const actual of [cubeTransitionQuads(1920, 1080, 0)[0], cubeTransitionQuads(1920, 1080, 1)[1]]) {
      actual.forEach((point, index) => point.forEach((value, axis) => expect(value).toBeCloseTo(identity[index]![axis]!, 10)));
    }
  });
  it('gives every reveal exact alpha endpoints and monotonic intermediate coverage', () => {
    const source = createCanvas(24, 24), context = source.getContext('2d'); context.fillStyle = '#9878'; context.fillRect(0, 0, 24, 24);
    for (const type of ['linear-reveal', 'clock-reveal', 'iris-reveal', 'blinds', 'noise-reveal', 'pixel-dissolve', 'luma-reveal']) {
      const pixels = (amount: number) => applyVisualEffects(source, [visualEffectSchema.parse({ id: 'reveal', type, amount })], .7, 11).getContext('2d').getImageData(0, 0, 24, 24).data;
      const hidden = pixels(0), early = pixels(.25), late = pixels(.75), complete = pixels(1), original = context.getImageData(0, 0, 24, 24).data;
      for (let index = 3; index < hidden.length; index += 4) { expect(hidden[index], type).toBe(0); expect(late[index]!, type).toBeGreaterThanOrEqual(early[index]!); expect(complete[index], type).toBe(original[index]); }
    }
  });
  it('wraps tile sampling without introducing alpha seams', () => {
    const source = createCanvas(19, 13), context = source.getContext('2d'); context.fillStyle = '#f00'; context.fillRect(0, 0, 19, 13);
    const pixels = applyVisualEffects(source, [visualEffectSchema.parse({ id: 'tile', type: 'tile', amount: 2.7 })], 0).getContext('2d').getImageData(0, 0, 19, 13).data;
    for (let index = 3; index < pixels.length; index += 4) expect(pixels[index]).toBe(255);
  });
});
