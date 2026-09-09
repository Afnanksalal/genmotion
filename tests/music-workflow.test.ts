import { describe, expect, it } from 'vitest';
import { planMusicWorkflow, type FrozenAudioFeatures } from '../src/index.js';

const features: FrozenAudioFeatures = { version: 1, sourceSha256: 'a'.repeat(64), timeMap: { sourceStart: 0, timelineStart: 10, rate: 1 }, beats: [{ time: 4, strength: .8, confidence: .9 }, { time: 8, strength: 1, confidence: .9 }, { time: 12, strength: .7, confidence: .8 }], onsets: [], phrases: [{ start: 0, end: 4, energy: .4, confidence: .8 }, { start: 4, end: 8, energy: .8, confidence: .9 }, { start: 8, end: 12, energy: .3, confidence: .9 }], silence: [], corrections: [{ id: 'manual-end', action: 'move', feature: 'phrase', from: 7.8, to: 8, note: 'Reviewed cadence' }], analysisHash: 'b'.repeat(64) };

describe('music workflow planning', () => {
  it('selects a phrase ending, maps beat markers and retains source evidence', () => {
    const result = planMusicWorkflow(features, [{ id: 'line-1', start: 4, end: 5.2, text: 'We move', verified: true, source: 'reviewed transcript' }], { targetDuration: 4, preferredStart: 4 });
    expect(result.range).toEqual({ start: 4, end: 8, duration: 4, endingDistance: 0, confidence: .9 });
    expect(result.beatMarkers).toEqual([{ id: 'beat-1', sourceTime: 4, timelineTime: 14, strength: .8, confidence: .9 }, { id: 'beat-2', sourceTime: 8, timelineTime: 18, strength: 1, confidence: .9 }]);
    expect(result).toMatchObject({ verifiedLyrics: true, unresolved: [], evidence: { sourceSha256: 'a'.repeat(64), analysisHash: 'b'.repeat(64), phraseCandidates: 3 } });
  });
  it('reports short readable holds and refuses unverified or impossible source requests', () => {
    expect(planMusicWorkflow(features, [{ id: 'short', start: 4, end: 4.2, text: 'Go', verified: true, source: 'sheet' }], { targetDuration: 4 })).toMatchObject({ unresolved: [{ code: 'LYRIC_HOLD_SHORT', cueId: 'short' }] });
    expect(() => planMusicWorkflow(features, [{ id: 'draft', start: 0, end: 1, text: 'Maybe', verified: false, source: 'draft' }], { targetDuration: 4 })).toThrow(/explicitly verified/);
    expect(() => planMusicWorkflow(features, [], { targetDuration: 20 })).toThrow(/shorter/);
  });
});
