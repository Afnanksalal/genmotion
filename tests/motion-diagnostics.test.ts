import { describe, expect, it } from 'vitest';
import { composedTrajectory, compareGestureTiming, diagnoseGestures, retimeGesture } from '../src/engine/motion-diagnostics.js';
import { shapeLayerSchema } from '../src/ir/schema.js';
import { gestureRecordingSchema } from '../src/ir/gesture-recording.js';

describe('composed motion diagnostics', () => {
  it('reports clocks, world samples, ownership contributions and discontinuities', () => {
    const parent = shapeLayerSchema.parse({ id: 'parent', type: 'shape', shape: 'rect', x: 0, y: 0, width: 20, height: 20, fill: '#fff', tracks: [{ id: 'parent-x', target: 'transform.x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 10 }] }] });
    const child = shapeLayerSchema.parse({ id: 'child', type: 'shape', shape: 'rect', parentId: 'parent', x: 20, y: 0, width: 10, height: 10, fill: '#fff', tracks: [{ id: 'step', target: 'transform.y', interpolation: 'discrete', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 10 }] }] });
    const report = composedTrajectory([parent, child], 'child', 2, [2, 2.5, 3]);
    expect(report.samples[1]).toMatchObject({ globalTime: 2.5, sceneTime: .5, localTime: .5, contributions: { ancestors: ['parent'] }, segments: [{ trackId: 'step', discontinuity: true }] });
    expect(report.samples[1]!.world.x).toBeGreaterThan(report.samples[0]!.world.x);
    expect(report.discontinuities.length).toBeGreaterThan(0);
  });
  it('separates strokes from jumps and retimes without changing semantic geometry', () => {
    const first = gestureRecordingSchema.parse({ version: 1, id: 'stroke-a', origin: 'user', coordinateSpace: 'layer-parent', start: 0, samples: [{ at: 0, x: 0, y: 0 }, { at: 1, x: 10, y: 0 }] });
    const second = gestureRecordingSchema.parse({ ...first, id: 'stroke-b', start: 2, samples: [{ at: 0, x: 20, y: 0 }, { at: 1, x: 30, y: 0 }] });
    expect(diagnoseGestures([first, second])).toMatchObject({ strokes: [{ id: 'stroke-a' }, { id: 'stroke-b' }], jumps: [{ fromStroke: 'stroke-a', toStroke: 'stroke-b', distance: 10, duration: 1 }] });
    const retimed = retimeGesture(first, 2); expect(retimed.samples.at(-1)!.at).toBe(2);
    expect(compareGestureTiming(first, retimed)).toMatchObject({ strokeId: 'stroke-a', coordinateSpace: 'layer-parent' });
  });
});
