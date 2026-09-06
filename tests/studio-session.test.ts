import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { startStudio } from '../src/studio/server.js';
import { executeStudioCommand } from '../src/studio/bridge.js';
import type { EditingSnapshot } from '../src/ir/session.js';

describe('live Studio editing bridge', () => {
  it('shares permission-gated edits, navigation, named checkpoints and undo across clients', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-session-'));
    await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
    const studio = await startStudio(await loadProject(directory), { port: 0 });
    try {
      const token = (await (await fetch(studio.url + '/api/session')).json() as { token: string }).token;
      const headers = { 'content-type': 'application/json', 'x-genmotion-token': token };
      const initialContext = await (await fetch(studio.url + '/api/editing-session', { method: 'POST', headers, body: JSON.stringify({ action: 'context' }) })).json() as { result: { sequence: number; revision: string } };
      const syncBody = { action: 'context-update', patch: { frame: 2 }, expectedSequence: initialContext.result.sequence, expectedRevision: initialContext.result.revision, origin: 'browser-test' };
      const acceptedSync = await fetch(studio.url + '/api/editing-context/sync', { method: 'POST', headers, body: JSON.stringify(syncBody) });
      expect(acceptedSync.status).toBe(200);
      expect(await acceptedSync.json()).toMatchObject({ applied: true, result: { frame: 2 } });
      const staleSync = await fetch(studio.url + '/api/editing-context/sync', { method: 'POST', headers, body: JSON.stringify({ ...syncBody, patch: { frame: 4 } }) });
      expect(staleSync.status).toBe(200);
      expect(await staleSync.json()).toMatchObject({ applied: false, result: { frame: 2 } });
      const explicitStale = await fetch(studio.url + '/api/editing-session', { method: 'POST', headers, body: JSON.stringify(syncBody) });
      expect(explicitStale.status).toBe(400);
      expect(await explicitStale.json()).toMatchObject({ code: 'CONTEXT_CONFLICT' });

      expect(await executeStudioCommand(directory, { action: 'capabilities' })).toMatchObject({ permissions: { read: true, edit: false } });
      const read = await executeStudioCommand(directory, { action: 'read' }) as { result: EditingSnapshot };
      const edit = { action: 'apply', expectedRevision: read.result.revision, edits: [{ op: 'text', target: { kind: 'scene', id: 'intro', layerId: 'title' }, text: 'Shared history' }] } as const;
      await expect(executeStudioCommand(directory, { ...edit, edits: [...edit.edits] })).rejects.toMatchObject({ code: 'STUDIO_PERMISSION_DENIED' });
      expect((await fetch(studio.url + '/api/agent-bridge/permissions', { method: 'PUT', headers, body: JSON.stringify({ read: true, navigate: true, edit: true }) })).ok).toBe(true);
      const saved = await executeStudioCommand(directory, { ...edit, edits: [...edit.edits] }) as { result: { revision: string } };
      expect(saved).toMatchObject({ result: { persisted: true, state: 'verified' } });
      const checkpoint = await executeStudioCommand(directory, { action: 'checkpoint-save', name: 'Accepted title', expectedRevision: saved.result.revision }) as { result: { id: string } };
      const context = await executeStudioCommand(directory, { action: 'context' }) as { result: { sequence: number; revision: string } };
      expect(await executeStudioCommand(directory, { action: 'context-update', patch: { frame: 10 }, expectedSequence: context.result.sequence, expectedRevision: context.result.revision, origin: 'qa' })).toMatchObject({ result: { frame: 10 } });
      const undone = await fetch(studio.url + '/api/editing-session', { method: 'POST', headers, body: JSON.stringify({ action: 'undo', expectedRevision: saved.result.revision }) });
      expect(undone.ok).toBe(true);
      expect((await loadProject(directory)).sourceProject.scenes[0]!.layers.find(layer => layer.type === 'text')).toMatchObject({ text: 'GENMOTION' });
      expect(await executeStudioCommand(directory, { action: 'checkpoint-compare', id: checkpoint.result.id, offset: 0, limit: 10 })).toMatchObject({ result: { total: 1 } });
      const current = await executeStudioCommand(directory, { action: 'read' }) as { result: EditingSnapshot };
      await executeStudioCommand(directory, { action: 'checkpoint-restore', id: checkpoint.result.id, expectedRevision: current.result.revision });
      expect((await loadProject(directory)).sourceProject.scenes[0]!.layers.find(layer => layer.type === 'text')).toMatchObject({ text: 'Shared history' });
      await executeStudioCommand(directory, { action: 'checkpoint-delete', id: checkpoint.result.id });
      expect(await executeStudioCommand(directory, { action: 'checkpoint-list', offset: 0, limit: 10 })).toMatchObject({ result: { total: 0 } });
    } finally { await studio.close(); await rm(directory, { recursive: true, force: true }); }
  });
});
