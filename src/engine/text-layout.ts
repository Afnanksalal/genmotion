import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import type { TextLayer } from '../ir/schema.js';

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
export function textGraphemes(text: string): string[] { return Array.from(segmenter.segment(text), (part) => part.segment); }
export function canvasFontWeight(weight: TextLayer['fontWeight']): TextLayer['fontWeight'] {
  // Skia's font shorthand parser requires the CSS2 weight ladder.
  return typeof weight === 'number' ? Math.max(100, Math.min(900, Math.round(weight / 100) * 100)) : weight;
}
export function fontString(layer: TextLayer, size: number): string {
  return `${layer.fontStyle} ${String(canvasFontWeight(layer.fontWeight))} ${String(size)}px "${layer.fontFamily.replace(/["\\]/g, '')}"`;
}
export function measuredTextWidth(ctx: SKRSContext2D, text: string, spacing: number): number {
  if (!spacing) return ctx.measureText(text).width;
  const glyphs = textGraphemes(text);
  return Math.max(0, glyphs.reduce((sum, glyph) => sum + ctx.measureText(glyph).width, 0) + Math.max(0, glyphs.length - 1) * spacing);
}

export interface TextLayout {
  lines: string[]; widths: number[]; fontSize: number; lineHeight: number;
  width: number; height: number; boxWidth: number; boxHeight: number;
  overflowX: boolean; overflowY: boolean; overflowLines: boolean; fits: boolean;
}

/** Measurement and rendering share the exact same native font metrics and line breaking. */
export function resolveTextLayout(ctx: SKRSContext2D, layer: TextLayer): TextLayout {
  if (layer.text.length > 200_000) throw new Error('Text layout is limited to 200000 characters per layer');
  const maximum = Math.min(layer.fontSize, layer.maxFontSize ?? layer.fontSize);
  const minimum = layer.minFontSize ?? Math.min(8, maximum);
  if (minimum > maximum) throw new Error('Minimum font size exceeds the maximum');
  const layout = (fontSize: number): TextLayout => {
    ctx.font = fontString(layer, fontSize);
    const widthLimit = layer.autoSize === 'both' ? Infinity : layer.width;
    const measure = (text: string): number => measuredTextWidth(ctx, text, layer.letterSpacing);
    const lines: string[] = [];
    for (const paragraph of layer.text.split('\n')) {
      const words = paragraph.split(/\s+/u).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate) <= widthLimit) { line = candidate; continue; }
        if (line) { lines.push(line); line = ''; }
        if (layer.breakWords === false || measure(word) <= widthLimit) { line = word; continue; }
        const glyphs = textGraphemes(word);
        let offset = 0;
        while (offset < glyphs.length) {
          let low = 1, high = glyphs.length - offset;
          while (low < high) {
            const count = Math.ceil((low + high) / 2);
            if (measure(glyphs.slice(offset, offset + count).join('')) <= widthLimit) low = count;
            else high = count - 1;
          }
          const chunk = glyphs.slice(offset, offset + low).join(''); offset += low;
          if (offset < glyphs.length) lines.push(chunk); else line = chunk;
        }
      }
      lines.push(line);
    }
    const widths = lines.map(measure), width = widths.reduce((max, value) => Math.max(max, value), 0);
    const lineHeight = fontSize * layer.lineHeight, height = lines.length * lineHeight;
    const boxWidth = layer.autoSize === 'both' ? Math.max(1, width) : layer.width;
    const boxHeight = layer.autoSize === 'height' || layer.autoSize === 'both' ? Math.max(1, height) : layer.height;
    const overflowX = width > boxWidth + 1e-6, overflowY = height > boxHeight + 1e-6, overflowLines = Boolean(layer.maxLines && lines.length > layer.maxLines);
    return { lines, widths, width, height, boxWidth, boxHeight, fontSize, lineHeight, overflowX, overflowY, overflowLines, fits: !overflowX && !overflowY && !overflowLines };
  };
  const initial = layout(maximum);
  if (layer.fit === 'none' || initial.fits) return initial;
  let low = minimum, high = maximum, best = layout(minimum);
  if (!best.fits) return best;
  for (let iteration = 0; iteration < 24 && high - low > 0.001; iteration += 1) {
    const size = (low + high) / 2, candidate = layout(size);
    if (candidate.fits) { best = candidate; low = size; } else high = size;
  }
  return best;
}

/** Register project-local fonts before using this standalone helper. */
export function measureTextLayer(layer: TextLayer): TextLayout {
  return resolveTextLayout(createCanvas(1, 1).getContext('2d'), layer);
}
