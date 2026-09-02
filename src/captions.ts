import { z } from 'zod';
import { captionCueSchema, type CaptionCue } from './ir/schema.js';

function seconds(value: string): number {
  const match = /^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid subtitle timestamp: ${value}`);
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

export function parseCaptions(content: string, format: 'srt' | 'vtt' | 'json'): CaptionCue[] {
  if (format === 'json') return z.array(captionCueSchema).parse(JSON.parse(content));
  const normalized = content.replace(/^WEBVTT[^\n]*\n+/i, '').replaceAll('\r\n', '\n').trim();
  return z.array(captionCueSchema).parse(normalized.split(/\n{2,}/).flatMap((block, index) => {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) return [];
    const timing = lines[timingIndex]!.split('-->').map((part) => part.trim().split(/\s+/)[0]!);
    const start = seconds(timing[0]!); const end = seconds(timing[1]!);
    return [{ id: `cue-${String(index + 1)}`, start, end, text: lines.slice(timingIndex + 1).join('\n').replace(/<[^>]+>/g, '').trim(), words: [] }];
  }).filter((cue) => cue.text));
}

function timestamp(value: number, separator: ',' | '.'): string {
  const millis = Math.round(value * 1000);
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor(millis % 3_600_000 / 60_000);
  const secondsPart = Math.floor(millis % 60_000 / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}${separator}${String(millis % 1000).padStart(3, '0')}`;
}

export function serializeCaptions(cues: CaptionCue[], format: 'srt' | 'vtt' | 'json'): string {
  if (format === 'json') return `${JSON.stringify(cues, null, 2)}\n`;
  const separator = format === 'srt' ? ',' : '.';
  const blocks = cues.map((cue, index) => `${format === 'srt' ? `${String(index + 1)}\n` : ''}${timestamp(cue.start, separator)} --> ${timestamp(cue.end, separator)}\n${cue.speaker ? `<v ${cue.speaker}>` : ''}${cue.text}`);
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}\n`;
}
