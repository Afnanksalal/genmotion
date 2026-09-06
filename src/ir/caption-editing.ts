import { z } from 'zod';
import { captionCueSchema, type CaptionCue } from './schema.js';
import { captionWordRanges } from '../engine/caption-layout.js';

export const captionPageOptionsSchema = z.object({
  maxWords: z.number().int().min(1).max(100).default(8),
  maxCharacters: z.number().int().min(1).max(1000).default(64),
  maxDuration: z.number().finite().positive().max(60).default(4),
  gap: z.number().finite().min(0).max(10).default(.5),
}).strict();

export function paginateCaptions(input: CaptionCue[], configuration: z.input<typeof captionPageOptionsSchema> = {}): { cues: CaptionCue[]; warnings: string[] } {
  const cues = z.array(captionCueSchema).parse(input), options = captionPageOptionsSchema.parse(configuration), output: CaptionCue[] = [], warnings: string[] = [], ids = new Set(cues.map((cue) => cue.id));
  for (const cue of cues) {
    for (const [index, word] of cue.words.entries()) if (word.start < cue.start || word.end > cue.end || (index > 0 && word.start < cue.words[index - 1]!.end)) throw new Error(`Caption ${cue.id} has overlapping word timing or words outside its cue`);
    const ranges = captionWordRanges(cue);
    if (!cue.words.length || ranges.length !== cue.words.length) { output.push(cue); warnings.push(`${cue.id}: unchanged because complete word-to-text alignment is unavailable.`); continue; }
    let first = 0, page = 0;
    const flush = (end: number): void => {
      const initial = ranges[first]!, startOffset = first === 0 ? 0 : initial.start, endOffset = end === ranges.length ? cue.text.length : ranges[end]!.start;
      const raw = cue.text.slice(startOffset, endOffset), leading = raw.length - raw.trimStart().length, text = raw.trim();
      let id = `${cue.id}-page-${++page}`; while (ids.has(id)) id += '-x'; ids.add(id);
      const words = cue.words.slice(first, end).map((word, index) => ({ ...word, startOffset: ranges[first + index]!.start - startOffset - leading, endOffset: ranges[first + index]!.end - startOffset - leading }));
      const start = first === 0 ? cue.start : words[0]!.start;
      const nextStart = end < cue.words.length ? cue.words[end]!.start : cue.end;
      const finish = end === cue.words.length ? cue.end : Math.min(nextStart, words.at(-1)!.end);
      if (finish <= start) throw new Error(`Caption ${cue.id} has invalid page timing`);
      output.push(captionCueSchema.parse({ ...cue, id, text, words, start, end: finish }));
      if ([...text].length > options.maxCharacters || finish - start > options.maxDuration) warnings.push(`${id}: one token or retained cue boundary exceeds the requested page limits.`);
      first = end;
    };
    for (let index = 1; index < ranges.length; index += 1) {
      const word = cue.words[index]!, previous = cue.words[index - 1]!;
      if (word.start < previous.start || word.start < previous.end) throw new Error(`Caption ${cue.id} has overlapping or unordered word timing`);
      if (word.breakBefore || index - first >= options.maxWords || [...cue.text.slice(ranges[first]!.start, ranges[index]!.end)].length > options.maxCharacters || word.end - cue.words[first]!.start > options.maxDuration || word.start - previous.end > options.gap) flush(index);
    }
    flush(ranges.length);
  }
  return { cues: output, warnings };
}

export const captionEditSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('replace'), find: z.string().min(1).max(10000), replacement: z.string().max(10000), caseSensitive: z.boolean().default(true) }).strict(),
  z.object({ action: z.literal('shift'), seconds: z.number().finite() }).strict(),
  z.object({ action: z.literal('word'), cueId: z.string(), index: z.number().int().nonnegative(), start: z.number().finite().nonnegative().optional(), end: z.number().finite().positive().optional(), text: z.string().min(1).optional(), breakBefore: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('paginate'), options: captionPageOptionsSchema.optional() }).strict(),
]);
export function editCaptions(input: CaptionCue[], action: z.input<typeof captionEditSchema>): { cues: CaptionCue[]; warnings: string[] } {
  const edit = captionEditSchema.parse(action), cues = z.array(captionCueSchema).parse(input), warnings: string[] = [];
  if (edit.action === 'paginate') return paginateCaptions(cues, edit.options);
  if (edit.action === 'shift') {
    for (const cue of cues) { cue.start += edit.seconds; cue.end += edit.seconds; for (const word of cue.words) { word.start += edit.seconds; word.end += edit.seconds; } }
  } else if (edit.action === 'replace') {
    const escaped = edit.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const cue of cues) {
      const next = cue.text.replace(new RegExp(escaped, edit.caseSensitive ? 'gu' : 'giu'), () => edit.replacement);
      if (!next.trim()) throw new Error(`Replacement would empty caption ${cue.id}`);
      if (next !== cue.text) { cue.text = next; if (cue.words.length) warnings.push(`${cue.id}: word timing removed because text was replaced. Re-align before word highlighting.`); cue.words = []; }
    }
  } else {
    const cue = cues.find((cue) => cue.id === edit.cueId); if (!cue) throw new Error('Caption cue not found');
    const word = cue.words[edit.index]; if (!word) throw new Error('Caption word not found');
    if (edit.start !== undefined) word.start = edit.start; if (edit.end !== undefined) word.end = edit.end; if (edit.breakBefore !== undefined) word.breakBefore = edit.breakBefore;
    if (edit.text !== undefined && edit.text !== word.text) {
      const ranges = captionWordRanges(cue), range = ranges.find((range) => range.index === edit.index);
      if (!range || ranges.length !== cue.words.length) throw new Error('Word correction requires complete text alignment');
      const difference = edit.text.length - (range.end - range.start);
      cue.text = cue.text.slice(0, range.start) + edit.text + cue.text.slice(range.end); word.text = edit.text;
      for (const item of ranges) { const target = cue.words[item.index]!; target.startOffset = item.start + (item.index > edit.index ? difference : 0); target.endOffset = item.end + (item.index >= edit.index ? difference : 0); }
    }
  }
  for (const cue of cues) for (const [index, word] of cue.words.entries()) if (word.start < cue.start || word.end > cue.end || (index && word.start < cue.words[index - 1]!.end)) throw new Error(`Caption ${cue.id} has overlapping word timing or words outside its cue`);
  return { cues: z.array(captionCueSchema).parse(cues), warnings };
}
