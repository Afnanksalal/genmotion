import { createCanvas, Path2D } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { applyPathOperations } from '../src/engine/path-operations.js';
import { pathMetrics } from '../src/engine/path.js';
import { pathOperationsSchema } from '../src/ir/path-operations.js';
import { projectSchema } from '../src/ir/schema.js';
import { renderFrame } from '../src/engine/draw.js';

const left = 'M10 10 H60 V60 H10 Z', right = 'M40 10 H90 V60 H40 Z';
function alpha(data: string, x: number, y: number): number {
  const canvas = createCanvas(100, 100), context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fill(new Path2D(data));
  return context.getImageData(x, y, 1, 1).data[3]!;
}

describe('native geometry operations', () => {
  it('evaluates declarative operations in the native project renderer', async () => {
    const project = projectSchema.parse({ schemaVersion: 1, id: 'path-ops', title: 'Path operations', width: 100, height: 100, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' },
      scenes: [{ id: 'main', purpose: 'Boolean hole', duration: 1, background: '#000', layers: [{ id: 'shape', type: 'shape', shape: 'path', x: 10, y: 10, width: 50, height: 50, path: left, fill: '#ff0000', pathOperations: [{ op: 'subtract', path: 'M20 20H50V50H20Z' }] }] }],
    });
    const frame = await renderFrame(project, process.cwd(), 0);
    const pixel = (x: number, y: number): number[] => [...frame.subarray((y * 100 + x) * 4, (y * 100 + x) * 4 + 4)];
    expect(pixel(15, 15)).toEqual([255, 0, 0, 255]);
    expect(pixel(30, 30)).toEqual([0, 0, 0, 255]);
  });

  it('computes all boolean operations and preserves hole winding', () => {
    const samples: Record<string, number[]> = { union: [255, 255, 255], intersection: [0, 255, 0], subtract: [255, 0, 0], exclude: [255, 0, 255] };
    for (const op of ['union', 'intersection', 'subtract', 'exclude'] as const) {
      const result = applyPathOperations(left, [{ op, path: right }]);
      expect([alpha(result, 20, 20), alpha(result, 50, 20), alpha(result, 80, 20)]).toEqual(samples[op]);
      expect(applyPathOperations(left, [{ op, path: right }])).toBe(result);
    }
    const hole = applyPathOperations(left, [{ op: 'subtract', path: 'M20 20 H50 V50 H20 Z' }]);
    expect(alpha(hole, 15, 15)).toBe(255);
    expect(alpha(hole, 30, 30)).toBe(0);
    expect(applyPathOperations(left, [{ op: 'subtract', path: left }])).toBe('');
  });

  it('transforms, expands strokes and rounds arbitrary path corners natively', () => {
    expect(pathMetrics(applyPathOperations(left, [{ op: 'transform', matrix: [2, 0, 0, 3, 5, -5] }])).bounds).toEqual({ x: 25, y: 25, width: 100, height: 150 });
    const outlined = applyPathOperations('M20 30L60 30', pathOperationsSchema.parse([{ op: 'stroke', width: 10, cap: 'round', join: 'round' }]));
    expect(alpha(outlined, 18, 30)).toBe(255);
    expect(alpha(outlined, 18, 40)).toBe(0);
    const rounded = applyPathOperations(left, [{ op: 'round', radius: 10 }]);
    expect(alpha(rounded, 11, 11)).toBeLessThan(255);
    expect(alpha(rounded, 30, 30)).toBe(255);
  });

  it('trims separate contours without inventing a connector and supports dashes', () => {
    const result = applyPathOperations('M0 0L20 0M80 0L100 0', [{ op: 'trim', start: 0, end: 0.75, complement: false }]);
    expect(result.match(/M/g)).toHaveLength(2);
    expect(pathMetrics(result).length).toBeCloseTo(30, 4);
    const dashed = applyPathOperations('M0 0L100 0', [{ op: 'dash', on: 10, off: 10, phase: 0 }]);
    expect(pathMetrics(dashed).length).toBeCloseTo(50, 4);
    expect(() => applyPathOperations(left, [{ op: 'union', path: 'bad data' }])).toThrow('SVG path');
    expect(() => pathOperationsSchema.parse([{ op: 'trim', start: 0.8, end: 0.2 }])).toThrow('precede');
  });
});
