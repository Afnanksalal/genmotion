import { describe, expect, it } from 'vitest';
import { evaluateTrack } from '../src/engine/animation.js';
import { analyzeSpring, ease, easingPresets, measureSpringDuration, mirrorEasingSample, reverseEasingSample } from '../src/engine/easing.js';
import { interpolateAnimationValue } from '../src/engine/interpolation.js';
import { fractalNoise, noiseND, seededRandom, staggerDelay, staggerSchedule, staggerWindows } from '../src/engine/procedural.js';
import { layerDependencyCycles, resolveLayerGraph } from '../src/engine/constraints.js';
import { projectSchema, type AnimationTrack } from '../src/ir/schema.js';

const track = (overrides: Partial<AnimationTrack> = {}): AnimationTrack => ({
  id: 'value', target: 'transform.x', operation: 'replace', extrapolate: 'clamp', enabled: true,
  keyframes: [{ at: 0, value: 0, ease: 'linear' }, { at: 1, value: 10, ease: 'linear' }],
  ...overrides,
});

describe('typed animation kernel', () => {
  it('interpolates numbers, perceptual colors, points, rectangles, and shortest angles', () => {
    expect(interpolateAnimationValue(0, 10, 0.25)).toBe(2.5);
    expect(interpolateAnimationValue([0, 10], [10, 30], 0.5)).toEqual([5, 20]);
    expect(interpolateAnimationValue([0, 10, 20, 30], [10, 20, 40, 50], 0.5)).toEqual([5, 15, 30, 40]);
    expect(interpolateAnimationValue(350, 10, 0.5, 'shortest-angle')).toBe(360);
    expect(String(interpolateAnimationValue('#ff0000', '#0000ff', 0.5))).toMatch(/^rgb/);
  });

  it('supports holds and independent extrapolation on either side', () => {
    expect(evaluateTrack(track({ keyframes: [{ at: 0, value: 0, ease: 'linear', hold: true }, { at: 1, value: 10, ease: 'linear' }] }), 0.8)).toBe(0);
    expect(evaluateTrack(track({ extrapolateLeft: 'extend', extrapolateRight: 'identity' }), -1)).toBe(-10);
    expect(evaluateTrack(track({ extrapolateLeft: 'extend', extrapolateRight: 'identity' }), 2)).toBeUndefined();
    expect(evaluateTrack(track({ extrapolate: 'ping-pong' }), 1.5)).toBe(5);
    expect(evaluateTrack(track({ extrapolate: 'wrap' }), 1.25)).toBe(2.5);
  });

  it('measures, normalizes, clamps, reverses, and mirrors spring/easing curves', () => {
    const duration = measureSpringDuration(easingPresets.settled);
    expect(duration).toBeGreaterThan(0.1);
    expect(duration).toBeLessThan(5);
    const analysis = analyzeSpring(easingPresets.expressive, 48);
    expect(analysis.samples).toHaveLength(48);
    expect(analysis.overshoot).toBeGreaterThan(0);
    expect(ease(easingPresets.settled, 1)).toBe(1);
    expect(reverseEasingSample('quad-in', 0.4)).toBeCloseTo(ease('quad-out', 0.4), 8);
    expect(mirrorEasingSample('quad-in', 0.5)).toBeCloseTo(0.5, 8);
  });

  it('provides deterministic seeded randomness, 1D-4D noise, octaves, and stagger schedules', () => {
    expect(seededRandom(44, 2)).toBe(seededRandom(44, 2));
    expect(noiseND(3, [0.1, 0.2, 0.3, 0.4])).toBe(noiseND(3, [0.1, 0.2, 0.3, 0.4]));
    expect(fractalNoise(3, [0.25, 0.75], { octaves: 4, lacunarity: 2, gain: 0.5 })).toBeTypeOf('number');
    expect(staggerSchedule(5, { each: 0.1, from: 'center', seed: 0, trail: 0 })).toEqual([0.2, 0.1, 0, 0.1, 0.2]);
    expect(staggerDelay({ index: 3, count: 4, each: 0.2, from: 'end', seed: 0, trail: 0 })).toBe(0);
    expect(staggerWindows(2, { each: 0.2, from: 'start', seed: 0, trail: 0.5 })[1]).toEqual({ index: 1, delay: 0.2, trailStart: 0.2, trailEnd: 0.7 });
    expect(staggerSchedule(8, { each: 0.1, from: 'random', seed: 9, trail: 0 })).toEqual(staggerSchedule(8, { each: 0.1, from: 'random', seed: 9, trail: 0 }));
  });

  it('resolves transform inheritance and four declarative constraint modes', () => {
    const project = projectSchema.parse({
      schemaVersion: 1, id: 'constraints', title: 'Constraints', width: 600, height: 400, fps: 30, seed: 2,
      brand: { background: '#000', foreground: '#fff', accent: '#0ff', muted: '#888', fonts: [], radius: 12, tone: [] },
      scenes: [{ id: 'scene', purpose: 'constraints', duration: 2, background: '#000', layers: [
        { id: 'parent', type: 'shape', shape: 'rect', x: 100, y: 100, width: 100, height: 100, fill: '#fff', transform: { x: 50, rotation: 0 }, duration: 2 },
        { id: 'child', type: 'shape', shape: 'rect', x: 250, y: 120, width: 20, height: 20, fill: '#fff', parentId: 'parent', duration: 2 },
        { id: 'follow', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff', constraints: [{ type: 'follow', target: 'parent', offsetX: 20, offsetY: 0 }], duration: 2 },
        { id: 'distance', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff', constraints: [{ type: 'maintain-distance', target: 'parent', distance: 100, angle: 0 }], duration: 2 },
        { id: 'look', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff', constraints: [{ type: 'look-at', target: 'parent', angleOffset: 0 }], duration: 2 },
        { id: 'anchor', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff', constraints: [{ type: 'anchor-to', target: 'parent', ownAnchor: 'center', targetAnchor: 'bottom-right', offsetX: 5, offsetY: 5 }], duration: 2 },
      ] }],
    });
    const resolved = Object.fromEntries(resolveLayerGraph(project.scenes[0]!.layers, 0, project.seed).map((layer) => [layer.id, layer]));
    expect(resolved.child!.transform.x).toBeCloseTo(50);
    expect(resolved.follow!.transform.x).toBeCloseTo(215);
    expect(resolved.distance!.transform.x).toBeCloseTo(295);
    expect(resolved.look!.transform.rotation).toBeCloseTo(36.64, 1);
    expect(resolved.anchor!.transform.x).toBeCloseTo(250);
    expect(layerDependencyCycles(project.scenes[0]!.layers)).toEqual([]);
  });
});
