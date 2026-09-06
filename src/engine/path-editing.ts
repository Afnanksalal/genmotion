import { Path2D } from '@napi-rs/canvas';
import { absoluteSvgPath, serializeSvgPath, type SvgPathCommand } from './svg-path.js';

type Point = [number, number];
interface Contour { start: Point; segments: Point[][]; closed: boolean }
function contours(data: string): Contour[] {
  const result: Contour[] = [];
  let current: Contour | undefined, cursor: Point = [0, 0];
  // Skia converts elliptical arcs to its native Bezier representation.
  for (const command of absoluteSvgPath(new Path2D(serializeSvgPath(absoluteSvgPath(data))).toSVGString())) {
    const v = command.values;
    if (command.command === 'M') { cursor = [v[0]!, v[1]!]; current = { start: cursor, segments: [], closed: false }; result.push(current); }
    else if (command.command === 'Z') { if (current) { current.closed = true; cursor = current.start; } }
    else if (current) {
      if (!['L', 'Q', 'C'].includes(command.command)) throw new Error('Unsupported native curve command');
      const points: Point[] = [cursor];
      for (let index = 0; index < v.length; index += 2) points.push([v[index]!, v[index + 1]!]);
      current.segments.push(points); cursor = points.at(-1)!;
    }
  }
  return result;
}
function serialize(contourList: Contour[]): string {
  const commands: SvgPathCommand[] = [];
  for (const contour of contourList) {
    commands.push({ command: 'M', values: contour.start });
    for (const segment of contour.segments) commands.push({ command: segment.length === 4 ? 'C' : segment.length === 3 ? 'Q' : 'L', values: segment.slice(1).flat() });
    if (contour.closed) commands.push({ command: 'Z', values: [] });
  }
  if (commands.length > 100_000) throw new Error('Edited path exceeds 100000 commands');
  return serializeSvgPath(commands);
}
function split(points: Point[], fraction: number): [Point[], Point[]] {
  const left: Point[] = [points[0]!], right: Point[] = [points.at(-1)!];
  let row = points;
  while (row.length > 1) {
    row = row.slice(1).map((point, index): Point => [row[index]![0] * (1 - fraction) + point[0] * fraction, row[index]![1] * (1 - fraction) + point[1] * fraction]);
    left.push(row[0]!); right.unshift(row.at(-1)!);
  }
  return [left, right];
}
export function reversePath(data: string): string {
  return serialize(contours(data).map((contour) => ({ ...contour, start: contour.segments.at(-1)?.at(-1) ?? contour.start, segments: contour.segments.toReversed().map((segment) => segment.toReversed()) })));
}
export function extractSubpaths(data: string, indices: number[]): string {
  const list = contours(data);
  if (indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= list.length)) throw new Error('Subpath index is outside the path');
  if (new Set(indices).size !== indices.length) throw new Error('Subpath indices must be unique');
  return serialize(indices.map((index) => list[index]!));
}
export function subdividePath(data: string, divisions: number): string {
  if (!Number.isSafeInteger(divisions) || divisions < 1 || divisions > 256) throw new Error('Subdivision count must be between 1 and 256');
  const list = contours(data);
  if (list.reduce((count, contour) => count + 2 + contour.segments.length * divisions, 0) > 100_000) throw new Error('Subdivision exceeds 100000 commands');
  for (const contour of list) contour.segments = contour.segments.flatMap((segment) => {
    const result: Point[][] = []; let rest = segment;
    for (let remaining = divisions; remaining > 1; remaining--) { const [left, right] = split(rest, 1 / remaining); result.push(left); rest = right; }
    result.push(rest); return result;
  });
  return serialize(list);
}

