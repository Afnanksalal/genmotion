import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeAudioFile, analyzeOnsets, audioSpectrum } from '../src/engine/audio-analysis.js';
import { runProcess } from '../src/engine/process.js';

describe('source audio analysis', () => {
  it('resolves a bin-centered tone with calibrated Hann-window amplitude', () => {
    const size = 1024, bin = 64, magnitude = audioSpectrum(Float64Array.from({ length: size }, (_, index) => .5 * Math.sin(2 * Math.PI * bin * index / size)));
    expect(magnitude[bin]).toBeCloseTo(.5, 8); expect(magnitude[bin + 1]).toBeCloseTo(.25, 8); expect(magnitude[bin + 8]).toBeLessThan(1e-8);
    expect(() => audioSpectrum(new Float64Array(99))).toThrow();
  });
  it('finds regular onsets and rejects silence as a tempo', () => {
    const flux = Array.from({ length: 320 }, (_, index) => index % 16 === 0 ? 1 : 0);
    const result = analyzeOnsets(flux, 2, 10.24, 100, 140);
    expect(result.tempo.bpm).toBeCloseTo(117.1875, 4); expect(result.tempo.confidence).toBeGreaterThan(.99);
    expect(result.transients.length).toBeGreaterThan(15); expect(result.tempo.beats[0]).toBe(2);
    expect(analyzeOnsets(Array.from({ length: 100 }, () => 0), 0, 3.2, 60, 200).tempo.bpm).toBeNull();
  });
  it('preserves stereo anti-phase energy, silence windows and weighted pyramid RMS', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-analysis-test-'));
    try {
      const source = path.join(directory, 'antiphase.wav');
      await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', "aevalsrc=if(between(t\\,0.3\\,0.7)\\,0\\,0.5*sin(2*PI*1000*t))|-if(between(t\\,0.3\\,0.7)\\,0\\,0.5*sin(2*PI*1000*t)):s=16000:d=1.013", '-c:a', 'pcm_f32le', source]);
      const result = await analyzeAudioFile(source, { duration: 2, silenceDuration: .2 });
      expect(result.duration).toBeCloseTo(1.013, 3); expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.silence).toHaveLength(1); expect(result.silence[0]!.start).toBeCloseTo(.3, 2); expect(result.silence[0]!.end).toBeCloseTo(.7, 2);
      const aggregate = result.waveform.at(-1)!.values;
      expect(aggregate[2]).toBeCloseTo(aggregate[5]!, 6); expect(aggregate[2]).toBeGreaterThan(.2);
      expect(Math.max(...result.spectrum.values)).toBeGreaterThan(-20);
      const controller = new AbortController(); controller.abort();
      await expect(analyzeAudioFile(source, {}, { signal: controller.signal })).rejects.toThrow(/abort/i);
    } finally {
      const relative = path.relative(os.tmpdir(), directory);
      if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('genmotion-analysis-test-')) await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
