import { createHash } from 'node:crypto';
import { z } from 'zod';
import { frozenAudioFeaturesSchema, type FrozenAudioFeatures } from '../engine/audio-intelligence.js';

export const lyricCueSchema = z.object({ id: z.string().min(1), start: z.number().finite().nonnegative(), end: z.number().finite().positive(), text: z.string().min(1), verified: z.boolean(), source: z.string().min(1), speaker: z.string().min(1).optional() }).strict().refine((cue) => cue.end > cue.start, 'Lyric cue end must follow start');
export const musicWorkflowOptionsSchema = z.object({
  targetDuration: z.number().finite().positive().max(86_400), preferredStart: z.number().finite().nonnegative().optional(), minReadableHold: z.number().finite().positive().max(30).default(.65), minPhraseConfidence: z.number().finite().min(0).max(1).default(.4), requireVerifiedLyrics: z.boolean().default(true),
}).strict();

/** Select a real analyzed source range and preserve the evidence used to author a music/lyric edit. */
export function planMusicWorkflow(features: FrozenAudioFeatures, lyricsInput: z.input<typeof lyricCueSchema>[] = [], input: z.input<typeof musicWorkflowOptionsSchema>) {
  features = frozenAudioFeaturesSchema.parse(features); const options = musicWorkflowOptionsSchema.parse(input), lyrics = z.array(lyricCueSchema).max(100_000).parse(lyricsInput);
  if (!/^[a-f0-9]{64}$/.test(features.sourceSha256)) throw new Error('Audio feature source hash is invalid');
  if (options.requireVerifiedLyrics && lyrics.some((cue) => !cue.verified)) throw new Error('Every lyric cue in this workflow must be explicitly verified');
  const ends = features.phrases.filter((phrase) => phrase.confidence >= options.minPhraseConfidence).map((phrase) => phrase.end).sort((a, b) => a - b);
  const sourceEnd = Math.max(0, ...features.phrases.map((phrase) => phrase.end), ...features.beats.map((beat) => beat.time), ...lyrics.map((cue) => cue.end));
  if (sourceEnd < options.targetDuration) throw new Error('Analyzed source is shorter than the requested workflow range');
  const starts = [...new Set([options.preferredStart ?? 0, ...features.phrases.map((phrase) => phrase.start)])].filter((value) => value >= 0 && value + options.targetDuration <= sourceEnd);
  if (!starts.length) throw new Error('No finite analyzed source range can satisfy the target duration');
  const candidates = starts.map((start) => { const targetEnd = start + options.targetDuration, ending = ends.reduce((best, value) => Math.abs(value - targetEnd) < Math.abs(best - targetEnd) ? value : best, targetEnd), end = Math.max(start + .001, Math.min(sourceEnd, ending)); const phrases = features.phrases.filter((phrase) => phrase.end > start && phrase.start < end), confidence = phrases.reduce((sum, phrase) => sum + phrase.confidence, 0) / Math.max(1, phrases.length); return { start, end, duration: end - start, endingDistance: Math.abs(end - targetEnd), confidence }; });
  candidates.sort((a, b) => a.endingDistance - b.endingDistance || b.confidence - a.confidence || a.start - b.start); const range = candidates[0]!;
  const beatMarkers = features.beats.filter((beat) => beat.time >= range.start && beat.time <= range.end).map((beat, index) => ({ id: `beat-${String(index + 1)}`, sourceTime: beat.time, timelineTime: features.timeMap.timelineStart + (beat.time - features.timeMap.sourceStart) / features.timeMap.rate, strength: beat.strength, confidence: beat.confidence }));
  const selectedLyrics = lyrics.filter((cue) => cue.end > range.start && cue.start < range.end), readableHolds = selectedLyrics.map((cue) => ({ cueId: cue.id, duration: Math.min(cue.end, range.end) - Math.max(cue.start, range.start), required: options.minReadableHold })).map((item) => ({ ...item, readable: item.duration >= item.required }));
  const unresolved = readableHolds.filter((hold) => !hold.readable).map((hold) => ({ code: 'LYRIC_HOLD_SHORT', cueId: hold.cueId, measured: hold.duration, required: hold.required }));
  const evidence = { sourceSha256: features.sourceSha256, analysisHash: features.analysisHash, lyricHash: createHash('sha256').update(JSON.stringify(lyrics)).digest('hex'), corrections: structuredClone(features.corrections), phraseCandidates: candidates.length };
  return { version: 1 as const, range, beatMarkers, lyrics: selectedLyrics, readableHolds, unresolved, verifiedLyrics: selectedLyrics.every((cue) => cue.verified), evidence };
}
