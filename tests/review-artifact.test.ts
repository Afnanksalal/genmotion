import { describe, expect, it } from 'vitest';
import { createReviewArtifact, invalidateReviewArtifact, reviewValuesHash } from '../src/ir/review-artifact.js';

const a = 'a'.repeat(64), b = 'b'.repeat(64), frame = { time: .5, sha256: b, path: 'review/frame-15.png' };
describe('revision-bound review artifacts', () => {
  it('binds every evidence family and invalidates only affected evidence classes', () => {
    const artifact = createReviewArtifact({ sourceRevision: 'revision-1', sourceHash: a, dependencyHash: b, checkReport: { sourceHash: a, ok: true }, representativeFrames: [frame], comparedVariants: [{ id: 'blue', valuesHash: reviewValuesHash({ accent: 'blue' }), frames: [frame], status: 'complete' }], audioFindings: [{ code: 'LOUDNESS', severity: 'warning', message: 'Review delivery loudness.', sourceHash: b }], unresolvedDecisions: [{ id: 'decision-1', question: 'Approve the hold?', target: 'scene:intro' }] });
    expect(invalidateReviewArtifact(artifact, { sourceHash: a, dependencyHash: b })).toMatchObject({ valid: true, invalidated: [], unresolvedDecisionsRetained: 1 });
    expect(invalidateReviewArtifact(artifact, { sourceHash: 'c'.repeat(64), dependencyHash: b })).toMatchObject({ valid: false, sourceChanged: true, invalidated: expect.arrayContaining(['checkReport', 'representativeFrames', 'comparedVariants', 'audioFindings']), unresolvedDecisionsRetained: 1 });
    expect(invalidateReviewArtifact(artifact, { sourceHash: a, dependencyHash: 'c'.repeat(64) })).toMatchObject({ dependenciesChanged: true, invalidated: expect.arrayContaining(['representativeFrames', 'comparedVariants', 'audioFindings']) });
  });
  it('refuses evidence from a different source hash', () => {
    expect(() => createReviewArtifact({ sourceRevision: 'r', sourceHash: a, dependencyHash: b, checkReport: { sourceHash: b }, representativeFrames: [], comparedVariants: [], audioFindings: [], unresolvedDecisions: [] })).toThrow('must match');
  });
});
 
