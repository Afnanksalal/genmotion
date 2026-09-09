import { describe, expect, it } from 'vitest';
import { audioEffectSchema } from '../src/ir/audio-effects.js';
import { audioEffectTiming, audioRackTiming, inspectProjectAudioTiming } from '../src/ir/audio-timing.js';
import { loadProject } from '../src/ir/loader.js';

describe('explicit audio effect timing', () => {
  it('reports compensated lookahead, state preroll and deterministic decay tails', () => {
    expect(audioEffectTiming(audioEffectSchema.parse({ id: 'limit', type: 'limiter', attackMs: 8 }))).toMatchObject({ latencySeconds: .008, latencyCompensated: true, prerollSeconds: .008, tailSeconds: 0 });
    const timing = audioRackTiming([
      audioEffectSchema.parse({ id: 'compress', type: 'compressor', attackMs: 25 }),
      audioEffectSchema.parse({ id: 'delay', type: 'delay', delayMs: 100, feedback: .5 }),
      audioEffectSchema.parse({ id: 'off', type: 'reverb', bypass: true }),
    ]);
    expect(timing.prerollSeconds).toBe(.025);
    expect(timing.tailSeconds).toBeCloseTo(1, 6);
    expect(timing.effects.map(effect => effect.id)).toEqual(['compress', 'delay']);
  });

  it('reports retained and truncated tails against the real project boundary', async () => {
    const { project } = await loadProject('tests/fixtures/basic');
    project.audio = [{ id: 'tail', src: 'tone.wav', start: 0, trimStart: 0, duration: .5, volume: 1, fadeIn: 0, fadeOut: 0, loop: false, duckUnderVoice: false, muted: false, solo: false, pan: 0, balance: 0, locked: false, kind: 'music', effects: [{ id: 'delay', type: 'delay', delayMs: 500, feedback: .5, wet: .5 }] }];
    const report = inspectProjectAudioTiming(project);
    expect(report.tracks[0]).toMatchObject({ audibleEnd: .5, retainedTailSeconds: .5, truncatedTailSeconds: 4.5 });
    expect(report.complete).toBe(false);
    expect(report.limitations).toHaveLength(2);
  });
});
