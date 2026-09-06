import { z } from 'zod';
import { captionCueSchema, type CaptionCue } from './ir/schema.js';

function seconds(value: string): number {
  const match = /^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid subtitle timestamp: ${value}`);
  if (Number(match[2]) >= 60 || Number(match[3]) >= 60) throw new Error(`Invalid subtitle timestamp: ${value}`);
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

export function parseCaptions(content: string, format: 'srt' | 'vtt' | 'json'): CaptionCue[] {
  z.enum(['srt', 'vtt', 'json']).parse(format);
  if (Buffer.byteLength(content, 'utf8') > 32 * 1024 * 1024) throw new Error('Caption input exceeds 32 MiB');
  if (format === 'json') return z.array(captionCueSchema).parse(JSON.parse(content));
  const normalized = content.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/^WEBVTT[^\n]*\n+/i, '').trim();
  return z.array(captionCueSchema).parse(normalized.split(/\n{2,}/).flatMap((block, index) => {
    const lines = block.split('\n');
    if (format === 'vtt' && /^(NOTE(?:\s|$)|STYLE$|REGION$)/.test(lines[0] ?? '')) return [];
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) return [];
    const timing = lines[timingIndex]!.split('-->').map((part) => part.trim().split(/\s+/)[0]!);
    const start = seconds(timing[0]!); const end = seconds(timing[1]!);
    const body = lines.slice(timingIndex + 1).join('\n'), speaker = format === 'vtt' ? /<v(?:\.[^\s>]+)?\s+([^>]+)>/.exec(body)?.[1] : undefined;
    const plain = (value: string): string => decodeCaptionEntities(value.replace(/<[^>]+>/g, ''));
    const text = plain(body).trim();
    const words: CaptionCue['words'] = [];
    if (format === 'vtt' && /<(?:\d+:)?\d{2}:\d{2}\.\d{3}>/.test(body)) {
      const pieces = body.split(/(<(?:\d+:)?\d{2}:\d{2}\.\d{3}>)/), segments: Array<{ text: string; start: number }> = [];
      let clock = start;
      for (const piece of pieces) {
        if (/^<(?:\d+:)?\d{2}:\d{2}\.\d{3}>$/.test(piece)) {
          const next = seconds(piece.slice(1, -1)); if (next < clock || next < start || next > end) throw new Error('WebVTT inline timestamps must increase inside the cue'); clock = next;
        } else { const value = plain(piece).trim(); if (value) segments.push({ text: value, start: clock }); }
      }
      let cursor = 0;
      segments.forEach((segment, segmentIndex) => {
        const finish = segments[segmentIndex + 1]?.start ?? end, offset = text.indexOf(segment.text, cursor);
        if (finish <= segment.start || offset < 0) throw new Error('WebVTT timed text could not be aligned');
        words.push({ text: segment.text, start: segment.start, end: finish, startOffset: offset, endOffset: offset + segment.text.length }); cursor = offset + segment.text.length;
      });
    }
    return [{ id: `cue-${String(index + 1)}`, start, end, text, words, ...(speaker ? { speaker: decodeCaptionEntities(speaker) } : {}) }];
  }).filter((cue) => cue.text));
}

function decodeCaptionEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: '\u00a0', lrm: '\u200e', rlm: '\u200f', quot: '"', apos: "'" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|nbsp|lrm|rlm|quot|apos);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? match;
    const code = Number.parseInt(entity.slice(/^#x/i.test(entity) ? 2 : 1), /^#x/i.test(entity) ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
  });
}
function escapeCaptionText(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

function timestamp(value: number, separator: ',' | '.'): string {
  const millis = Math.round(value * 1000);
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor(millis % 3_600_000 / 60_000);
  const secondsPart = Math.floor(millis % 60_000 / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}${separator}${String(millis % 1000).padStart(3, '0')}`;
}

export function serializeCaptions(cues: CaptionCue[], format: 'srt' | 'vtt' | 'json'): string {
  z.enum(['srt', 'vtt', 'json']).parse(format);
  cues = z.array(captionCueSchema).parse(cues);
  if (format === 'json') return `${JSON.stringify(cues, null, 2)}\n`;
  const separator = format === 'srt' ? ',' : '.';
  const blocks = cues.map((cue, index) => `${format === 'srt' ? `${String(index + 1)}\n` : ''}${timestamp(cue.start, separator)} --> ${timestamp(cue.end, separator)}\n${format === 'vtt' && cue.speaker ? `<v ${escapeCaptionText(cue.speaker)}>${escapeCaptionText(cue.text)}</v>` : escapeCaptionText((cue.speaker ? cue.speaker + ': ' : '') + cue.text)}`);
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}\n`;
}
