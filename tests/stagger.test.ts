import { describe, expect, it } from 'vitest';
import { staggerDelay, staggerSchedule, staggerWindows } from '../src/engine/procedural.js';
import { effectiveLayerStart, resolveLayerGraph } from '../src/engine/constraints.js';
import { projectSchema, shapeLayerSchema, staggerSchema } from '../src/ir/schema.js';
import { renderFrame } from '../src/engine/draw.js';

describe('bounded spatial stagger timing', () => {
  it('schedules distances, seeded permutations and explicit delay/trail windows', () => {
    const options = { from: 'distance' as const, each: 0.1, seed: 0, trail: 0.2, delay: 0.3, origin: [0, 0] as [number, number], distanceUnit: 100, positions: [[0, 0], [300, 400]] as Array<[number, number]> };
    expect(staggerSchedule(2, options)).toEqual([0.3, 0.8]);
    expect(staggerWindows(2, options)[1]).toMatchObject({ index: 1, delay: 0.8, trailStart: 0.8, trailEnd: 1 });
    expect(staggerDelay(staggerSchema.parse({ index: 0, count: 1, from: 'distance', position: [300, 400], each: 0.1, delay: 0.3 }))).toBe(0.8);
    expect(() => staggerSchedule(3, options)).toThrow('one position');
    expect(() => staggerSchedule(100_001, options)).toThrow('100000');
    const random = { from: 'random' as const, each: 1, seed: 42, trail: 0 };
    const a = staggerSchedule(1000, random);
    expect(new Set(a).size).toBe(1000);
    expect(staggerSchedule(1000, random)).toEqual(a);
    expect(staggerSchedule(1000, { ...random, seed: 43 })).not.toEqual(a);
    expect(staggerSchedule(10, { ...random, from: 'start', ease: 'back-in' }).every((delay) => delay >= 0)).toBe(true);
    expect(() => staggerSchedule(3, { ...random, each: 1e308 })).toThrow('finite');
    expect(() => staggerWindows(1, { ...random, delay: 1e308, trail: 1e308 })).toThrow('finite');
  });
  it('freezes distance at authored geometry when tracks later animate the layer position', async () => {
    const layer = shapeLayerSchema.parse({ id: 'dot', type: 'shape', shape: 'rect', x: 40, y: 40, width: 20, height: 20, fill: '#fff', stagger: { index: 0, count: 1, from: 'distance', origin: [0, 50], each: 1, distanceUnit: 100 }, tracks: [{ id: 'move', target: 'x', keyframes: [{ at: 0, value: 40 }, { at: 1, value: 70 }] }] });
    expect(effectiveLayerStart(layer)).toBe(0.5);
    const resolved = resolveLayerGraph([layer], 1, 0)[0]!;
    expect(effectiveLayerStart(resolved)).toBe(0.5);
    expect(layer.stagger?.position).toBeUndefined();
    const project = projectSchema.parse({ schemaVersion: 1, id: 'distance', title: 'Distance', width: 100, height: 100, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Stagger', duration: 2, background: '#000', layers: [layer] }] });
    const before = await renderFrame(project, process.cwd(), 14), after = await renderFrame(project, process.cwd(), 15);
    expect(before[(50 * 100 + 50) * 4]).toBe(0);
    expect(after[(50 * 100 + 50) * 4]).toBe(255);
  });
});
