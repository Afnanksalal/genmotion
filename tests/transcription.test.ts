import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { correctTranscript, transcribeMedia, transcriptIsCurrent, transcriptToCaptions } from '../src/ir/transcription.js';

describe('provider-neutral transcription', () => {
  it('binds timed words to source/model provenance and converts only reviewed words', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-transcript-')), source = path.join(directory, 'voice.wav');
    try {
      await writeFile(source, 'audio'); const provider = { id: 'local-fixture', transcribe: () => Promise.resolve({ language: 'en', words: [{ text: 'Helo', start: 0, end: .4, confidence: .55 }, { text: 'world', start: .5, end: 1, confidence: .98 }] }) };
      let result = await transcribeMedia(source, provider, { language: 'en', model: 'tiny-local' }); expect(result).toMatchObject({ provider: 'local-fixture', model: 'tiny-local', language: 'en' }); expect(await transcriptIsCurrent(result, source)).toBe(true);
      result = correctTranscript(result, [{ id: 'word-1', text: 'Hello', accepted: true }, { id: 'word-2', accepted: true }]); const cue = transcriptToCaptions(result)[0]!; expect(cue.text).toBe('Hello world'); expect(cue.words[0]).toMatchObject({ text: 'Hello', startOffset: 0, endOffset: 5 });
      await writeFile(source, 'changed audio'); expect(await transcriptIsCurrent(result, source)).toBe(false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
