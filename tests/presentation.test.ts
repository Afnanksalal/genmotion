import { describe, expect, it } from 'vitest';
import { planPresentationExport, PresentationSession, projectSchema, validatePresentationManifest } from '../src/index.js';

const project = projectSchema.parse({ schemaVersion: 1, id: 'deck', title: 'Deck', width: 320, height: 180, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [
  { id: 'intro', purpose: 'Intro', duration: 2, background: '#000', layers: [{ id: 'cta', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff' }] },
  { id: 'detail', purpose: 'Detail', duration: 3, background: '#000', layers: [{ id: 'detail-card', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff' }] }, { id: 'end', purpose: 'End', duration: 1, background: '#000', layers: [{ id: 'end-card', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff' }] },
] });
const manifest = { version: 1 as const, id: 'launch-deck', title: 'Launch', scenes: [
  { sceneId: 'intro', notes: 'Open clearly', fragments: [{ id: 'proof', at: 1 }], hotspots: [{ id: 'learn', layerId: 'cta', action: { type: 'branch' as const, branchId: 'details' } }] },
  { sceneId: 'detail', notes: 'Answer questions', fragments: [], hotspots: [] }, { sceneId: 'end', notes: 'Close', fragments: [], hotspots: [] },
], branches: [{ id: 'details', fromSceneId: 'intro', toSceneId: 'detail', returnSceneId: 'end' }] };

describe('native presentations', () => {
  it('validates stable identities and diagnoses missing targets and cycles', () => {
    expect(validatePresentationManifest(project, manifest)).toMatchObject({ ok: true, diagnostics: [] });
    const invalid = structuredClone(manifest); invalid.scenes[0]!.hotspots[0]!.layerId = 'gone'; invalid.branches[0]!.returnSceneId = undefined as never; invalid.branches.push({ id: 'loop', fromSceneId: 'detail', toSceneId: 'intro', returnSceneId: undefined as never });
    expect(validatePresentationManifest(project, invalid).diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(['PRESENTATION_HOTSPOT_TARGET_MISSING', 'PRESENTATION_BRANCH_CYCLE']));
  });
  it('keeps presenter notes private while synchronizing navigation and branch return', () => {
    const presenter = new PresentationSession(validatePresentationManifest(project, manifest).manifest, true), audience = new PresentationSession(validatePresentationManifest(project, manifest).manifest);
    expect(presenter.view()).toMatchObject({ sceneId: 'intro', notes: 'Open clearly' }); expect(audience.view().notes).toBeUndefined();
    const fragment = presenter.key('ArrowRight')!; expect(fragment).toMatchObject({ sceneId: 'intro', fragmentIndex: 0 }); const audienceFragment = audience.sync(fragment); expect(audienceFragment).toMatchObject({ sceneId: 'intro', fragmentIndex: 0 }); expect(audienceFragment.notes).toBeUndefined();
    const branched = presenter.branch('details'); expect(branched).toMatchObject({ sceneId: 'detail', branchStack: ['end'] }); expect(audience.sync(branched)).toMatchObject({ sceneId: 'detail', branchStack: ['end'] }); expect(presenter.key('Escape')).toMatchObject({ sceneId: 'end' });
  });
  it('creates an explicit deterministic export route and reports unreachable scenes', () => {
    const plan = planPresentationExport(project, manifest, { sceneHold: 2, fragmentHold: .5, route: ['intro', 'end'] });
    expect(plan).toMatchObject({ ok: true, unreachableScenes: ['detail'], segments: [{ sceneId: 'intro', sourceStart: 0, sourceEnd: 2, outputDuration: 2, kind: 'scene' }, { sceneId: 'intro', sourceStart: 1, sourceEnd: 1, outputDuration: .5, kind: 'fragment' }, { sceneId: 'end', sourceStart: 5, sourceEnd: 6, outputDuration: 2, kind: 'scene' }] });
    expect(planPresentationExport(project, manifest, { sceneHold: 2, fragmentHold: .5, route: ['missing'] })).toMatchObject({ ok: false, diagnostics: [{ code: 'PRESENTATION_ROUTE_UNRESOLVED' }] });
    expect(planPresentationExport(project, manifest, { sceneHold: 2, fragmentHold: .5 })).toMatchObject({ ok: false, diagnostics: [{ code: 'PRESENTATION_INTERACTION_UNRESOLVED' }] });
  });
});
