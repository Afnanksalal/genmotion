import { describe, expect, it } from 'vitest';
import { analyzeReferenceMeasurements, compileObservationTracks, correctReferenceObservation, inspectReferenceAdaptation, referenceAdaptationMapSchema, referenceObservationSchema } from '../src/ir/reference-adaptation.js';
import { loadProject } from '../src/ir/loader.js';
import { referenceSourcesSchema } from '../src/ir/reference-rights.js';
import { referencePreparationGraphSchema } from '../src/ir/reference-preparation.js';

const source = { sha256: 'a'.repeat(64), analyzer: 'genmotion-reference', version: '1' };
describe('reviewable reference adaptation', () => {
  it('retains pixel provenance, intentional changes, corrections and seek-safe track inputs', () => {
    const map = referenceAdaptationMapSchema.parse({ version: 1, entries: [{ id: 'opening', referenceId: 'study', referenceInterval: { start: 0, end: 2 }, measurementIds: ['title-box'], targets: [{ sceneId: 'intro', layerId: 'title', property: 'transform', pixelOrigin: 'original-native' }, { sceneId: 'intro', layerId: 'plate', pixelOrigin: 'generated-replacement' }], intentionalDifferences: [{ region: { x: 0, y: 0, width: 1, height: .2 }, reason: 'Replace supplied branding with owned identity.' }] }] });
    expect(map.entries[0]?.targets.map(target => target.pixelOrigin)).toEqual(['original-native', 'generated-replacement']);
    const first = referenceObservationSchema.parse({ id: 'cursor-1', referenceId: 'study', kind: 'cursor-position', interval: { start: .25, end: .26 }, confidence: .8, point: { x: .2, y: .4 }, source });
    const corrected = correctReferenceObservation(first, { point: { x: .25, y: .45 }, confidence: 1 }, 'reviewer', 'Aligned to the visible pointer hotspot.', '2026-09-09T00:00:00.000Z');
    expect(corrected.correction?.previousHash).toMatch(/^[a-f0-9]{64}$/);
    const tracks = compileObservationTracks([corrected, { ...first, id: 'cursor-2', interval: { start: .75, end: .76 }, point: { x: .8, y: .6 } }], { layerId: 'cursor', width: 1920, height: 1080 });
    expect(tracks).toMatchObject([{ target: 'transform.x', keyframes: [{ at: .25, value: 480 }, { at: .75, value: 1536 }] }, { target: 'transform.y', keyframes: [{ at: .25, value: 486 }, { at: .75, value: 648 }] }]);
    const analysis = analyzeReferenceMeasurements({ referenceId: 'study', sourceSha256: source.sha256, analyzer: 'measurement-v1', analyzerVersion: '1', landmarkThreshold: .7, samples: [{ at: 0, motionEnergy: .1, cursor: { x: .1, y: .2, confidence: .9 } }, { at: 1, motionEnergy: .9, motionPoint: { x: .5, y: .5, confidence: .8 }, camera: { x: .4, y: .4, confidence: .7 }, regions: [{ id: 'title', x: .1, y: .1, width: .8, height: .2, confidence: .95 }] }, { at: 2, motionEnergy: .2 }] });
    expect(analysis.observations.map(item => item.kind)).toEqual(['cursor-position', 'timing-landmark', 'motion-landmark', 'camera-position', 'visual-region']); expect(analysis.truncated).toBe(false);
  });
  it('validates source, measurement and native target identities for Studio and delivery', async () => {
    const project = (await loadProject('tests/fixtures/basic')).project;
    project.referenceSources = referenceSourcesSchema.parse([{ id: 'study', path: 'study.mp4', contentHash: 'a'.repeat(64), originalLocation: 'supplied', rights: 'licensed', permittedUses: ['internal-review'], redistribution: 'prohibited', authorization: { actor: 'owner', at: '2026-09-09T00:00:00.000Z', basis: 'Internal study' } }]);
    project.referencePreparations = [referencePreparationGraphSchema.parse({ version: 1, referenceId: 'study', nodes: [{ id: 'title-box', kind: 'measurement', path: 'measurement.json', sha256: 'b'.repeat(64), parents: [{ id: 'raw', sha256: 'c'.repeat(64) }], tool: { id: 'measure', version: '1' }, timeMap: [], retainedRegions: [], replacedRegions: [] }, { id: 'raw', kind: 'raw', path: 'study.mp4', sha256: 'c'.repeat(64), parents: [], tool: { id: 'freeze', version: '1' }, timeMap: [], retainedRegions: [], replacedRegions: [] }] })];
    project.referenceAdaptationMap = referenceAdaptationMapSchema.parse({ version: 1, entries: [{ id: 'opening', referenceId: 'study', referenceInterval: { start: 0, end: 1 }, measurementIds: ['title-box'], targets: [{ sceneId: 'intro', layerId: 'accent', pixelOrigin: 'source-derived' }] }] });
    expect(inspectReferenceAdaptation(project)).toMatchObject({ ok: true, entries: 1, origins: { 'source-derived': 1 } });
    project.referenceAdaptationMap.entries[0]!.targets[0]!.layerId = 'missing'; expect(inspectReferenceAdaptation(project)).toMatchObject({ ok: false, findings: [expect.objectContaining({ code: 'ADAPTATION_LAYER_MISSING' })] });
  });
});
