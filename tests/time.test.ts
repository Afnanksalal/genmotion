import { describe, expect, it } from 'vitest';
import { framesToSeconds, secondsToFrames, quantizeTime, progressAt } from '../src/engine/time.js';
import { renderFrame } from '../src/engine/draw.js';
import { projectSchema } from '../src/ir/schema.js';

describe('frame-rate independent time', () => {
  it('preserves subframes, quantizes explicitly and rejects invalid clocks', () => {
    expect(secondsToFrames(0.35, 30)).toBe(10.5);
    expect(framesToSeconds(10.5, 30)).toBe(0.35);
    expect(secondsToFrames(-0.35, 30, 'floor')).toBe(-11);
    expect(secondsToFrames(0.35, 30, 'ceil')).toBe(11);
    expect(quantizeTime(.35, 30)).toBe(11 / 30);
    expect(progressAt(1.5, 1, 1)).toBe(.5);
    expect(progressAt(4, 1, 1)).toBe(1);
    expect(progressAt(-1, 1, 1, false)).toBe(-2);
    expect(() => framesToSeconds(1, 0)).toThrow('FPS');
    expect(() => secondsToFrames(1e308, 30)).toThrow('finite');
    expect(() => progressAt(0, 0, 0)).toThrow('positive');
  });
  it('renders the same exact timestamp at different FPS with distinct fractional-frame pixels', async () => {
    const project = projectSchema.parse({ schemaVersion: 1, id: 'time', title: 'Time', width: 100, height: 100, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Subframe position', duration: 1, background: '#000', layers: [{ id: 'box', type: 'shape', shape: 'rect', fill: '#fff', width: 10, height: 10, x: 0, y: 40, tracks: [{ id: 'move', target: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 90 }] }] }] }] });
    const exact = await renderFrame(project, process.cwd(), 10.5);
    expect(exact.equals(await renderFrame({ ...project, fps: 60 }, process.cwd(), 21))).toBe(true);
    expect(exact.equals(await renderFrame(project, process.cwd(), 10))).toBe(false);
    await expect(renderFrame(project, process.cwd(), NaN)).rejects.toThrow('finite');
    await expect(renderFrame(project, process.cwd(), -1)).rejects.toThrow('nonnegative');
  });
});
