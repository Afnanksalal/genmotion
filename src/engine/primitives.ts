import { Path2D } from '@napi-rs/canvas';
import type { ShapeLayer } from '../ir/schema.js';

export const nativePrimitiveNames = ['arc', 'pie', 'callout', 'arrow', 'star', 'spark', 'heart', 'regular-polygon', 'triangle', 'donut', 'ring', 'spiral', 'waveform', 'line-chart', 'area-chart'] as const;
const primitiveNames = new Set<string>(nativePrimitiveNames);

/** Procedural paths in a fixed 1000×1000 local coordinate system. */
export function nativePrimitivePath(layer: ShapeLayer): string | undefined {
  if (!primitiveNames.has(layer.shape)) return undefined;
  const path = new Path2D();
  const polygon = (points: Array<[number, number]>): void => {
    path.moveTo(...points[0]!); for (const point of points.slice(1)) path.lineTo(...point); path.closePath();
  };
  const radial = (count: number, inner?: number): void => {
    polygon(Array.from({ length: inner === undefined ? count : count * 2 }, (_, index): [number, number] => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / (inner === undefined ? count : count * 2);
      const radius = inner !== undefined && index % 2 ? inner * 500 : 500;
      return [500 + Math.cos(angle) * radius, 500 + Math.sin(angle) * radius];
    }));
  };
  switch (layer.shape) {
    case 'arc':
    case 'pie': {
      const startDegrees = layer.startAngle ?? 0, endDegrees = layer.endAngle ?? 270;
      const start = (startDegrees % 360) * Math.PI / 180;
      const difference = endDegrees - startDegrees;
      const end = start + Math.max(-360, Math.min(360, difference)) * Math.PI / 180;
      if (layer.shape === 'pie') { path.moveTo(500, 500); path.lineTo(500 + Math.cos(start) * 500, 500 + Math.sin(start) * 500); }
      path.ellipse(500, 500, 500, 500, 0, start, end, layer.clockwise === false);
      if (layer.shape === 'pie') path.closePath();
      break;
    }
    case 'donut':
    case 'ring': {
      const inner = (layer.innerRadius ?? 0.65) * 500;
      path.ellipse(500, 500, 500, 500, 0, 0, 2 * Math.PI); path.closePath();
      if (inner > 0) { path.moveTo(500 + inner, 500); path.ellipse(500, 500, inner, inner, 0, 0, 2 * Math.PI, true); path.closePath(); }
      break;
    }
    case 'arrow': {
      const head = 1000 * (1 - (layer.headSize ?? 0.35));
      polygon([[0, 325], [head, 325], [head, 0], [1000, 500], [head, 1000], [head, 675], [0, 675]]); break;
    }
    case 'callout': {
      const radius = Math.min(200, Math.max(0, layer.radius / Math.max(1, Math.min(layer.width, layer.height)) * 1000));
      path.moveTo(radius, 0); path.lineTo(1000 - radius, 0); path.quadraticCurveTo(1000, 0, 1000, radius);
      path.lineTo(1000, 800 - radius); path.quadraticCurveTo(1000, 800, 1000 - radius, 800);
      path.lineTo(650, 800); path.lineTo(500, 1000); path.lineTo(450, 800); path.lineTo(radius, 800);
      path.quadraticCurveTo(0, 800, 0, 800 - radius); path.lineTo(0, radius); path.quadraticCurveTo(0, 0, radius, 0); path.closePath(); break;
    }
    case 'star': radial(layer.sides ?? 5, layer.innerRadius ?? 0.42); break;
    case 'spark': radial(layer.sides ?? 8, layer.innerRadius ?? 0.2); break;
    case 'regular-polygon': radial(layer.sides ?? 6); break;
    case 'triangle': radial(3); break;
    case 'heart':
      path.moveTo(500, 920); path.bezierCurveTo(410, 820, 40, 570, 40, 300);
      path.bezierCurveTo(40, 50, 350, 0, 500, 230); path.bezierCurveTo(650, 0, 960, 50, 960, 300);
      path.bezierCurveTo(960, 570, 590, 820, 500, 920); path.closePath(); break;
    case 'spiral': {
      const turns = layer.turns ?? 3, count = Math.min(8192, Math.max(128, Math.ceil(turns * 256)));
      for (let index = 0; index <= count; index += 1) {
        const progress = index / count, radius = 500 * progress, angle = ((layer.startAngle ?? -90) % 360) * Math.PI / 180 + progress * turns * Math.PI * 2;
        const x = 500 + Math.cos(angle) * radius, y = 500 + Math.sin(angle) * radius;
        if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
      }
      break;
    }
    case 'waveform':
    case 'line-chart':
    case 'area-chart': {
      const values = layer.samples ?? (layer.shape === 'waveform' ? [0, 0.7, -0.5, 1, -0.8, 0.4, 0] : [0.1, 0.4, 0.25, 0.8, 0.6, 1]);
      const minimum = Math.min(...values), maximum = Math.max(...values);
      const scale = Math.max(Math.abs(minimum), Math.abs(maximum), 1);
      for (const [index, value] of values.entries()) {
        const x = index / (values.length - 1) * 1000;
        const y = layer.shape === 'waveform' ? 500 - Math.max(-1, Math.min(1, value)) * 480 : maximum === minimum ? 500 : 1000 - (value / scale - minimum / scale) / (maximum / scale - minimum / scale) * 1000;
        if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
      }
      if (layer.shape === 'area-chart') { path.lineTo(1000, 1000); path.lineTo(0, 1000); path.closePath(); }
      break;
    }
    default: return undefined;
  }
  return path.toSVGString();
}
