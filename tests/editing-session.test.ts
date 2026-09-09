import { describe, expect, it } from 'vitest';
import { projectSchema } from '../src/ir/schema.js';
import { EditingSession, memoryEditingAdapter } from '../src/ir/session.js';
import { reconcileProjects } from '../src/ir/reconcile.js';

function source() { return projectSchema.parse({ schemaVersion: 1, id: 'session', title: 'Session', width: 320, height: 180, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' }, scenes: [{ id: 'main', duration: 1, background: '#000', purpose: 'Editing', layers: [{ id: 'box', type: 'shape', shape: 'rect', x: 10, y: 10, width: 80, height: 80, fill: '#f00' }] }] }); }
const target = { kind: 'scene', id: 'main', layerId: 'box' } as const;

describe('shared editing session persistence', () => {
  it('coalesces a gesture, verifies readback, and restores both ends through undo and redo', async () => {
    const session = new EditingSession(memoryEditingAdapter(source()));
    try {
      const events: string[] = []; session.subscribe((event) => events.push(event.type));
      const before = await session.read();
      const first = await session.apply([{ op: 'property', target, path: ['x'], value: 20 }], { expectedRevision: before.revision, origin: 'human', coalesce: 'drag' });
      const second = await session.apply([{ op: 'property', target, path: ['x'], value: 30 }], { expectedRevision: first.revision, origin: 'human', coalesce: 'drag' });
      expect(second).toMatchObject({ state: 'verified', persisted: true, undoDepth: 1, evidence: { verificationScope: 'source-document', readback: { status: 'matched' } } });
      expect(second.afterRevision).toBe(second.revision); expect(events.slice(0, 4)).toEqual(['dispatch', 'commit', 'dispatch', 'commit']);
      await session.undo({ expectedRevision: second.revision });
      expect((await session.read()).project).toEqual(before.project);
      await session.redo();
      expect((await session.read()).project.scenes[0]!.layers[0]!.x).toBe(30);
    } finally { await session.dispose(); }
  });
  it('refuses stale transactions and rolls back the whole semantic batch', async () => {
    const session = new EditingSession(memoryEditingAdapter(source()));
    try {
      const before = await session.read();
      await expect(session.apply([{ op: 'property', target, path: ['x'], value: 20 }], { expectedRevision: 'stale' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
      await expect(session.apply([{ op: 'property', target, path: ['x'], value: 20 }, { op: 'layer-remove', target: { ...target, layerId: 'missing' } }])).rejects.toMatchObject({ code: 'EDIT_TARGET_MISSING' });
      expect(await session.read()).toEqual(before);
      expect(await session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 0 });
    } finally { await session.dispose(); }
  });
  it('keeps dry runs out of persistence and undo history', async () => {
    const session = new EditingSession(memoryEditingAdapter(source()));
    try {
      const before = await session.read();
      expect(await session.apply([{ op: 'property', target, path: ['x'], value: 50 }], { dryRun: true })).toMatchObject({ persisted: false, undoDepth: 0 });
      expect(await session.read()).toEqual(before);
    } finally { await session.dispose(); }
  });
  it('restores serialized and named checkpoints without losing revision guards', async () => {
    const adapter = memoryEditingAdapter(source()), session = new EditingSession(adapter);
    try {
      const before = await session.read();
      const named = await session.saveNamedCheckpoint('Before editing', before.revision);
      await session.apply([{ op: 'property', target, path: ['x'], value: 45 }]);
      const checkpoint = await session.checkpoint();
      const restored = new EditingSession(adapter);
      try { await restored.restore(checkpoint); await restored.undo(); expect((await restored.read()).project).toEqual(before.project); } finally { await restored.dispose(); }
      expect((await session.listNamedCheckpoints()).items[0]!.id).toBe(named.id);
    } finally { await session.dispose(); }
  });
  it('merges independent edits and explicitly reports competing property edits', () => {
    const base = source(), current = structuredClone(base), proposed = structuredClone(base);
    current.title = 'Human title'; proposed.scenes[0]!.layers[0]!.x = 40;
    expect(reconcileProjects(base, current, proposed)).toMatchObject({ conflicts: [], project: { title: 'Human title' } });
    current.scenes[0]!.layers[0]!.x = 60;
    const conflict = reconcileProjects(base, current, proposed);
    expect(conflict.project).toBeUndefined(); expect(conflict.conflicts).toHaveLength(1);
    expect(reconcileProjects(base, current, proposed, [{ path: conflict.conflicts[0]!.path, choice: 'proposed' }]).project!.scenes[0]!.layers[0]!.x).toBe(40);
  });
});
