import { svgPathProperties } from 'svg-path-properties';
import { Path2D } from '@napi-rs/canvas';

export interface PathSample { x: number; y: number; angle: number; normalX: number; normalY: number }

export function pathMetrics(data: string): { length: number; bounds: { x: number; y: number; width: number; height: number } } {
  const properties = new svgPathProperties(data);
  const length = properties.getTotalLength();
  const [left, top, right, bottom] = new Path2D(data).getBounds();
  return { length, bounds: { x: left, y: top, width: right - left, height: bottom - top } };
}

export function samplePath(data: string, progress: number): PathSample {
  const properties = new svgPathProperties(data);
  const length = properties.getTotalLength();
  const distance = Math.max(0, Math.min(1, progress)) * length;
  const point = properties.getPointAtLength(distance);
  const tangent = properties.getTangentAtLength(distance);
  return { x: point.x, y: point.y, angle: Math.atan2(tangent.y, tangent.x) * 180 / Math.PI, normalX: -tangent.y, normalY: tangent.x };
}

export function flattenPath(data: string, start = 0, end = 1, tolerance = 1): Array<[number, number]> {
  const properties = new svgPathProperties(data);
  const length = properties.getTotalLength();
  const from = Math.max(0, Math.min(1, start));
  const to = Math.max(from, Math.min(1, end));
  const segmentLength = (to - from) * length;
  const count = Math.max(1, Math.min(8192, Math.ceil(segmentLength / Math.max(0.1, tolerance))));
  return Array.from({ length: count + 1 }, (_, index) => {
    const point = properties.getPointAtLength(length * (from + (to - from) * index / count));
    return [point.x, point.y];
  });
}

/** Canonical absolute M/L representation at a declared geometric tolerance. */
export function normalizePath(data: string, tolerance = 0.5): string {
  return flattenPath(data, 0, 1, tolerance).map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(4)} ${point[1].toFixed(4)}`).join(' ');
}
