import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import type { TextLayer } from '../ir/schema.js';
import { textDirection, textSegmenter, textWrapUnits } from './text-unicode.js';

export function textGraphemes(text: string): string[] { return Array.from(textSegmenter().segment(text), (part) => part.segment); }
export function canvasFontWeight(weight: TextLayer['fontWeight']): TextLayer['fontWeight'] {
  // Skia's font shorthand parser requires the CSS2 weight ladder.
  return typeof weight === 'number' ? Math.max(100, Math.min(900, Math.round(weight / 100) * 100)) : weight;
}
export function fontString(layer: TextLayer, size: number): string {
  return `${layer.fontStyle} ${String(canvasFontWeight(layer.fontWeight))} ${String(size)}px "${layer.fontFamily.replace(/["\\]/g, '')}"`;
}
export function measuredTextWidth(ctx: SKRSContext2D, text: string, spacing: number): number {
  const previous = ctx.letterSpacing;
  try { ctx.letterSpacing = `${spacing}px`; return ctx.measureText(text).width; }
  finally { ctx.letterSpacing = previous; }
}

export interface TextLayout {
  lines: string[]; widths: number[]; fontSize: number; lineHeight: number;
  width: number; height: number; boxWidth: number; boxHeight: number;
  overflowX: boolean; overflowY: boolean; overflowLines: boolean; fits: boolean;
  directions: Array<'ltr' | 'rtl'>;
  xOffsets: number[]; yOffsets: number[]; textBaseline: 'top' | 'alphabetic';
  inkBounds: { left: number; top: number; right: number; bottom: number; width: number; height: number };
}

