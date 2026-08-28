import { describe, expect, it } from 'vitest';
import { deterministicNoise, evaluateNumber } from '../src/engine/timeline.js';

describe('timeline', () => {
  it('interpolates keyframes and clamps their boundaries', () => {
    const value = { keyframes: [{ at: 0, value: 0, ease: 'linear' as const }, { at: 1, value: 10, ease: 'linear' as const }] };
    expect(evaluateNumber(value, -1)).toBe(0);
    expect(evaluateNumber(value, 0.5)).toBe(5);
    expect(evaluateNumber(value, 2)).toBe(10);
  });

  it('produces stable seeded noise', () => {
    expect(deterministicNoise(42, 5)).toBe(deterministicNoise(42, 5));
    expect(deterministicNoise(42, 5)).not.toBe(deterministicNoise(42, 6));
  });
});
