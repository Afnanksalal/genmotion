import { describe, expect, it } from 'vitest';
import { nativePrimitiveNames, nativePrimitivePath } from '../src/engine/primitives.js';
import { parseSvgPath } from '../src/engine/svg-path.js';
import { renderFrame } from '../src/engine/draw.js';
import { projectSchema, shapeLayerSchema } from '../src/ir/schema.js';

describe('native vector primitives', () => {
  it('generates finite canonical geometry for every primitive and its boundary controls', () => {
    for (const shape of nativePrimitiveNames) {
      const layer = shapeLayerSchema.parse({ id: 'shape', type: 'shape', shape, x: 0, y: 0, width: 100, height: 100, fill: '#fff' });
      const path = nativePrimitivePath(layer)!;
      expect(parseSvgPath(path).length).toBeGreaterThan(0);
      expect(parseSvgPath(path).flatMap((command) => command.values).every(Number.isFinite)).toBe(true);
      expect(nativePrimitivePath(layer)).toBe(path);
      expect(nativePrimitivePath({ ...layer, sides: 256, innerRadius: 0, turns: 50, samples: [3, 3] })).toBeDefined();
      expect(parseSvgPath(nativePrimitivePath({ ...layer, startAngle: -Number.MAX_VALUE, endAngle: Number.MAX_VALUE, samples: [-Number.MAX_VALUE, Number.MAX_VALUE] })!).flatMap((command) => command.values).every(Number.isFinite)).toBe(true);
    }
  });

  it('keeps ring holes open and renders geometry at the local canvas dimensions', async () => {
    const project = projectSchema.parse({ schemaVersion: 1, id: 'ring', title: 'Ring', width: 100, height: 100, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' },
      scenes: [{ id: 'main', purpose: 'Native ring', duration: 1, background: '#000', layers: [{ id: 'ring', type: 'shape', shape: 'ring', x: 0, y: 0, width: 100, height: 100, fill: '#ff0000', innerRadius: 0.5 }] }],
    });
    const frame = await renderFrame(project, process.cwd(), 0);
    const red = (x: number, y: number): number => frame[(y * 100 + x) * 4]!;
    expect(red(50, 50)).toBe(0);
    expect(red(50, 10)).toBe(255);
    expect(red(2, 2)).toBe(0);
    project.scenes[0]!.layers = [shapeLayerSchema.parse({ id: 'arc', type: 'shape', shape: 'arc', x: 10, y: 10, width: 80, height: 80, stroke: '#ff0000', strokeWidth: 4 })];
    const arc = await renderFrame(project, process.cwd(), 0);
    expect(arc[(91 * 100 + 50) * 4]).toBeGreaterThan(200);
  });
});
