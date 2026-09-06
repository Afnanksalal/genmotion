import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitEasing, copyEasing, pasteEasing } from '../src/ir/easing-edits.js';
import { readProjectSnapshot } from '../src/ir/store.js';
import { projectSchema } from '../src/ir/schema.js';

describe('shared easing clipboard commands', () => {
  it('supports validated dry runs, durable paste and stale-revision refusal', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-easing-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
      const before = await readProjectSnapshot(directory);
      const address = { kind: 'scene' as const, id: before.sourceProject.scenes[0]!.id, path: ['transitionOut', 'timing'] };
      const proposal = await commitEasing(directory, address, 'sine-out', { expectedRevision: before.revision, dryRun: true });
      expect(proposal.persisted).toBe(false);
      expect((await readProjectSnapshot(directory)).revision).toBe(before.revision);
      const saved = await commitEasing(directory, address, 'sine-out', { expectedRevision: before.revision });
      expect(copyEasing((await readProjectSnapshot(directory)).sourceProject, address)).toBe('sine-out');
      await expect(commitEasing(directory, address, 'linear', { expectedRevision: before.revision })).rejects.toThrow('changed');
      expect((await readProjectSnapshot(directory)).revision).toBe(saved.revision);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('copies complete Bezier and spring settings without sharing mutable values', async () => {
    const project = projectSchema.parse(JSON.parse(await readFile('tests/fixtures/basic/genmotion.json', 'utf8')));
    const source = { kind: 'scene' as const, id: project.scenes[0]!.id, path: ['transitionIn', 'ease'] };
    const destination = { ...source, path: ['transitionOut', 'ease'] };
    const curve = { type: 'cubic-bezier' as const, x1: 0.25, y1: -0.3, x2: 0.75, y2: 1.3 };
    project.scenes[0]!.transitionIn.ease = curve;
    const copied = copyEasing(project, source);
    expect(copied).toEqual(curve);
    const result = pasteEasing(project, destination, copied);
    expect(result.scenes[0]!.transitionOut.ease).toEqual(curve);
    expect(project.scenes[0]!.transitionOut.ease).not.toEqual(curve);
    curve.y1 = 0;
    expect(copyEasing(result, destination)).toEqual({ ...curve, y1: -0.3 });
    const spring = { type: 'spring' as const, mass: 2, stiffness: 150, damping: 10, velocity: -2, clamp: true };
    expect(copyEasing(pasteEasing(project, destination, spring), destination)).toEqual(spring);
  });

  it('refuses inherited, missing and non-easing targets', async () => {
    const project = projectSchema.parse(JSON.parse(await readFile('tests/fixtures/basic/genmotion.json', 'utf8')));
    const base = { kind: 'scene' as const, id: project.scenes[0]!.id };
    for (const path of [['duration'], ['__proto__', 'ease'], ['missing', 'ease'], ['brand', 'timing']]) expect(() => copyEasing(project, { ...base, path })).toThrow();
    expect(copyEasing(project, { ...base, path: ['transitionIn', 'timing'] })).toEqual(project.scenes[0]!.transitionIn.ease);
    expect(() => copyEasing(project, { ...base, id: 'missing', path: ['transitionIn', 'ease'] })).toThrow();
  });
});
