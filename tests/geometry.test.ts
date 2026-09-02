import { describe, expect, it } from 'vitest';
import { bezierPrefix, resolveAnchoredShape } from '../src/engine/geometry.js';
import { projectSchema, shapeLayerSchema } from '../src/ir/schema.js';

function anchoredProject() {
  return projectSchema.parse({
    schemaVersion: 1, id: 'geometry', title: 'Geometry', width: 320, height: 180, fps: 30,
    anchors: [{ id: 'source', x: 20, y: 30 }, { id: 'target', x: 280, y: 120 }],
    brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
    scenes: [{ id: 'one', purpose: 'Test', duration: 1, background: '#000', layers: [{ id: 'box', type: 'shape', shape: 'rect', x: 0, y: 0, width: 1, height: 1, fill: '#fff' }] }],
  });
}

const base = {
  id: 'shape', type: 'shape', start: 0, duration: 1, z: 0, visible: true,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, anchorX: 0.5, anchorY: 0.5 },
  blendMode: 'source-over', tags: [], motion: [], tracks: [], fill: undefined, stroke: '#fff', strokeWidth: 2, radius: 0, progress: 1,
};

describe('anchored geometry', () => {
  it('resolves connector endpoints from shared project anchors', () => {
    const layer = shapeLayerSchema.parse({ ...base, shape: 'bezier', x: 0, y: 0, width: 0, height: 0, startAnchor: 'source', endAnchor: 'target', control1: [80, 20], control2: [220, 130] });
    expect(resolveAnchoredShape(layer, anchoredProject())).toMatchObject({ x: 20, y: 30, width: 260, height: 90 });
  });

  it('centers markers on the exact same anchor', () => {
    const layer = shapeLayerSchema.parse({ ...base, shape: 'ellipse', x: 0, y: 0, width: 40, height: 20, centerAnchor: 'target' });
    expect(resolveAnchoredShape(layer, anchoredProject())).toMatchObject({ x: 260, y: 110 });
  });

  it('splits bezier drawing progress without moving the authored start', () => {
    const [start, , , end] = bezierPrefix([0, 0], [0, 100], [100, 100], [100, 0], 0.5);
    expect(start).toEqual([0, 0]);
    expect(end[0]).toBeCloseTo(50);
    expect(end[1]).toBeCloseTo(75);
  });
});
