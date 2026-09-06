import { describe, expect, it } from 'vitest';
import { animationTrackSchema } from '../src/ir/schema.js';
import { analyzeTrack } from '../src/engine/kinematics.js';

describe('native track kinematics', () => {
  it('measures scalar and vector derivatives in seconds and marks undefined boundaries', () => {
    const track = animationTrackSchema.parse({ id: 'position', target: 'x', keyframes: [{ at: 0, value: 0 }, { at: 2, value: 20 }] });
    const result = analyzeTrack(track, { samples: 3 });
    expect(result.samples[1]!.velocity![0]).toBeCloseTo(10, 7);
    expect(result.samples[1]!.acceleration![0]).toBeCloseTo(0, 5);
    expect(result.samples[0]).toMatchObject({ velocity: null, acceleration: null, discontinuity: true });
    const vector = animationTrackSchema.parse({ ...track, keyframes: [{ at: 0, value: [0, 0] }, { at: 2, value: [20, -10] }] });
    const sample = analyzeTrack(vector, { samples: 3 }).samples[1]!;
    expect(sample.velocity![0]).toBeCloseTo(10); expect(sample.velocity![1]).toBeCloseTo(-5);
    const quadratic = animationTrackSchema.parse({ ...track, keyframes: [{ at: 0, value: 0 }, { at: 2, value: 20, ease: 'quad-in' }] });
    const curved = analyzeTrack(quadratic, { samples: 3 }).samples[1]!;
    expect(curved.velocity![0]).toBeCloseTo(10, 5); expect(curved.acceleration![0]).toBeCloseTo(10, 5);
  });
  it('handles holds, identity and seeded noise with bounded numeric requests', () => {
    const track = animationTrackSchema.parse({ id: 'hold', target: 'x', extrapolate: 'identity', keyframes: [{ at: 0, value: 0, hold: true }, { at: 1, value: 10 }] });
    expect(analyzeTrack(track, { samples: 3 }).samples[1]!.velocity).toEqual([0]);
    expect(analyzeTrack(track, { start: -1, end: 2, samples: 4 }).samples[0]!.value).toBeNull();
    expect(() => analyzeTrack(track, { samples: 4097 })).toThrow();
    expect(() => analyzeTrack(track, { end: 0 })).toThrow('increasing');
    expect(() => analyzeTrack(animationTrackSchema.parse({ ...track, target: 'fill', keyframes: [{ at: 0, value: '#000' }, { at: 1, value: '#fff' }] }))).toThrow('numeric');
    const noisy = animationTrackSchema.parse({ ...track, noise: { seed: 4, amplitude: 2 } });
    expect(analyzeTrack(noisy)).toEqual(analyzeTrack(noisy));
  });
});
