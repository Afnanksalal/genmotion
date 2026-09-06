import type { SKRSContext2D } from '@napi-rs/canvas';
import type { ImageLayer, VideoLayer } from '../ir/schema.js';
import { evaluateNumber } from './timeline.js';

export function mediaSourceCrop(layer: Pick<ImageLayer | VideoLayer, 'crop'>, width: number, height: number, time: number) {
  if (!layer.crop) return { x: 0, y: 0, width, height };
  const ratio = layer.crop.unit === 'ratio';
  const result = { x: evaluateNumber(layer.crop.x, time) * (ratio ? width : 1), y: evaluateNumber(layer.crop.y, time) * (ratio ? height : 1), width: evaluateNumber(layer.crop.width, time) * (ratio ? width : 1), height: evaluateNumber(layer.crop.height, time) * (ratio ? height : 1) };
  if (!Object.values(result).every(Number.isFinite) || result.x < 0 || result.y < 0 || result.width <= 0 || result.height <= 0 || result.x + result.width > width + 1e-7 || result.y + result.height > height + 1e-7) throw new Error('Media crop must remain inside the source with positive dimensions');
  return result;
}

/** CSS-style radius overlap normalization with independent clockwise corners. */
export function mediaRoundedPath(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radii: [number, number, number, number]): void {
  const [tl, tr, br, bl] = radii.map((radius) => Math.max(0, radius)) as [number, number, number, number];
  const factor = Math.min(1, width / Math.max(1e-12, tl + tr), width / Math.max(1e-12, bl + br), height / Math.max(1e-12, tl + bl), height / Math.max(1e-12, tr + br));
  const a = tl * factor, b = tr * factor, c = br * factor, d = bl * factor;
  ctx.beginPath(); ctx.moveTo(x + a, y); ctx.lineTo(x + width - b, y); ctx.quadraticCurveTo(x + width, y, x + width, y + b);
  ctx.lineTo(x + width, y + height - c); ctx.quadraticCurveTo(x + width, y + height, x + width - c, y + height);
  ctx.lineTo(x + d, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - d);
  ctx.lineTo(x, y + a); ctx.quadraticCurveTo(x, y, x + a, y); ctx.closePath();
}
