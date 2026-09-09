import { describe, expect, it } from 'vitest';
import { evaluateAcceptanceAssertions } from '../src/ir/acceptance-assertions.js';
import { projectSchema } from '../src/ir/schema.js';

const project = projectSchema.parse({ schemaVersion: 1, id: 'assertions', title: 'Assertions', width: 100, height: 100, fps: 10, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Assertions', duration: 2, background: '#000', layers: [{ id: 'title', type: 'text', text: 'Readable', x: 10, y: 10, width: 80, height: 20, fontFamily: 'Arial', fontSize: 12, color: '#fff', duration: 2, motion: [{ recipe: 'masked-rise', start: 0, duration: .5 }], tracks: [{ id: 'x', target: 'transform.x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 5 }] }] }, { id: 'later', type: 'shape', shape: 'rect', x: 10, y: 40, width: 10, height: 10, fill: '#fff', start: 1 }] }] });

describe('declarative acceptance assertions', () => {
  it('evaluates all declared contracts against stable native targets', () => {
    const result = evaluateAcceptanceAssertions(project, { version: 1, assertions: [
      { id: 'appears', type: 'appearance-deadline', target: { sceneId: 'main', layerId: 'title' }, by: .6 },
      { id: 'order', type: 'ordering', target: { sceneId: 'main', layerId: 'title' }, before: { sceneId: 'main', layerId: 'later' } },
      { id: 'inside', type: 'frame-containment', target: { sceneId: 'main', layerId: 'title' }, at: .5, margin: 4 },
      { id: 'read', type: 'readable-hold', target: { sceneId: 'main', layerId: 'title' }, minimumDuration: 1.4 },
      { id: 'static', type: 'maximum-static-interval', target: { sceneId: 'main', layerId: 'title' }, maximumDuration: 1 },
    ] });
    expect(result.passed).toBe(true); expect(result.results.every(item => item.passed)).toBe(true); expect(result.disclaimer).toContain('not exhaustive aesthetic approval');
  });
  it('rejects missing/duplicate targets and prevents stillness false positives', () => {
    expect(() => evaluateAcceptanceAssertions(project, { version: 1, assertions: [{ id: 'missing', type: 'frame-containment', target: { sceneId: 'main', layerId: 'missing' }, at: 0 }] })).toThrow('resolve exactly once');
    const failed = evaluateAcceptanceAssertions(project, { version: 1, assertions: [{ id: 'still', type: 'maximum-static-interval', target: { sceneId: 'main', layerId: 'later' }, maximumDuration: .2 }] }); expect(failed.passed).toBe(false);
    for (const key of ['intentionalStillness', 'reducedMotion']) expect(evaluateAcceptanceAssertions(project, { version: 1, assertions: [{ id: key, type: 'maximum-static-interval', target: { sceneId: 'main', layerId: 'later' }, maximumDuration: .2, [key]: true }] }).passed).toBe(true);
    expect(() => evaluateAcceptanceAssertions(project, { version: 1, assertions: [{ id: 'same', type: 'appearance-deadline', target: { sceneId: 'main', layerId: 'title' }, by: 0 }, { id: 'same', type: 'appearance-deadline', target: { sceneId: 'main', layerId: 'title' }, by: 1 }] })).toThrow('unique');
  });
});
