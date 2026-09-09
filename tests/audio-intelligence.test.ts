import { describe, expect, it } from 'vitest';
import { createAudioRepairJob, diagnoseAudio, evaluateAudioFeatureMapping, freezeAudioFeatures, proposeSpectralCarve, recomputeOwnedAudioEdits, type AudioAnalysis } from '../src/index.js';

const analysis = (sha: string, level = .2): AudioAnalysis => ({ version: 1, sourceSha256: sha.repeat(64).slice(0, 64), start: 0, duration: 2, requestedDuration: 2, sampleRate: 100, samples: 200, waveform: [{ samplesPerBin: 10, values: Array.from({ length: 20 }, (_, i) => i).flatMap(() => [-level, level, level, -level / 4, level / 4, level / 4]) }], spectrum: { fftSize: 8, hopSamples: 4, frequencies: [100, 1000], values: [-20, -30, -18, -28] }, transients: [{ time: .5, strength: .8 }], silence: [{ start: 1.5, end: 2 }], tempo: { bpm: 120, confidence: .8, beats: [0, .5, 1, 1.5], method: 'spectral-flux-autocorrelation' }, warnings: [] });

describe('audio intelligence contracts', () => {
  it('reports evidence and reviewable limitations for source diagnostics', () => {
    const report = diagnoseAudio(analysis('a', 1), { integratedLufs: -25, truePeakDbtp: 0, rangeLu: 4, thresholdLufs: -35, targetOffsetDb: 9, silence: false, warnings: [] });
    expect(report.findings.map(item => item.kind)).toEqual(expect.arrayContaining(['clipping', 'imbalance', 'silence', 'loudness']));
    expect(report.proposal).toEqual({ gainDb: 9, reviewRequired: true });
    expect(report.limitations.length).toBeGreaterThan(1);
  });

  it('freezes source-bound features and maps them deterministically under random seek', () => {
    const frozen = freezeAudioFeatures(analysis('b'), undefined, [{ id: 'nudge', action: 'move', feature: 'beat', from: .5, to: .52 }]);
    const mapping = { id: 'pulse', feature: 'beat' as const, target: 'title.scale', inputRange: [0, 1] as [number, number], outputRange: [1, 1.2] as [number, number], smoothingSeconds: .2, latencySeconds: .05, clamp: true };
    const first = evaluateAudioFeatureMapping(frozen, mapping, .55);
    evaluateAudioFeatureMapping(frozen, mapping, 1.8);
    expect(evaluateAudioFeatureMapping(frozen, mapping, .55)).toBe(first);
    expect(frozen.analysisHash).toMatch(/^[a-f0-9]{64}$/);
    expect(frozen.phrases.length).toBeGreaterThan(0);
  });

  it('proposes editable carving and replaces only owned edits with stale detection', () => {
    const proposal = proposeSpectralCarve(analysis('c'), analysis('d', .4), .7, ['dialogue', 'music']);
    const manual = { owner: 'user', generation: 1, sourceAnalysisHash: 'manual', membershipHash: 'manual', effects: [] };
    const first = recomputeOwnedAudioEdits([manual], proposal);
    const changed = recomputeOwnedAudioEdits(first.edits, proposeSpectralCarve(analysis('c'), analysis('e'), .7, ['dialogue', 'music', 'sting']));
    expect(proposal.bands.length).toBeGreaterThan(0);
    expect(changed.stale).toBe(true);
    expect(changed.edits.find(item => item.owner === 'user')).toEqual(manual);
    expect(changed.edits.find(item => item.owner.startsWith('genmotion'))?.generation).toBe(2);
  });

  it('creates reversible repair jobs with measured acceptance and retained originals', () => {
    const job = createAudioRepairJob('f'.repeat(64), 'delivery-safe', -1.2);
    expect(job).toMatchObject({ originalRetained: true, audition: { before: { bypass: true }, after: { bypass: false } }, acceptance: { measured: -1.2, passed: true }, reviewRequired: true });
    expect(job.effects[0]?.type).toBe('limiter');
  });
});
