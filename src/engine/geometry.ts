import type { GenmotionProject, Layer, ShapeLayer } from '../ir/schema.js';

export type Point = readonly [number, number];

export interface LayerBox { x: number; y: number; width: number; height: number }

export function layerBox(layer: Layer): LayerBox {
  if (layer.type === 'shape') return shapeBounds(layer);
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}

function anchorPoint(project: GenmotionProject, id: string | undefined): Point | undefined {
  if (!id) return undefined;
  const anchor = project.anchors.find((candidate) => candidate.id === id);
  if (!anchor) throw new Error(`Shape references unknown geometry anchor: ${id}`);
  return [anchor.x, anchor.y];
}

/** Resolve semantic anchor bindings into concrete canvas geometry for one frame. */
export function resolveAnchoredShape(layer: ShapeLayer, project: GenmotionProject): ShapeLayer {
  if (layer.shape === 'ellipse' && layer.centerAnchor) {
    const center = anchorPoint(project, layer.centerAnchor)!;
    return { ...layer, x: center[0] - layer.width / 2, y: center[1] - layer.height / 2 };
  }

  if (layer.shape === 'line' || layer.shape === 'bezier') {
    const start = anchorPoint(project, layer.startAnchor) ?? [layer.x, layer.y];
    const end = anchorPoint(project, layer.endAnchor) ?? [layer.x + layer.width, layer.y + layer.height];
    return { ...layer, x: start[0], y: start[1], width: end[0] - start[0], height: end[1] - start[1] };
  }

  return layer;
}

export function shapeBounds(layer: ShapeLayer): { x: number; y: number; width: number; height: number } {
  if (layer.shape !== 'bezier' || !layer.control1 || !layer.control2) {
    const x = Math.min(layer.x, layer.x + layer.width);
    const y = Math.min(layer.y, layer.y + layer.height);
    return { x, y, width: Math.abs(layer.width), height: Math.abs(layer.height) };
  }
  const xs = [layer.x, layer.x + layer.width, layer.control1[0], layer.control2[0]];
  const ys = [layer.y, layer.y + layer.height, layer.control1[1], layer.control2[1]];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function mix(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}

function mixPoint(a: Point, b: Point, progress: number): Point {
  return [mix(a[0], b[0], progress), mix(a[1], b[1], progress)];
}

/** Return the left-hand cubic produced by splitting a Bezier at progress. */
export function bezierPrefix(start: Point, control1: Point, control2: Point, end: Point, progress: number): [Point, Point, Point, Point] {
  const p = Math.max(0, Math.min(1, progress));
  const a = mixPoint(start, control1, p);
  const b = mixPoint(control1, control2, p);
  const c = mixPoint(control2, end, p);
  const d = mixPoint(a, b, p);
  const e = mixPoint(b, c, p);
  return [start, a, d, mixPoint(d, e, p)];
}
