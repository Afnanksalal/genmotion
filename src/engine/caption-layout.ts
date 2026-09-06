import type { CaptionCue } from '../ir/schema.js';

export interface CaptionWordRange { index: number; start: number; end: number }
/** Repeated tokens resolve in source order; optional explicit UTF-16 offsets override matching. */
export function captionWordRanges(cue: CaptionCue): CaptionWordRange[] {
  const ranges: CaptionWordRange[] = []; let cursor = 0;
  cue.words.forEach((word, index) => {
    const start = word.startOffset ?? cue.text.indexOf(word.text, cursor), end = word.endOffset ?? start + word.text.length;
    if (start < cursor || start < 0 || end > cue.text.length || cue.text.slice(start, end) !== word.text) return;
    ranges.push({ index, start, end }); cursor = end;
  });
  return ranges;
}

/** Maps whitespace-collapsed rendered line characters back to authored UTF-16 offsets. */
export function captionLineRanges(text: string, lines: string[]): Array<{ start: number; end: number; indices: number[] }> {
  let cursor = 0;
  return lines.map((line) => {
    const indices: number[] = [];
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!;
      if (/\s/u.test(character)) { indices.push(cursor); while (cursor < text.length && /\s/u.test(text[cursor]!)) cursor += 1; }
      else { while (cursor < text.length && text[cursor] !== character && /\s/u.test(text[cursor]!)) cursor += 1; indices.push(cursor); cursor += 1; }
    }
    return { start: indices[0] ?? cursor, end: indices.length ? indices.at(-1)! + 1 : cursor, indices };
  });
}
