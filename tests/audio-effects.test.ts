import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { audioEffectFilters, audioTempoFilters, decibelsToGain } from '../src/engine/audio-effects.js';
import { runProcess } from '../src/engine/process.js';
import { audioEffectsSchema } from '../src/ir/audio-effects.js';
import { audioRackCapabilities, audioRackPreset, copyAudioRack, duplicateAudioEffect, pasteAudioRack } from '../src/ir/audio-rack.js';
import { audioTrackSchema } from '../src/ir/schema.js';
import { loadProject } from '../src/ir/loader.js';
import { renderAudio, stereoPositionGains } from '../src/engine/audio.js';

describe('native audio effect racks', () => {
  it('combines constant-power pan with independent stereo balance', () => {
    expect(stereoPositionGains(0)).toEqual({ left: expect.closeTo(Math.SQRT1_2, 6), right: expect.closeTo(Math.SQRT1_2, 6) });
    expect(stereoPositionGains(-1, 1)).toEqual({ left: 0, right: expect.closeTo(0, 12) });
    expect(stereoPositionGains(1, -1)).toEqual({ left: expect.closeTo(0, 12), right: 0 });
    expect(stereoPositionGains(0, .5)).toEqual({ left: expect.closeTo(Math.SQRT1_2 * .5, 6), right: expect.closeTo(Math.SQRT1_2, 6) });
    expect(audioTrackSchema.parse({ id: 'locked', src: 'tone.wav', locked: true, balance: -.4 })).toMatchObject({ locked: true, balance: -.4, pan: 0 });
  });
  it('ducks music during voice activity and restores its tail after the voice ends', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-ducking-'));
    try {
      for (const [name, frequency] of [['music', 220], ['voice', 880]] as const) await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=1`, path.join(directory, `${name}.wav`)]);
      const { project } = await loadProject('tests/fixtures/basic');
      project.audioDucking = { thresholdDb: -40, ratio: 10, attackMs: 5, releaseMs: 20 };
      project.audio = [audioTrackSchema.parse({ id: 'music', src: 'music.wav', kind: 'music', duckUnderVoice: true }), audioTrackSchema.parse({ id: 'voice', src: 'voice.wav', kind: 'voice', start: 0.3, duration: 0.3 })];
      const result = await renderAudio(project, directory, path.join(directory, 'mix.wav'));
      const decoded = path.join(directory, 'mix.f32');
      await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', result.output, '-ac', '1', '-f', 'f32le', decoded]);
      const samples = await readFile(decoded);
      const musicAmplitude = (start: number): number => {
        let sine = 0, cosine = 0;
        for (let index = 0; index < 4800; index += 1) {
          const value = samples.readFloatLE((Math.round(start * 48000) + index) * 4), phase = 2 * Math.PI * 220 * index / 48000;
          sine += value * Math.sin(phase); cosine += value * Math.cos(phase);
        }
        return Math.hypot(sine, cosine) * 2 / 4800;
      };
      const before = musicAmplitude(0.1), during = musicAmplitude(0.45), after = musicAmplitude(0.85);
      expect(during).toBeLessThan(before * 0.4);
      expect(after).toBeGreaterThan(before * 0.85);
      expect(samples.length / 4).toBe(48000);
      const accepted = await readFile(result.output);
      const concurrent = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
        const output = path.join(directory, `parallel-${index}.wav`);
        await renderAudio(project, directory, output);
        return readFile(output);
      }));
      for (const rendered of concurrent) expect(createHash('sha256').update(rendered).digest('hex')).toBe(createHash('sha256').update(accepted).digest('hex'));
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30_000);

  it('exports and verifies all audio containers and preserves accepted mixes on failure', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-audio-export-'));
    try {
      await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(directory, 'tone.wav')]);
      const { project } = await loadProject('tests/fixtures/basic');
      project.audio = [
        audioTrackSchema.parse({ id: 'voice', src: 'tone.wav', kind: 'voice', duckUnderVoice: true, volume: 0.2 }),
        audioTrackSchema.parse({ id: 'music', src: 'tone.wav', kind: 'music', duckUnderVoice: true, volume: 0.1, effects: [{ id: 'limiter', type: 'limiter' }] }),
      ];
      for (const extension of ['wav', 'flac', 'm4a', 'opus']) {
        const result = await renderAudio(project, directory, path.join(directory, `mix.${extension}`));
        expect(result.bytes).toBeGreaterThan(100);
        expect(result.duration).toBe(1);
        expect(result.tracks).toBe(2);
      }
      const output = path.join(directory, 'mix.wav'), accepted = await readFile(output);
      project.audio[0]!.src = 'missing.wav';
      await expect(renderAudio(project, directory, output)).rejects.toThrow();
      expect(await readFile(output)).toEqual(accepted);
      await expect(renderAudio(project, directory, output, { signal: AbortSignal.abort() })).rejects.toThrow();
      expect(await readFile(output)).toEqual(accepted);
      project.audio = [];
      expect((await renderAudio(project, directory, path.join(directory, 'silence.wav'))).tracks).toBe(0);
      await expect(renderAudio(project, directory, path.join(directory, 'bad.txt'))).rejects.toThrow('require');
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30_000);

  it('validates bounded typed filters, bypass, decibels and tempo decomposition', () => {
    expect(decibelsToGain(-6)).toBeCloseTo(0.501187, 5);
    expect(audioTempoFilters(8)).toEqual(['atempo=2', 'atempo=2', 'atempo=2']);
    expect(audioTempoFilters(0.125)).toEqual(['atempo=0.5', 'atempo=0.5', 'atempo=0.5']);
    expect(audioTempoFilters(1)).toEqual([]);
    expect(audioTempoFilters(1.5, false)).toEqual(['asetrate=72000', 'aresample=48000']);
    expect(() => audioTempoFilters(0)).toThrow('between');
    expect(() => decibelsToGain(Infinity)).toThrow('finite');
    expect(audioEffectFilters(audioEffectsSchema.parse([{ id: 'eq', type: 'equalizer', frequency: 1000, gainDb: 3, bypass: true }]))).toEqual([]);
    expect(() => audioEffectsSchema.parse([{ id: 'x', type: 'limiter' }, { id: 'x', type: 'gate' }])).toThrow('unique');
    expect(() => audioEffectsSchema.parse([{ id: 'eq', type: 'equalizer', frequency: '1000;evil', gainDb: 3 }])).toThrow();
  });

  it('versions rack copy, duplication and presets while declaring automation limits', () => {
    const rack = audioEffectsSchema.parse([{ id: 'eq', type: 'equalizer', frequency: 1000, gainDb: 3 }]);
    const duplicated = duplicateAudioEffect(rack, 'eq', 'eq-copy');
    expect(duplicated.map(effect => effect.id)).toEqual(['eq', 'eq-copy']);
    const pasted = pasteAudioRack(copyAudioRack(rack), duplicated);
    expect(pasted.map(effect => effect.id)).toEqual(['eq', 'eq-copy', 'eq-2']);
    expect(audioRackPreset('voice-clean').map(effect => effect.type)).toEqual(['highpass', 'compressor']);
    expect(audioRackCapabilities).toMatchObject({ version: 1, ordered: true, maximumEffects: 32, automation: { supported: false, reason: expect.any(String) } });
    expect(audioRackCapabilities.types).toEqual(expect.arrayContaining(['low-shelf', 'high-shelf', 'saturation', 'delay', 'reverb', 'chorus', 'phaser', 'bitcrush']));
    expect(() => duplicateAudioEffect(rack, 'missing', 'copy')).toThrow('not found');
  });

  it('measures frequency rejection, gain reduction, limiting and gate attenuation in decoded PCM', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-audio-effects-'));
    try {
      let index = 0;
      const signal = async (frequency: number, filters: string[]): Promise<{ rms: number; peak: number; samples: number }> => {
        const output = path.join(directory, `${String(index++)}.f32`);
        await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=0.5`, '-af', ['volume=4', ...filters].join(','), '-f', 'f32le', '-ac', '1', output]);
        const buffer = await readFile(output);
        let sum = 0, peak = 0, count = 0;
        for (let offset = 4800 * 4; offset < buffer.length; offset += 4) { const value = buffer.readFloatLE(offset); sum += value * value; peak = Math.max(peak, Math.abs(value)); count += 1; }
        return { rms: Math.sqrt(sum / count), peak, samples: buffer.length / 4 };
      };
      const effects = (value: unknown): string[] => audioEffectFilters(audioEffectsSchema.parse(value));
      const reference = await signal(4000, []);
      const lowpass = await signal(4000, effects([{ id: 'lp', type: 'lowpass', frequency: 500 }]));
      expect(lowpass.rms).toBeLessThan(reference.rms / 20);
      const bass = await signal(100, []);
      const highpass = await signal(100, effects([{ id: 'hp', type: 'highpass', frequency: 2000 }]));
      expect(highpass.rms).toBeLessThan(bass.rms / 20);
      const eq = await signal(4000, effects([{ id: 'eq', type: 'equalizer', frequency: 4000, q: 1, gainDb: -12 }]));
      expect(eq.rms).toBeLessThan(reference.rms / 3);
      const compressed = await signal(4000, effects([{ id: 'c', type: 'compressor', thresholdDb: -24, ratio: 10, attackMs: 1 }]));
      expect(compressed.rms).toBeLessThan(reference.rms / 2);
      const limited = await signal(4000, effects([{ id: 'l', type: 'limiter', ceilingDb: -12 }]));
      expect(limited.peak).toBeLessThanOrEqual(decibelsToGain(-12) + 0.001);
      expect(limited.samples).toBe(reference.samples);
      const gated = await signal(4000, ['volume=0.001', ...effects([{ id: 'g', type: 'gate', thresholdDb: -30, ratio: 10, attackMs: 1, releaseMs: 1 }])]);
      expect(gated.rms).toBeLessThan(reference.rms * 0.00001);
      for (const effect of [
        { id: 'ls', type: 'low-shelf', frequency: 120, gainDb: 3 }, { id: 'hs', type: 'high-shelf', frequency: 8000, gainDb: -3 },
        { id: 'sat', type: 'saturation', drive: 2 }, { id: 'delay', type: 'delay', delayMs: 40 }, { id: 'room', type: 'reverb', roomSize: .3 },
        { id: 'chorus', type: 'chorus', delayMs: 20 }, { id: 'phaser', type: 'phaser' }, { id: 'crusher', type: 'bitcrush', bits: 6 },
      ]) {
        const processed = await signal(440, effects([effect]));
        expect(processed.rms).toBeGreaterThan(0);
        expect(Number.isFinite(processed.peak)).toBe(true);
      }
      const fast = await signal(4000, audioTempoFilters(2));
      expect(fast.samples).toBeLessThan(reference.samples * 0.55);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30_000);
});
