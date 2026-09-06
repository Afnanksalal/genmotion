import { describe, expect, it } from 'vitest';
import { compositionTime } from '../src/engine/composition-time.js';
import { compositionLayerSchema, compositionSchema } from '../src/ir/schema.js';

const composition = compositionSchema.parse({ id: 'clip', width: 100, height: 100, duration: 2, layers: [{ id: 'solid', type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#fff' }] });
const layer = compositionLayerSchema.parse({ id: 'instance', type: 'composition', compositionId: 'clip', x: 0, y: 0, width: 100, height: 100 });

describe('composition source time mapping', () => {
  it('holds the last source frame and handles offsets, reverse, trims and local FPS', () => {
    expect(compositionTime(layer, composition, 20, 30)).toBeCloseTo(2 - 1 / 30);
    expect(compositionTime({ ...layer, timeScale: -1, timeOffset: 2 }, composition, 0.5, 30)).toBe(1.5);
    expect(compositionTime({ ...layer, trimBefore: 0.5, trimAfter: 0.5 }, composition, 0.25, 30)).toBe(0.75);
    expect(compositionTime(layer, { ...composition, fps: 10 }, 0.19, 30)).toBe(0.1);
    expect(() => compositionTime({ ...layer, trimBefore: 1, trimAfter: 1 }, composition, 0, 30)).toThrow('entire source');
  });
  it('repeats and ping-pongs with finite counts and deterministic backwards seeking', () => {
    const repeated = { ...layer, loop: true };
    expect(compositionTime(repeated, composition, 2.5, 30)).toBe(0.5);
    expect(compositionTime(repeated, composition, -0.5, 30)).toBe(1.5);
    const ping = { ...repeated, loopMode: 'ping-pong' as const };
    expect(compositionTime(ping, composition, 2.5, 30)).toBe(1.5);
    expect(compositionTime(ping, composition, 4.5, 30)).toBe(0.5);
    expect(compositionTime({ ...ping, loopCount: 2 }, composition, 5, 30)).toBe(0);
    expect(compositionTime({ ...ping, loopCount: 3 }, composition, 8, 30)).toBeCloseTo(2 - 1 / 30);
    expect(compositionTime({ ...repeated, loopCount: 1 }, composition, 3, 30)).toBeCloseTo(2 - 1 / 30);
  });
  it('freezes entire compositions or selected intervals and evaluates declarative remapping', () => {
    const frozen = { ...layer, freeze: { frame: 15, from: 0.5, to: 1 } };
    expect(compositionTime(frozen, composition, 0.25, 30)).toBe(0.25);
    expect(compositionTime(frozen, composition, 0.75, 30)).toBe(0.5);
    expect(compositionTime(frozen, composition, 1.25, 30)).toBe(1.25);
    expect(compositionTime({ ...layer, freeze: { frame: 10 } }, { ...composition, fps: 10 }, 4, 30)).toBe(1);
    expect(compositionTime({ ...layer, timeRemap: 1.25 }, composition, 0, 30)).toBe(1.25);
    const remapped = compositionLayerSchema.parse({ ...layer, timeRemap: { keyframes: [{ at: 0, value: 1 }, { at: 1, value: 0 }] } });
    expect(compositionTime(remapped, composition, 0.5, 30)).toBeCloseTo(0.5);
    expect(() => compositionTime({ ...layer, freeze: { frame: 60 } }, composition, 0, 30)).toThrow('outside');
    expect(() => compositionTime(layer, composition, NaN, 30)).toThrow('finite');
  });
});
