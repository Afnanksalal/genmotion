import { unicodeBidiRanges } from './unicode-bidi-data.js';

const segmenters = new Map<string, Intl.Segmenter>();
export function textSegmenter(locale = 'en', granularity: 'word' | 'grapheme' = 'grapheme'): Intl.Segmenter {
  const key = `${locale}:${granularity}`;
  let segmenter = segmenters.get(key);
  if (!segmenter) { segmenter = new Intl.Segmenter(locale, { granularity }); if (segmenters.size >= 64) segmenters.delete(segmenters.keys().next().value!); segmenters.set(key, segmenter); }
  return segmenter;
}
function bidiClass(codePoint: number): number {
  let first = 0, last = unicodeBidiRanges.length - 1;
  while (first <= last) { const middle = (first + last) >>> 1, range = unicodeBidiRanges[middle]!; if (codePoint < range[0]) last = middle - 1; else if (codePoint > range[1]) first = middle + 1; else return range[2]; }
  return 0;
}
/** UAX #9 P2/P3 paragraph base direction; Skia performs shaping and bidi reordering. */
export function textDirection(text: string, direction: 'ltr' | 'rtl' | 'auto' = 'ltr'): 'ltr' | 'rtl' {
  if (direction !== 'auto') return direction;
  let isolates = 0;
  for (const character of text) {
    const type = bidiClass(character.codePointAt(0)!);
    if (type === 8) break;
    if (type >= 4 && type <= 6) { isolates++; continue; }
    if (type === 7) { isolates = Math.max(0, isolates - 1); continue; }
    if (isolates) continue;
    if (type === 1) return 'ltr';
    if (type === 2 || type === 3) return 'rtl';
  }
  return 'ltr';
}
export function revealUnicodeText(text: string, mode: 'none' | 'characters' | 'words' | 'lines', progress: number, locale = 'en'): string {
  if (!Number.isFinite(progress)) throw new Error('Text reveal progress must be finite.');
  const amount = Math.max(0, Math.min(1, progress));
  if (mode === 'none' || amount >= 1) return text;
  if (amount <= 0) return '';
  if (mode === 'lines') { const lines = text.split(/\r\n|[\n\r\u2028\u2029]/u); return lines.slice(0, Math.ceil(lines.length * amount)).join('\n'); }
  const segments = [...textSegmenter(locale, mode === 'characters' ? 'grapheme' : 'word').segment(text)];
  const units = mode === 'words' ? segments.filter(segment => segment.isWordLike) : segments;
  if (!units.length) return mode === 'words' ? revealUnicodeText(text, 'characters', amount, locale) : '';
  const count = Math.ceil(units.length * amount), next = units[count];
  return text.slice(0, next ? next.index : text.length);
}

export function textWrapUnits(paragraph: string, locale?: string, mode: 'word' | 'grapheme' | 'none' = 'word'): Array<{ text: string; before: string }> {
  if (mode === 'none') return [{ text: paragraph, before: '' }];
  // Preserve the existing whitespace-based contract unless locale-aware wrapping is selected.
  if (!locale && mode === 'word') return paragraph.split(/\s+/u).filter(Boolean).map((text, index) => ({ text, before: index ? ' ' : '' }));
  if (mode === 'grapheme') return [...textSegmenter(locale).segment(paragraph.trim())].map(segment => ({ text: segment.segment, before: '' }));
  const result: Array<{ text: string; before: string }> = [];
  let space = '', prefix = '', joinNext = false;
  for (const part of textSegmenter(locale, 'word').segment(paragraph)) {
    const value = part.segment;
    if (/^[\u00a0\u202f\u2060]+$/u.test(value)) { if (result.length) result.at(-1)!.text += value; else prefix += value; joinNext = true; continue; }
    if (/^\s+$/u.test(value)) { space = ' '; continue; }
    if (/^[\p{Ps}\p{Pi}]+$/u.test(value) || (/^\p{Quotation_Mark}+$/u.test(value) && (space || !result.length))) { prefix += value; continue; }
    if (joinNext && result.length) { result.at(-1)!.text += prefix + value; prefix = ''; space = ''; joinNext = false; continue; }
    if (!part.isWordLike && !space && result.length && !prefix) { result.at(-1)!.text += value; continue; }
    result.push({ text: prefix + value, before: result.length ? space : '' }); space = ''; prefix = ''; joinNext = false;
  }
  if (prefix) { if (result.length) result.at(-1)!.text += prefix; else result.push({ text: prefix, before: '' }); }
  return result;
}
