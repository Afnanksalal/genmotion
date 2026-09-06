import { Path2D, PathOp, StrokeCap, StrokeJoin } from '@napi-rs/canvas';
import { pathOperationsSchema, type PathOperation } from '../ir/path-operations.js';
import { normalizePath } from './path.js';
import { extractSubpaths, reversePath, subdividePath, warpPath } from './path-editing.js';

const operations = { union: PathOp.Union, intersection: PathOp.Intersect, subtract: PathOp.Difference, exclude: PathOp.Xor };
const joins = { miter: StrokeJoin.Miter, round: StrokeJoin.Round, bevel: StrokeJoin.Bevel };
const caps = { butt: StrokeCap.Butt, round: StrokeCap.Round, square: StrokeCap.Square };
const cache = new Map<string, { value: string; bytes: number }>();
let retainedBytes = 0;
const maximumBytes = 16 * 1024 * 1024;

/** Native Skia geometry, retained under a bounded per-runtime LRU. */
export function applyPathOperations(data: string, input: PathOperation[] = []): string {
  const checked = pathOperationsSchema.parse(input);
  const key = JSON.stringify([data, checked]);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit.value; }
  let path = new Path2D(normalizePath(data));
  for (const operation of checked) {
    if (operation.op === 'union' || operation.op === 'intersection' || operation.op === 'subtract' || operation.op === 'exclude') path = path.op(new Path2D(normalizePath(operation.path)), operations[operation.op]);
    else if (operation.op === 'transform') {
      const [a, b, c, d, e, f] = operation.matrix;
      path = path.transform({ a, b, c, d, e, f });
    } else if (operation.op === 'stroke') path = path.stroke({ width: operation.width, cap: caps[operation.cap], join: joins[operation.join], miterLimit: operation.miterLimit });
    else if (operation.op === 'round') path = path.round(operation.radius);
    else if (operation.op === 'trim') path = path.trim(operation.start, operation.end, operation.complement);
    else if (operation.op === 'dash') path = path.dash(operation.on, operation.off, operation.phase);
    else if (operation.op === 'reverse') path = new Path2D(reversePath(path.toSVGString()));
    else if (operation.op === 'cut') {
      const source = path.toSVGString();
      path = new Path2D(new Path2D(source).trim(0, operation.at).toSVGString() + ' ' + new Path2D(source).trim(operation.at, 1).toSVGString());
    }
    else if (operation.op === 'subpaths') path = new Path2D(extractSubpaths(path.toSVGString(), operation.indices));
    else if (operation.op === 'subdivide') path = new Path2D(subdividePath(path.toSVGString(), operation.divisions));
    else if (operation.op === 'warp') path = new Path2D(warpPath(path.toSVGString(), operation.corners, operation.divisions));
    else if (operation.op === 'translate') path = path.transform({ a: 1, b: 0, c: 0, d: 1, e: operation.x, f: operation.y });
    else if (operation.op === 'scale') path = path.transform({ a: operation.x, b: 0, c: 0, d: operation.y, e: operation.origin[0] * (1 - operation.x), f: operation.origin[1] * (1 - operation.y) });
    else if (operation.op === 'center') {
      const [left, top, right, bottom] = path.getBounds();
      path = path.transform({ a: 1, b: 0, c: 0, d: 1, e: operation.x - left / 2 - right / 2, f: operation.y - top / 2 - bottom / 2 });
    }
    else path = path.simplify();
    const bounds = path.getBounds();
    if (bounds.some((value) => !Number.isFinite(value))) throw new Error('Native path operation produced nonfinite geometry.');
  }
  const value = normalizePath(path.asWinding().toSVGString());
  const bytes = (key.length + value.length) * 2;
  if (bytes <= maximumBytes) {
    while (cache.size >= 128 || retainedBytes + bytes > maximumBytes) {
      const oldest = cache.entries().next().value;
      if (!oldest) break;
      cache.delete(oldest[0]); retainedBytes -= oldest[1].bytes;
    }
    cache.set(key, { value, bytes }); retainedBytes += bytes;
  }
  return value;
}
