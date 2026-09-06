import { describe, expect, it } from 'vitest';
import { captionCueSchema } from '../src/ir/schema.js';
import { captionLineRanges, captionWordRanges } from '../src/engine/caption-layout.js';
import { editCaptions, paginateCaptions } from '../src/ir/caption-editing.js';
import { parseCaptions, serializeCaptions } from '../src/captions.js';

const fixture = () => captionCueSchema.parse({ id: 'cue', start: 0, end: 3, text: 'Go go, then go.', words: [{ text: 'Go', start: 0, end: .5 }, { text: 'go', start: .5, end: 1 }, { text: 'then', start: 1, end: 2 }, { text: 'go', start: 2, end: 3 }] });
describe('caption editing and text alignment', () => {
  it('disambiguates repeated tokens and maps collapsed multiline whitespace', () => {
    expect(captionWordRanges(fixture()).map((range) => range.start)).toEqual([0, 3, 7, 12]);
    expect(captionLineRanges('Go  go,\nthen go.', ['Go go,', 'then go.']).map((range) => range.indices)).toEqual([[0, 1, 2, 4, 5, 6], [8, 9, 10, 11, 12, 13, 14, 15]]);
  });
  it('corrects one repeated word without changing later timing or alignment', () => {
    const result = editCaptions([fixture()], { action: 'word', cueId: 'cue', index: 1, text: 'forward' });
    expect(result.cues[0]!.text).toBe('Go forward, then go.');
    expect(captionWordRanges(result.cues[0]!).map((range) => range.start)).toEqual([0, 3, 12, 17]);
    expect(result.cues[0]!.words[3]!.start).toBe(2);
    expect(() => editCaptions([fixture()], { action: 'word', cueId: 'cue', index: 1, start: .1 })).toThrow(/overlapping/);
  });
  it('paginates timed words without fabricating proportional timings', () => {
    const result = paginateCaptions([fixture()], { maxWords: 2 });
    expect(result.cues.map((cue) => cue.text)).toEqual(['Go go,', 'then go.']);
    expect(result.cues.map((cue) => [cue.start, cue.end])).toEqual([[0, 1], [1, 3]]);
    expect(captionWordRanges(result.cues[1]!).map((range) => range.start)).toEqual([0, 5]);
    const untimed = captionCueSchema.parse({ id: 'untimed', start: 0, end: 3, text: 'A long untimed sentence' });
    expect(paginateCaptions([untimed], { maxWords: 1 }).cues).toEqual([untimed]);
  });
  it('uses literal replacement and removes invalidated alignment', () => {
    const cue = captionCueSchema.parse({ id: 'literal', start: 0, end: 1, text: 'a+b aab', words: [{ text: 'a+b', start: 0, end: 1 }] });
    const result = editCaptions([cue], { action: 'replace', find: 'a+b', replacement: '$&' });
    expect(result.cues[0]!.text).toBe('$& aab'); expect(result.cues[0]!.words).toEqual([]); expect(result.warnings).toHaveLength(1);
    expect(() => editCaptions([fixture()], { action: 'shift', seconds: -1 })).toThrow();
  });
  it('preserves speakers and styles across forced breaks and duration-limited pages', () => {
    const cue = fixture(); cue.speaker = 'Ada'; cue.style = { color: '#ff0000' }; cue.words[1]!.breakBefore = true;
    const pages = paginateCaptions([cue], { maxDuration: 1, maxCharacters: 20 });
    expect(pages.cues.map(page => page.text)).toEqual(['Go', 'go,', 'then', 'go.']);
    for (const page of pages.cues) { expect(page.speaker).toBe('Ada'); expect(page.style).toEqual({ color: '#ff0000' }); expect(page.end - page.start).toBeLessThanOrEqual(1); }
  });
  it('imports WebVTT speakers, entities and inline timed segments', () => {
    const cues = parseCaptions('WEBVTT\n\nNOTE ignore --> this\n\n00:00.000 --> 00:02.000\n<v Ada>Go &amp; <00:01.000>go.</v>\n', 'vtt');
    expect(cues).toHaveLength(1); expect(cues[0]!.speaker).toBe('Ada'); expect(cues[0]!.text).toBe('Go & go.');
    expect(cues[0]!.words.map((word) => [word.text, word.start, word.end])).toEqual([['Go &', 0, 1], ['go.', 1, 2]]);
    expect(parseCaptions(serializeCaptions(cues, 'vtt'), 'vtt')[0]!.speaker).toBe('Ada');
    expect(serializeCaptions(cues, 'srt')).not.toContain('<v ');
    expect(() => parseCaptions('1\n00:61:00,000 --> 00:62:00,000\nInvalid', 'srt')).toThrow(/timestamp/);
  });
});
