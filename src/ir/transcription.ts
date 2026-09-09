import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { captionCueSchema, type CaptionCue } from './schema.js';

export const transcriptWordSchema = z.object({ id: z.string().min(1), text: z.string().min(1), start: z.number().finite().nonnegative(), end: z.number().finite().positive(), confidence: z.number().finite().min(0).max(1).nullable(), correctedText: z.string().min(1).optional(), accepted: z.boolean().default(false) }).strict().refine(word => word.end > word.start, 'Word end must follow start');
export const transcriptionResultSchema = z.object({ version: z.literal(1), id: z.string().min(1), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), language: z.string().min(2), provider: z.string().min(1), model: z.string().min(1), createdAt: z.string().datetime(), state: z.enum(['complete', 'partial']), words: z.array(transcriptWordSchema).max(100000), limitations: z.array(z.string()).default([]) }).strict();
export interface TranscriptionProvider { id: string; transcribe(file: string, options: { language?: string; model: string }, signal?: AbortSignal): Promise<{ language: string; words: Array<{ text: string; start: number; end: number; confidence?: number }>; partial?: boolean; limitations?: string[] }> }

export async function transcribeMedia(file: string, provider: TranscriptionProvider, options: { language?: string; model: string }, signal?: AbortSignal) {
  const sourceHash = createHash('sha256').update(await readFile(file)).digest('hex'), raw = await provider.transcribe(file, options, signal);
  return transcriptionResultSchema.parse({ version: 1, id: randomUUID(), sourceHash, language: raw.language, provider: provider.id, model: options.model, createdAt: new Date().toISOString(), state: raw.partial ? 'partial' : 'complete', words: raw.words.map((word, index) => ({ id: `word-${index + 1}`, ...word, confidence: word.confidence ?? null, accepted: false })), limitations: raw.limitations ?? [] });
}

export function correctTranscript(result: z.infer<typeof transcriptionResultSchema>, corrections: Array<{ id: string; text?: string; accepted: boolean }>) {
  const updates = new Map(corrections.map(item => [item.id, item])); return transcriptionResultSchema.parse({ ...result, words: result.words.map(word => { const update = updates.get(word.id); return update ? { ...word, ...(update.text ? { correctedText: update.text } : {}), accepted: update.accepted } : word; }) });
}

export function transcriptToCaptions(result: z.infer<typeof transcriptionResultSchema>, options: { maxWords?: number; gapSeconds?: number } = {}): CaptionCue[] {
  const maxWords = z.number().int().min(1).max(30).parse(options.maxWords ?? 8), gap = z.number().finite().min(0).max(10).parse(options.gapSeconds ?? .7), cues: CaptionCue[] = []; let group: typeof result.words = [];
  const flush = (): void => { if (!group.length) return; const textParts = group.map(word => word.correctedText ?? word.text), text = textParts.join(' '); let cursor = 0; const words = group.map((word, index) => { const value = textParts[index]!, startOffset = cursor, endOffset = cursor + value.length; cursor = endOffset + 1; return { text: value, start: word.start, end: word.end, startOffset, endOffset }; }); cues.push(captionCueSchema.parse({ id: `cue-${cues.length + 1}`, start: group[0]!.start, end: group.at(-1)!.end, text, words })); group = []; };
  for (const word of result.words) { if (!word.accepted) continue; if (group.length && (word.start - group.at(-1)!.end > gap || group.length >= maxWords)) flush(); group.push(word); } flush(); return cues;
}

export async function transcriptIsCurrent(result: z.infer<typeof transcriptionResultSchema>, sourceFile: string): Promise<boolean> { return result.sourceHash === createHash('sha256').update(await readFile(sourceFile)).digest('hex'); }
