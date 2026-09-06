import { createCanvas, Path2D } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { reversePath, subdividePath, extractSubpaths, warpPath } from '../src/engine/path-editing.js';
import { applyPathOperations } from '../src/engine/path-operations.js';
import { samplePath, pathMetrics } from '../src/engine/path.js';

const curve = 'M10 20 C20 0 60 90 80 40 Q90 10 95 50';
function pixels(data: string): Uint8ClampedArray {
  const context = createCanvas(100, 100).getContext('2d');
  context.fillStyle = '#fff'; context.fill(new Path2D(data));
  return context.getImageData(0, 0, 100, 100).data;
}
describe('editable native geometry', () => {
  it('reverses curves with swapped controls and preserves closed contour fills and holes', () => {
    const reverse = reversePath(curve);
    for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
      const forwardPoint = samplePath(curve, fraction), reversePoint = samplePath(reverse, 1 - fraction);
      expect(reversePoint.x).toBeCloseTo(forwardPoint.x, 1);
      expect(reversePoint.y).toBeCloseTo(forwardPoint.y, 1);
    }
    const ring = 'M5 5H95V95H5Z M20 20V80H80V20Z';
    expect(pixels(reversePath(ring))).toEqual(pixels(ring));
    expect(pathMetrics(reversePath(reversePath(curve))).length).toBeCloseTo(pathMetrics(curve).length, 3);
  });
  it('subdivides curves without replacing them with polylines and extracts independent contours', () => {
    const divided = subdividePath(curve, 8);
    expect(divided.match(/C/g)).toHaveLength(8);
    expect(divided.match(/Q/g)).toHaveLength(8);
    expect(pathMetrics(divided).length).toBeCloseTo(pathMetrics(curve).length, 1);
    expect(extractSubpaths(curve + ' M1 1L2 2', [1])).toBe('M1 1 L2 2');
    expect(() => extractSubpaths(curve, [1])).toThrow('outside');
    expect(() => extractSubpaths(curve, [0, 0])).toThrow('unique');
    expect(() => subdividePath(curve, 257)).toThrow();
    expect(() => reversePath('M1 junk')).toThrow();
  });
  it('warps corners deterministically and composes scale, translation and centering', () => {
    const square = 'M0 0H100V100H0Z';
    const warped = warpPath(square, [[10, 0], [90, 0], [100, 100], [0, 100]], 8);
    expect(pathMetrics(warped).bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(warped).toBe(warpPath(square, [[10, 0], [90, 0], [100, 100], [0, 100]], 8));
    const result = applyPathOperations(square, [{ op: 'scale', x: 2, y: 0.5, origin: [0, 0] }, { op: 'center', x: 0, y: 0 }, { op: 'translate', x: 10, y: 20 }]);
    expect(pathMetrics(result).bounds).toEqual({ x: -90, y: -5, width: 200, height: 50 });
    expect(applyPathOperations(square, [{ op: 'subpaths', indices: [] }])).toBe('');
    const cut = applyPathOperations('M0 0L100 0', [{ op: 'cut', at: 0.4 }]);
    expect(cut.match(/M/g)).toHaveLength(2);
    expect(pathMetrics(extractSubpaths(cut, [0])).length).toBeCloseTo(40, 4);
    expect(pathMetrics(extractSubpaths(cut, [1])).length).toBeCloseTo(60, 4);
  });
});