/** Measurement and rendering share the exact same native font metrics and line breaking. */
export function resolveTextLayout(ctx: SKRSContext2D, layer: TextLayer): TextLayout {
  if (layer.text.length > 200_000) throw new Error('Text layout is limited to 200000 characters per layer');
  ctx.lang = layer.locale ?? 'en';
  const maximum = Math.min(layer.fontSize, layer.maxFontSize ?? layer.fontSize);
  const minimum = layer.minFontSize ?? Math.min(8, maximum);
  if (minimum > maximum) throw new Error('Minimum font size exceeds the maximum');
  const layout = (fontSize: number): TextLayout => {
    ctx.font = fontString(layer, fontSize);
    const widthLimit = layer.autoSize === 'both' || layer.wrap === 'none' ? Infinity : layer.width;
    const measure = (text: string): number => measuredTextWidth(ctx, text, layer.letterSpacing);
    const lines: string[] = [], directions: Array<'ltr' | 'rtl'> = [];
    for (const paragraph of layer.text.split(/\r\n|[\n\r\u2028\u2029]/u)) {
      const direction = textDirection(paragraph, layer.direction ?? 'ltr'); ctx.direction = direction;
      const push = (line: string): void => { lines.push(line); directions.push(direction); };
      const words = textWrapUnits(paragraph, layer.locale, layer.wrap);
      if (!words.length) { push(''); continue; }
      let line = '';
      for (const unit of words) {
        const word = unit.text;
        const candidate = line ? `${line}${unit.before}${word}` : word;
        if (measure(candidate) <= widthLimit) { line = candidate; continue; }
        if (line) { push(line); line = ''; }
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
          if (offset < glyphs.length) push(chunk); else line = chunk;
        }
      }
      push(line);
    }
    const widths = lines.map((line, index) => { ctx.direction = directions[index]!; return measure(line); });
    const oldBaseline = ctx.textBaseline, oldAlign = ctx.textAlign, oldSpacing = ctx.letterSpacing;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.letterSpacing = `${layer.letterSpacing}px`;
    const ink = lines.map((line, index) => { ctx.direction = directions[index]!; const metrics = ctx.measureText(line); return { left: -metrics.actualBoundingBoxLeft, right: metrics.actualBoundingBoxRight, ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent }; });
    const capHeight = ctx.measureText('H').actualBoundingBoxAscent;
    ctx.textBaseline = oldBaseline; ctx.textAlign = oldAlign; ctx.letterSpacing = oldSpacing;
    const lineHeight = fontSize * layer.lineHeight;
    const inkTop = ink.reduce((minimum, item, index) => Math.min(minimum, index * lineHeight - item.ascent), Infinity);
    const inkBottom = ink.reduce((maximum, item, index) => Math.max(maximum, index * lineHeight + item.descent), -Infinity);
    const verticalMetrics = layer.verticalMetrics ?? 'line-box';
    const height = verticalMetrics === 'ink' ? inkBottom - inkTop : verticalMetrics === 'cap-height' ? capHeight + Math.max(0, lines.length - 1) * lineHeight : lines.length * lineHeight;
    const effectiveWidths = layer.horizontalMetrics === 'ink' ? ink.map(item => item.right - item.left) : widths;
    const width = effectiveWidths.reduce((max, value) => Math.max(max, value), 0);
    const boxWidth = layer.autoSize === 'both' ? Math.max(1, width) : layer.width;
    const boxHeight = layer.autoSize === 'height' || layer.autoSize === 'both' ? Math.max(1, layer.baselineOffset !== undefined ? layer.baselineOffset + inkBottom : height) : layer.height;
    const offset = layer.verticalAlign === 'middle' ? (boxHeight - height) / 2 : layer.verticalAlign === 'bottom' ? boxHeight - height : 0;
    const textBaseline = layer.baselineOffset !== undefined || verticalMetrics !== 'line-box' ? 'alphabetic' as const : 'top' as const;
    const firstY = layer.baselineOffset ?? (offset + (verticalMetrics === 'ink' ? -inkTop : verticalMetrics === 'cap-height' ? capHeight : 0));
    const xOffsets = effectiveWidths.map((lineWidth, index) => (layer.align === 'center' ? (boxWidth - lineWidth) / 2 : layer.align === 'right' ? boxWidth - lineWidth : 0) - (layer.horizontalMetrics === 'ink' ? ink[index]!.left : 0));
    const yOffsets = lines.map((_line, index) => firstY + index * lineHeight);
    // Top-baseline ink metrics are measured directly; alphabetic metrics retain their native offsets.
    let paintInk = ink;
    if (textBaseline === 'top') {
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.letterSpacing = `${layer.letterSpacing}px`;
      paintInk = lines.map((line, index) => { ctx.direction = directions[index]!; const metrics = ctx.measureText(line); return { left: -metrics.actualBoundingBoxLeft, right: metrics.actualBoundingBoxRight, ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent }; });
      ctx.textBaseline = oldBaseline; ctx.textAlign = oldAlign; ctx.letterSpacing = oldSpacing;
    }
    const left = paintInk.reduce((minimum, item, index) => Math.min(minimum, xOffsets[index]! + item.left), Infinity);
    const right = paintInk.reduce((maximum, item, index) => Math.max(maximum, xOffsets[index]! + item.right), -Infinity);
    const top = paintInk.reduce((minimum, item, index) => Math.min(minimum, yOffsets[index]! - item.ascent), Infinity);
    const bottom = paintInk.reduce((maximum, item, index) => Math.max(maximum, yOffsets[index]! + item.descent), -Infinity);
    const inkBounds = { left, right, top, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    const overflowX = width > boxWidth + 1e-6;
    const overflowY = height > boxHeight + 1e-6 || (layer.baselineOffset !== undefined && (top < -1e-6 || bottom > boxHeight + 1e-6));
    const overflowLines = Boolean(layer.maxLines && lines.length > layer.maxLines);
    return { lines, directions, widths, width, height, boxWidth, boxHeight, fontSize, lineHeight, xOffsets, yOffsets, textBaseline, inkBounds, overflowX, overflowY, overflowLines, fits: !overflowX && !overflowY && !overflowLines };
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
