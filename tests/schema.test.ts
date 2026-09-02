import { describe, expect, it } from 'vitest';
import { projectSchema, projectDuration } from '../src/ir/schema.js';

describe('project schema', () => {
  it('applies deterministic defaults', () => {
    const project = projectSchema.parse({
      schemaVersion: 1, id: 'test', title: 'Test', width: 320, height: 180, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
      scenes: [{ id: 'one', purpose: 'Test', duration: 2, background: '#000', layers: [{ id: 'box', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff' }] }],
    });
    expect(project.scenes[0]?.layers[0]?.transform.scaleX).toBe(1);
    expect(project.scenes[0]?.transitionIn.type).toBe('cut');
    expect(project.anchors).toEqual([]);
    expect(projectDuration(project)).toBe(2);
  });

  it('accepts shared geometry anchors and native bezier connectors', () => {
    const project = projectSchema.parse({
      schemaVersion: 1, id: 'anchored', title: 'Anchored', width: 320, height: 180, fps: 30,
      anchors: [{ id: 'source', x: 20, y: 80 }, { id: 'target', x: 300, y: 90 }],
      brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
      scenes: [{ id: 'one', purpose: 'Test anchors', duration: 2, background: '#000', layers: [{
        id: 'route', type: 'shape', shape: 'bezier', x: 0, y: 0, width: 0, height: 0,
        startAnchor: 'source', endAnchor: 'target', control1: [100, 30], control2: [220, 140], stroke: '#fff', strokeWidth: 3,
      }] }],
    });
    expect(project.anchors).toHaveLength(2);
    expect(project.scenes[0]?.layers[0]).toMatchObject({ shape: 'bezier', endAnchor: 'target' });
  });

  it('rejects remote and malformed values at the schema boundary', () => {
    expect(() => projectSchema.parse({ schemaVersion: 1 })).toThrow();
  });
});
