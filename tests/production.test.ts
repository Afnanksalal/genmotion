import { describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProjectSnapshot, commitProject } from '../src/ir/store.js';
import { commitProductionAction, inspectProduction, type productionActionSchema } from '../src/ir/production-service.js';
import type { z } from 'zod';
import { renderFrame } from '../src/engine/draw.js';

describe('resumable production stages and storyboard review', () => {
  it('invalidates affected stages and stale reviews while preserving native pixels for planning edits', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-production-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
      const original = await readProjectSnapshot(directory), pixels = await renderFrame(original.project, directory, 0), scene = original.sourceProject.scenes[0]!;
      const action = async (value: z.input<typeof productionActionSchema>) => commitProductionAction(directory, (await readProjectSnapshot(directory)).revision, value);
      await action({ action: 'configure', kind: 'motion-unit' });
      await action({ action: 'complete-stage', stage: 'sources' });
      const shot = { id: 'opening', title: 'Opening', duration: scene.duration, direction: 'A clear opening', sceneId: scene.id };
      await action({ action: 'shot', shot });
      await action({ action: 'complete-stage', stage: 'planning' });
      await action({ action: 'shot', shot: { ...shot, build: 'built' } });
      let state = await inspectProduction(await readProjectSnapshot(directory));
      expect(state.stages.find((stage) => stage.stage === 'planning')?.state).toBe('complete');
      await action({ action: 'complete-stage', stage: 'authoring' });
      await action({ action: 'review', shotId: shot.id, author: 'Reviewer', state: 'approved' });
      const accepted = await readProjectSnapshot(directory);
      expect((await renderFrame(accepted.project, directory, 0)).equals(pixels)).toBe(true);
      await expect(action({ action: 'complete-stage', stage: 'verification' })).rejects.toThrow('evidence');
      state = await inspectProduction(accepted);
      await writeFile(path.join(directory, 'verified.json'), JSON.stringify({ version: 1, nativeHash: state.fingerprints.native, assetsHash: state.fingerprints.assets, passed: true, checks: [{ name: 'Planning metadata preserves pixels', passed: true }] }));
      await action({ action: 'complete-stage', stage: 'verification', evidence: ['verified.json'] });
      const current = await readProjectSnapshot(directory);
      await commitProject(directory, { expectedRevision: current.revision, update: (project) => { project.scenes[0]!.background = '#152637'; return project; } });
      state = await inspectProduction(await readProjectSnapshot(directory));
      expect(state.stages.map((stage) => stage.state)).toEqual(['complete', 'complete', 'stale', 'blocked', 'blocked']);
      expect(state.shots[0]?.review).toBe('stale');
      await expect(commitProductionAction(directory, accepted.revision, { action: 'configure', kind: 'explainer' })).rejects.toThrow('revision');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('refuses approving unbuilt shots or unresolved feedback and preserves comment history', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-production-comments-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
      const action = async (value: z.input<typeof productionActionSchema>) => commitProductionAction(directory, (await readProjectSnapshot(directory)).revision, value);
      await action({ action: 'configure', kind: 'explainer' });
      const scene = (await readProjectSnapshot(directory)).sourceProject.scenes[0]!;
      const shot = { id: 'shot', title: 'Shot', duration: scene.duration, sceneId: scene.id };
      await action({ action: 'shot', shot });
      await expect(action({ action: 'review', shotId: shot.id, state: 'approved', author: 'Reviewer' })).rejects.toThrow('built');
      await action({ action: 'shot', shot: { ...shot, build: 'built' } });
      await action({ action: 'comment', shotId: shot.id, author: 'Reviewer', body: 'Check the opening hold', frame: 0 });
      await expect(action({ action: 'review', shotId: shot.id, state: 'approved', author: 'Reviewer' })).rejects.toThrow('resolved');
      const comment = (await readProjectSnapshot(directory)).sourceProject.productionWorkflow!.shots[0]!.comments[0]!;
      await action({ action: 'resolve-comment', shotId: shot.id, commentId: comment.id, resolved: true });
      await action({ action: 'review', shotId: shot.id, state: 'approved', author: 'Reviewer' });
      await action({ action: 'shot', shot: { ...shot, title: 'Revised', build: 'built', comments: [] } });
      const snapshot = await readProjectSnapshot(directory), state = await inspectProduction(snapshot);
      expect(snapshot.sourceProject.productionWorkflow!.shots[0]!.comments).toHaveLength(1); expect(state.shots[0]!.review).toBe('stale');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
