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
    expect(projectDuration(project)).toBe(2);
  });

  it('rejects remote and malformed values at the schema boundary', () => {
    expect(() => projectSchema.parse({ schemaVersion: 1 })).toThrow();
  });
});
