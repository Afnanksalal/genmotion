import { createCanvas, Path2D, type Canvas, type DOMMatrix } from '@napi-rs/canvas';
import type { z } from 'zod';
import type { layerMaskSchema } from '../ir/schema.js';
import { evaluateNumber } from './timeline.js';
import { interpolatePath, compatiblePaths } from './path-editing.js';
import { parseSvgPath } from './svg-path.js';
import { ease } from './easing.js';

export type LayerMask = z.infer<typeof layerMaskSchema>;
export function validateLayerMasks(masks: LayerMask[]): void {
  for (const mask of masks) {
    const keys = typeof mask.path === 'string' ? [{ at: 0, value: mask.path }] : mask.path.keyframes;
    keys.forEach((key, index) => {
      parseSvgPath(key.value);
      if (index && key.at <= keys[index - 1]!.at) throw new Error(`Mask ${mask.id} keyframe times must increase`);
      if (index) compatiblePaths(keys[index - 1]!.value, key.value);
    });
  }
}
export function evaluateMaskPath(mask: LayerMask, time: number): string {
  if (typeof mask.path === 'string') return mask.path;
  const keys = mask.path.keyframes;
  if (time <= keys[0]!.at) return keys[0]!.value;
  for (let index = 1; index < keys.length; index += 1) {
    const next = keys[index]!, previous = keys[index - 1]!;
    if (time <= next.at) return interpolatePath(previous.value, next.value, ease(next.ease, (time - previous.at) / (next.at - previous.at)));
  }
  return keys.at(-1)!.value;
}

/** Masks use authored layer coordinates; feather and expansion are output pixels. */
export function applyLayerMasks(input: Canvas, masks: LayerMask[], time: number, matrix: DOMMatrix): Canvas {
  const enabled = masks.filter((mask) => mask.enabled);
  if (!enabled.length) return input;
  validateLayerMasks(enabled);
  const width = input.width, height = input.height, combined = createCanvas(width, height), combinedContext = combined.getContext('2d');
  if (enabled[0]!.mode === 'subtract' || enabled[0]!.mode === 'intersect') { combinedContext.fillStyle = '#fff'; combinedContext.fillRect(0, 0, width, height); }
  for (const mask of enabled) {
    const shape = createCanvas(width, height), context = shape.getContext('2d');
    const expansion = Math.max(-256, Math.min(256, evaluateNumber(mask.expansion, time)));
    const feather = Math.max(0, Math.min(256, evaluateNumber(mask.feather, time)));
    const opacity = Math.max(0, Math.min(1, evaluateNumber(mask.opacity, time)));
    if (![expansion, feather, opacity].every(Number.isFinite)) throw new Error('Mask parameters must be finite');
    const path = new Path2D(evaluateMaskPath(mask, time)).transform(matrix);
    context.fillStyle = '#fff'; context.fill(path, mask.fillRule);
    if (expansion) { context.globalCompositeOperation = expansion > 0 ? 'source-over' : 'destination-out'; context.strokeStyle = '#fff'; context.lineWidth = Math.abs(expansion) * 2; context.lineJoin = 'round'; context.stroke(path); }
    const softened = createCanvas(width, height), softContext = softened.getContext('2d');
    softContext.filter = `blur(${feather}px)`; softContext.drawImage(shape, 0, 0); softContext.filter = 'none';
    if (mask.inverted) { softContext.globalCompositeOperation = 'source-out'; softContext.fillStyle = '#fff'; softContext.fillRect(0, 0, width, height); }
    combinedContext.globalAlpha = opacity;
    combinedContext.globalCompositeOperation = mask.mode === 'add' ? 'source-over' : mask.mode === 'subtract' ? 'destination-out' : mask.mode === 'intersect' ? 'destination-in' : 'xor';
    combinedContext.drawImage(softened, 0, 0);
  }
  const output = createCanvas(width, height), outputContext = output.getContext('2d');
  outputContext.drawImage(input, 0, 0); outputContext.globalCompositeOperation = 'destination-in'; outputContext.drawImage(combined, 0, 0);
  return output;
}
