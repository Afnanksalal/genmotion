import { createCanvas, type SKRSContext2D, type CanvasGradient } from '@napi-rs/canvas';
import { converter, formatRgb, interpolate, parse } from 'culori';
import { gradientSchema, type Gradient } from '../ir/paint.js';

let reverseCoincidentStops: boolean | undefined;
function addStops(gradient: CanvasGradient, stops: Gradient['stops']): void {
  if (reverseCoincidentStops === undefined) {
    const context = createCanvas(32, 1).getContext('2d'), probe = context.createLinearGradient(0, 0, 32, 0);
    for (const [offset, color] of [[0, '#00f'], [0.5, '#00f'], [0.5, '#f00'], [1, '#f00']] as const) probe.addColorStop(offset, color);
    context.fillStyle = probe; context.fillRect(0, 0, 32, 1);
    reverseCoincidentStops = context.getImageData(24, 0, 1, 1).data[0]! < 250;
  }
  for (let index = 0; index < stops.length; index++) {
    const first = stops[index]!;
    let last = first;
    while (stops[index + 1]?.offset === first.offset) last = stops[++index]!;
    const ordered = first === last ? [first] : reverseCoincidentStops ? [last, first] : [first, last];
    for (const stop of ordered) gradient.addColorStop(stop.offset, formatRgb(parse(stop.color)!));
  }
}

function conicStops(value: Gradient): Gradient['stops'] {
  const shift = (((value.angle % 360) / 360 + 0.25) % 1 + 1) % 1;
  if (shift === 0) return value.stops;
  const stops = [...value.stops];
  if (stops[0]!.offset > 0) stops.unshift({ offset: 0, color: stops[0]!.color });
  if (stops.at(-1)!.offset < 1) stops.push({ offset: 1, color: stops.at(-1)!.color });
  const relative = 1 - shift;
  let cut = stops[0]!.color;
  for (let index = 1; index < stops.length; index++) {
    const a = stops[index - 1]!, b = stops[index]!;
    if (relative > b.offset) continue;
    const p = b.offset === a.offset ? 1 : (relative - a.offset) / (b.offset - a.offset);
    const rgb = converter('rgb'), left = rgb(a.color)!, right = rgb(b.color)!;
    const alpha = (left.alpha ?? 1) * (1 - p) + (right.alpha ?? 1) * p;
    const channel = (key: 'r' | 'g' | 'b'): number => alpha ? (left[key] * (left.alpha ?? 1) * (1 - p) + right[key] * (right.alpha ?? 1) * p) / alpha : 0;
    cut = formatRgb({ mode: 'rgb', r: channel('r'), g: channel('g'), b: channel('b'), alpha });
    break;
  }
  const rotated = [-1, 0].flatMap((cycle) => stops.map((stop) => ({ ...stop, offset: stop.offset + shift + cycle })).filter((stop) => stop.offset > 0 && stop.offset < 1)).sort((a, b) => a.offset - b.offset);
  return [{ offset: 0, color: cut }, ...rotated, { offset: 1, color: cut }];
}

export function createGradient(ctx: SKRSContext2D, value: Gradient, box: { x: number; y: number; width: number; height: number }): CanvasGradient {
  const angle = (value.angle % 360) * Math.PI / 180;
  const x = box.x + value.center[0] * box.width, y = box.y + value.center[1] * box.height;
  let gradient: CanvasGradient;
  if (value.type === 'radial') gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.001, Math.max(box.width, box.height) * value.radius));
  else if (value.type === 'conic') gradient = ctx.createConicGradient(0, x, y);
  else {
    const extent = Math.abs(Math.cos(angle)) * box.width / 2 + Math.abs(Math.sin(angle)) * box.height / 2;
    const dx = Math.cos(angle) * extent, dy = Math.sin(angle) * extent;
    gradient = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
  }
  addStops(gradient, value.type === 'conic' ? conicStops(value) : value.stops);
  return gradient;
}

export function interpolateGradient(from: Gradient, to: Gradient, progress: number): Gradient {
  if (!Number.isFinite(progress)) throw new Error('Gradient progress must be finite');
  from = gradientSchema.parse(from); to = gradientSchema.parse(to);
  if (from.type !== to.type) throw new Error('Gradient interpolation requires matching gradient types');
  const p = Math.max(0, Math.min(1, progress));
  // Ordered stop correspondence keeps hard edges and animates their positions.
  if (from.stops.length !== to.stops.length) throw new Error('Gradient interpolation requires matching stop counts');
  const mix = (a: number, b: number): number => a * (1 - p) + b * p;
  return { type: from.type, angle: mix(from.angle, to.angle), center: [mix(from.center[0], to.center[0]), mix(from.center[1], to.center[1])], radius: mix(from.radius, to.radius),
    stops: from.stops.map((stop, index) => ({ offset: mix(stop.offset, to.stops[index]!.offset), color: formatRgb(interpolate([stop.color, to.stops[index]!.color], 'oklab')(p)) })),
  };
}
