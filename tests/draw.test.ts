import { describe, expect, it } from 'vitest';
import { canvasFontWeight } from '../src/engine/draw.js';

describe('native text rendering', () => {
  it('normalizes arbitrary schema-valid numeric weights to Skia-safe CSS weights', () => {
    expect(canvasFontWeight(100)).toBe(100);
    expect(canvasFontWeight(450)).toBe(500);
    expect(canvasFontWeight(650)).toBe(700);
    expect(canvasFontWeight(850)).toBe(900);
    expect(canvasFontWeight('normal')).toBe('normal');
    expect(canvasFontWeight('bold')).toBe('bold');
  });
});
