import { converter } from 'culori';
import { z } from 'zod';
import { GenmotionError } from '../errors.js';

export const alphaModeSchema = z.enum(['auto', 'preserve', 'flatten']);
export type AlphaMode = z.infer<typeof alphaModeSchema>;
export type AlphaOutput = { mode: 'preserve' } | { mode: 'flatten'; background: [number, number, number] };

export function resolveAlphaOutput(codec: string, mode: AlphaMode = 'auto', background?: string): AlphaOutput {
  alphaModeSchema.parse(mode);
  const selected = mode === 'auto' ? background !== undefined || codec !== 'vp9' ? 'flatten' : 'preserve' : mode;
  if (selected === 'preserve') {
    if (!['vp9', 'prores'].includes(codec)) throw new GenmotionError('ALPHA_CODEC_UNSUPPORTED', 'Alpha preservation requires VP9 WebM or ProRes 4444.');
    if (background !== undefined) throw new GenmotionError('ALPHA_BACKGROUND_CONFLICT', 'A background color requires flattening.');
    return { mode: 'preserve' };
  }
  const color = converter('rgb')(background ?? '#000000');
  if (!color || (color.alpha ?? 1) !== 1 || ![color.r, color.g, color.b].every(Number.isFinite)) throw new GenmotionError('ALPHA_BACKGROUND_INVALID', 'Alpha background must be an opaque CSS color.');
  const channel = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 255);
  return { mode: 'flatten', background: [channel(color.r), channel(color.g), channel(color.b)] };
}

/** Composite straight RGBA onto an opaque background in place, before YUV encoding. */
export function flattenRgbaInPlace(rgba: Uint8Array, background: readonly [number, number, number]): void {
  if (rgba.length % 4 !== 0 || background.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) throw new GenmotionError('ALPHA_BUFFER_INVALID', 'Flattening requires RGBA bytes and an RGB byte background.');
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3]!;
    if (alpha === 255) continue;
    const inverse = 255 - alpha;
    rgba[offset] = Math.round((rgba[offset]! * alpha + background[0] * inverse) / 255);
    rgba[offset + 1] = Math.round((rgba[offset + 1]! * alpha + background[1] * inverse) / 255);
    rgba[offset + 2] = Math.round((rgba[offset + 2]! * alpha + background[2] * inverse) / 255);
    rgba[offset + 3] = 255;
  }
}
