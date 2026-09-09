import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../src/ir/loader.js';
import { applySemanticEdits, canApplySemanticEdit, commitSemanticEdits, inspectEditTarget, type EditTarget } from '../src/ir/edit.js';
import { animationTrackSchema } from '../src/ir/schema.js';
import { applyPatch } from '../src/ir/patch.js';
import { commitProject, readProjectSnapshot } from '../src/ir/store.js';

const target: EditTarget = { kind: 'scene', id: 'intro', layerId: 'title' };
const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('stable semantic editing', () => {
  it('targets identity after reordering and produces an exact inverse for a multi-operation edit', async () => {
    const { sourceProject } = await loadProject('tests/fixtures/basic');
    sourceProject.scenes[0]!.layers.reverse();
    const result = applySemanticEdits(sourceProject, [
      { op: 'text', target, text: 'Revised' },
      { op: 'property', target, path: ['fontSize'], value: 24 },
      { op: 'timing', target, start: 0.1, duration: 0.8 },
    ]);
    expect(inspectEditTarget(result.project, target).layer).toMatchObject({ text: 'Revised', fontSize: 24, start: 0.1, duration: 0.8 });
    expect(result.affectedTargets).toEqual([target]);
    expect(applyPatch(result.project, result.inverse)).toEqual(sourceProject);
    expect(inspectEditTarget(sourceProject, target).layer).not.toMatchObject({ text: 'Revised' });
  });

  it('refuses wrong types, missing or ambiguous targets, identity changes and misspelled properties', async () => {
    const { sourceProject: project } = await loadProject('tests/fixtures/basic');
    expect(canApplySemanticEdit(project, { op: 'text', target: { ...target, layerId: 'accent' }, text: 'bad' })).toMatchObject({ allowed: false, code: 'EDIT_UNSUPPORTED' });
    expect(canApplySemanticEdit(project, { op: 'text', target: { ...target, layerId: 'gone' }, text: 'bad' })).toMatchObject({ allowed: false, code: 'EDIT_TARGET_MISSING' });
    expect(canApplySemanticEdit(project, { op: 'property', target, path: ['id'], value: 'new-id' })).toMatchObject({ allowed: false, code: 'EDIT_ID_IMMUTABLE' });
    expect(canApplySemanticEdit(project, { op: 'property', target, path: ['fontSzie'], value: 24 })).toMatchObject({ allowed: false });
    expect(canApplySemanticEdit(project, { op: 'text', target, text: 'Capability' })).toMatchObject({ allowed: true, target: { resolved: true, locked: false, inherited: false, materializationRequired: false }, controls: expect.arrayContaining([{ id: 'text', enabled: true }, { id: 'asset', enabled: false, reason: expect.any(String) }]) });
    project.scenes[0]!.layers.push(structuredClone(inspectEditTarget(project, target).layer));
    expect(() => inspectEditTarget(project, target)).toThrow(/2 targets/);
  });

  it('separates reusable composition definitions from same-named scene layers', async () => {
    const { sourceProject: project } = await loadProject('tests/fixtures/basic');
    project.compositions.push({ id: 'reusable', width: 320, height: 180, duration: 1, layers: structuredClone(project.scenes[0]!.layers) });
    const scoped: EditTarget = { kind: 'composition', id: 'reusable', layerId: 'title' };
    const result = applySemanticEdits(project, [{ op: 'text', target: scoped, text: 'Reusable title' }]);
    expect(inspectEditTarget(result.project, scoped).layer).toMatchObject({ text: 'Reusable title' });
    expect(inspectEditTarget(result.project, target).layer).toEqual(inspectEditTarget(project, target).layer);
  });

  it('upserts tracks, replaces array properties without inserting, and guards dependencies', async () => {
    const { sourceProject: project } = await loadProject('tests/fixtures/basic');
    const track = animationTrackSchema.parse({ id: 'move', target: 'transform.x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 30 }] });
    const result = applySemanticEdits(project, [
      { op: 'track-put', target, track },
      { op: 'property', target, path: ['tracks', '0', 'keyframes', '1', 'value'], value: 40 },
    ]);
    const layer = inspectEditTarget(result.project, target).layer;
    expect(layer.tracks).toHaveLength(1);
    expect(layer.tracks[0]!.keyframes).toHaveLength(2);
    expect(layer.tracks[0]!.keyframes[1]!.value).toBe(40);
    const removed = applySemanticEdits(result.project, [{ op: 'track-remove', target, trackId: 'move' }]);
    expect(inspectEditTarget(removed.project, target).layer.tracks).toEqual([]);
    project.scenes[0]!.layers.find((item) => item.id === 'title')!.parentId = 'accent';
    expect(canApplySemanticEdit(project, { op: 'layer-remove', target: { ...target, layerId: 'accent' } })).toMatchObject({ allowed: false, code: 'EDIT_DEPENDANTS' });
  });

  it('commits one semantic transaction and undoes it only against the resulting revision', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-edit-')); cleanup.push(directory);
    await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
    const before = await readProjectSnapshot(directory);
    const receipt = await commitSemanticEdits(directory, [{ op: 'text', target, text: 'Revision-safe edit' }, { op: 'property', target, path: ['fontSize'], value: 20 }], { expectedRevision: before.revision });
    expect(receipt).toMatchObject({ state: 'saved', changed: true, affectedTargets: [target] });
    await expect(commitProject(directory, { expectedRevision: before.revision, update: (project) => applyPatch(project, receipt.inverse) })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await commitProject(directory, { expectedRevision: receipt.revision, update: (project) => applyPatch(project, receipt.inverse) });
    expect((await readProjectSnapshot(directory)).sourceProject).toEqual(before.sourceProject);
  });
});
