import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { createWorkflowBundle, instantiateWorkflowBundle, migrateWorkflowBundle, openWorkflowBundle } from '../src/ir/workflow-bundle.js';

describe('reusable workflow bundles', () => {
  it('freezes approved workflow structure and reports missing dependencies on reopen', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-workflow-bundle-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
      const loaded = await loadProject(directory), subjectHash = createHash('sha256').update('shot').digest('hex'), reviewedRevision = createHash('sha256').update('project').digest('hex');
      loaded.sourceProject.productionWorkflow = { version: 1, kind: 'product-film', stages: [], shots: [{ id: 'hero', title: 'Hero', direction: 'Reveal', narration: '', duration: 1, references: [{ path: 'missing-reference.png', description: 'Approved evidence' }], sourceEvidenceIds: [], layerIds: [], build: 'built', comments: [], review: { state: 'approved', subjectHash, reviewedRevision, author: 'director', note: 'Approved', at: '2026-09-09T00:00:00.000Z' } }] };
      await writeFile(path.join(directory, 'missing-reference.png'), 'evidence');
      const file = path.join(directory, 'workflow.json'), bundle = await createWorkflowBundle(loaded, file, [{ id: 'preflight', kind: 'validation', description: 'No error findings', required: true }]);
      expect((await openWorkflowBundle(file, directory)).ready).toBe(true);
      await rm(path.join(directory, 'missing-reference.png'));
      expect(await openWorkflowBundle(file, directory)).toMatchObject({ ready: false, diagnostics: [{ code: 'WORKFLOW_ASSET_MISSING', path: 'missing-reference.png' }] });
      const instance = instantiateWorkflowBundle(loaded.sourceProject, bundle);
      expect(instance.productionWorkflow?.shots[0]).toMatchObject({ id: 'hero', build: 'planned', comments: [] });
      expect(instance.productionWorkflow?.shots[0]?.review).toBeUndefined();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('migrates the bounded legacy format and rejects identity drift', async () => {
    const current = JSON.parse(await readFile(path.resolve('tests/fixtures/basic/genmotion.json'), 'utf8')) as Record<string, unknown>;
    const workflow = { version: 1, kind: 'motion-unit', shots: [], stages: [] };
    const migrated = migrateWorkflowBundle({ version: 0, createdAt: '2026-09-09T00:00:00.000Z', brief: null, designSpec: null, workflow, parameters: current.parameters ?? [], parameterValues: current.parameterValues ?? {}, assets: [], acceptanceChecks: [] });
    expect(migrated.migrations).toHaveLength(1);
    expect(() => migrateWorkflowBundle({ ...migrated.bundle, engineVersion: '999.0.0' })).toThrow(/immutable ID/);
  });
});