/** Bilinear corner warp with deterministic curve subdivision before mapping. */
export function warpPath(data: string, corners: [Point, Point, Point, Point], divisions: number): string {
  if (corners.flat().some((value) => !Number.isFinite(value))) throw new Error('Warp corners must be finite');
  const [left, top, right, bottom] = new Path2D(data).getBounds();
  const map = ([x, y]: Point): Point => {
    const u = right === left ? 0.5 : (x - left) / (right - left), v = bottom === top ? 0.5 : (y - top) / (bottom - top);
    const weights = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
    return [0, 1].map((axis) => corners.reduce((sum, point, index) => sum + point[axis]! * weights[index]!, 0)) as Point;
  };
  const source = contours(data);
  for (const contour of source) {
    const end = contour.segments.at(-1)?.at(-1);
    if (contour.closed && end && (end[0] !== contour.start[0] || end[1] !== contour.start[1])) contour.segments.push([end, contour.start]);
  }
  return serialize(contours(subdividePath(serialize(source), divisions)).map((contour) => ({ ...contour, start: map(contour.start), segments: contour.segments.map((segment) => segment.map(map)) })));
}

export function compatiblePaths(from: string, to: string): [string, string] {
  const pair = [contours(from), contours(to)];
  if (pair[0]!.length !== pair[1]!.length) throw new Error('Morph paths require matching contour counts');
  for (let index = 0; index < pair[0]!.length; index++) {
    const a = pair[0]![index]!, b = pair[1]![index]!;
    if (a.closed !== b.closed) throw new Error('Morph contours must have matching open/closed topology');
    for (const contour of [a, b]) {
      const end = contour.segments.at(-1)?.at(-1);
      if (contour.closed && end && (end[0] !== contour.start[0] || end[1] !== contour.start[1])) contour.segments.push([end, contour.start]);
      contour.segments = contour.segments.map((segment) => {
        if (segment.length === 4) return segment;
        const start = segment[0]!, end = segment.at(-1)!;
        const lerp = (x: Point, y: Point, t: number): Point => [x[0] * (1 - t) + y[0] * t, x[1] * (1 - t) + y[1] * t];
        return segment.length === 2 ? [start, lerp(start, end, 1 / 3), lerp(start, end, 2 / 3), end] : [start, lerp(start, segment[1]!, 2 / 3), lerp(end, segment[1]!, 2 / 3), end];
      });
    }
    const count = Math.max(a.segments.length, b.segments.length);
    if (count > 4096) throw new Error('Morph contour exceeds 4096 segments');
    for (const contour of [a, b]) {
      if (!contour.segments.length && count) contour.segments = [[contour.start, contour.start, contour.start, contour.start]];
      const length = contour.segments.length;
      contour.segments = contour.segments.flatMap((segment, segmentIndex) => {
        const divisions = Math.floor(count / length) + (segmentIndex < count % length ? 1 : 0);
        const result: Point[][] = []; let rest = segment;
        for (let remaining = divisions; remaining > 1; remaining--) { const [left, right] = split(rest, 1 / remaining); result.push(left); rest = right; }
        result.push(rest); return result;
      });
    }
  }
  return [serialize(pair[0]!), serialize(pair[1]!)];
}

const morphCache = new Map<string, [SvgPathCommand[], SvgPathCommand[]]>();
export function interpolatePath(from: string, to: string, progress: number): string {
  if (!Number.isFinite(progress)) throw new Error('Morph progress must be finite');
  const key = JSON.stringify([from, to]);
  let pair = morphCache.get(key);
  if (!pair) {
    pair = compatiblePaths(from, to).map((data) => absoluteSvgPath(data)) as [SvgPathCommand[], SvgPathCommand[]];
    // Bound retained input and expanded command storage, including huge contours.
    if (key.length <= 32_768 && pair[0].length + pair[1].length <= 4096) {
      if (morphCache.size >= 32) morphCache.delete(morphCache.keys().next().value!);
      morphCache.set(key, pair);
    }
  }
  return serializeSvgPath(pair[0].map((command, index) => ({ command: command.command, values: command.values.map((value, component) => value * (1 - progress) + pair[1][index]!.values[component]! * progress) })));
}
