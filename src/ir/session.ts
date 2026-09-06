import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { applySemanticEdits, canApplySemanticEdit, inspectEditTarget, semanticEditSchema, editTargetSchema, type SemanticEdit, type EditTarget } from './edit.js';
import { projectSchema, type GenmotionProject } from './schema.js';
import { commitProject, fileRevision, readProjectSourceSnapshot } from './store.js';
import { assertTrackLocks } from './track-locks.js';
import type { Finding } from './validate.js';
import { documentDiff, documentGestureSignature, documentPointerValue } from './document-diff.js';
import type { PatchOperation } from './patch.js';
import { editingQuerySchema, queryEditingProject, type EditingQuery } from './query.js';
import { reconcileProjects, reconciliationResolutionSchema, type ReconciliationResolution, type ReconciliationResult } from './reconcile.js';
import { editingContextPatchSchema, initialEditingContext, editingContextView, updateEditingContext, type EditingContextPatch, type EditingContextState, type EditingContextView } from './editing-context.js';
import { filesystemCheckpointStore, memoryCheckpointStore, makeNamedCheckpoint, type NamedCheckpointStore, type CheckpointSummary } from './checkpoints.js';

export interface EditingSnapshot { project: GenmotionProject; revision: string }
export interface EditingWriteOptions { expectedRevision: string; origin: string; dryRun: boolean; strict: boolean; signal: AbortSignal }
export interface EditingWriteResult { snapshot: EditingSnapshot; persisted: boolean; validation: 'schema' | 'native' | 'host'; findings: Finding[] }
/** Hosts must implement compare-and-swap and atomic persistence. A rejected write must leave the old document intact. */
export interface EditingAdapter {
  checkpoints?: NamedCheckpointStore;
  read(): Promise<EditingSnapshot>;
  write(project: GenmotionProject, options: EditingWriteOptions): Promise<EditingWriteResult>;
  dispose?(): void | Promise<void>;
}
export function filesystemEditingAdapter(input: string): EditingAdapter {
  const store = async (): Promise<NamedCheckpointStore> => { const snapshot = await readProjectSourceSnapshot(input); return filesystemCheckpointStore(snapshot.projectDir, fileRevision(snapshot.projectFile)); };
  return {
    checkpoints: { async list() { return (await store()).list(); }, async read(id) { return (await store()).read(id); }, async create(entry) { return (await store()).create(entry); }, async remove(id) { return (await store()).remove(id); } },
    async read() { const snapshot = await readProjectSourceSnapshot(input); return { project: snapshot.sourceProject, revision: snapshot.revision }; },
    async write(project, options) {
      const receipt = await commitProject(input, { ...options, update: () => project });
      return { snapshot: { project: receipt.loaded.sourceProject, revision: receipt.revision }, persisted: receipt.persisted, validation: 'native', findings: receipt.findings };
    },
  };
}
export function memoryEditingAdapter(initial: GenmotionProject, validate?: (project: GenmotionProject, signal: AbortSignal) => Promise<Finding[]>): EditingAdapter {
  let project = projectSchema.parse(structuredClone(initial));
  const revision = (): string => fileRevision(JSON.stringify(project));
  return {
    checkpoints: memoryCheckpointStore(),
    read() { return Promise.resolve({ project: structuredClone(project), revision: revision() }); },
    async write(proposal, options) {
      if (options.signal.aborted) throw options.signal.reason;
      if (options.expectedRevision !== revision()) throw new GenmotionError('REVISION_CONFLICT', 'Memory document changed before the write.');
      const parsed = projectSchema.parse(structuredClone(proposal)); assertTrackLocks(project, parsed);
      const findings = validate ? await validate(parsed, options.signal) : [];
      if (findings.some(item => item.severity === 'error' || options.strict)) throw new GenmotionError('EDIT_VALIDATION_FAILED', 'The proposed document has validation findings.', { findings });
      if (options.signal.aborted) throw options.signal.reason;
      if (options.expectedRevision !== revision()) throw new GenmotionError('REVISION_CONFLICT', 'Memory document changed while validation ran.');
      if (!options.dryRun) project = parsed;
      return { snapshot: { project: structuredClone(parsed), revision: fileRevision(JSON.stringify(parsed)) }, persisted: !options.dryRun, validation: validate ? 'host' : 'schema', findings };
    },
  };
}

const sessionProjectSchema: z.ZodType<GenmotionProject> = projectSchema;
const historyEntrySchema = z.object({ before: sessionProjectSchema, after: sessionProjectSchema, origin: z.string(), group: z.string().optional(), signature: z.string(), at: z.number().finite() }).strict();
export const editingCheckpointSchema: z.ZodType<EditingCheckpoint> = z.object({ version: z.literal(1), revision: z.string().min(1), undo: z.array(historyEntrySchema).max(500), redo: z.array(historyEntrySchema).max(500) }).strict();
interface HistoryEntry { before: GenmotionProject; after: GenmotionProject; origin: string; group?: string | undefined; signature: string; at: number }
export interface EditingCheckpoint { version: 1; revision: string; undo: HistoryEntry[]; redo: HistoryEntry[] }
export interface EditingReceipt {
  id: string; state: 'saved' | 'validated' | 'verified'; changed: boolean; persisted: boolean; beforeRevision: string; revision: string;
  origin: string; affectedTargets: EditTarget[]; validation: EditingWriteResult['validation']; findings: Finding[];
  undoDepth: number; redoDepth: number;
  inverse: PatchOperation[];
  evidence: {
    readback: { status: 'matched' | 'mismatched' | 'unavailable' | 'not-applicable'; revision?: string; reason?: string };
    verificationScope: 'source-document' | 'none';
    frames: Array<{ frame: number; revision: string; sha256: string; path: string }>;
  };
}
export interface EditingFailureReceipt {
  id: string; state: 'refused' | 'failed'; changed: false; persisted: false;
  beforeRevision: string; origin: string; stage: 'proposal' | 'persistence'; code: string; message: string;
}

function editingFailure(error: unknown, beforeRevision: string, origin: string, stage: EditingFailureReceipt['stage']): GenmotionError {
  const code = error instanceof GenmotionError ? error.code : error instanceof z.ZodError ? 'EDIT_SCHEMA_INVALID' : stage === 'proposal' ? 'EDIT_PROPOSAL_FAILED' : 'EDIT_PERSISTENCE_FAILED';
  const message = error instanceof Error ? error.message : String(error);
  const refused = stage === 'proposal' || /REVISION|VALIDATION|LOCKED|LOCK_CONFLICT/.test(code);
  const failureReceipt: EditingFailureReceipt = { id: randomUUID(), state: refused ? 'refused' : 'failed', changed: false, persisted: false, beforeRevision, origin, stage, code, message };
  return new GenmotionError(code, message, { failureReceipt, cause: error instanceof GenmotionError ? error.details : error instanceof z.ZodError ? error.issues : undefined });
}
export type EditingEvent = { type: 'commit' | 'undo' | 'redo'; receipt: EditingReceipt } | { type: 'context'; context: EditingContextView } | { type: 'failed'; code: string; message: string } | { type: 'disposed' };
export interface SessionApplyOptions { expectedRevision?: string | undefined; origin?: string | undefined; dryRun?: boolean | undefined; strict?: boolean | undefined; coalesce?: string | undefined }
export interface EditingSessionOptions { maxHistory?: number; maxHistoryBytes?: number; coalesceWindowMs?: number; ownsAdapter?: boolean }
const commandOptions = { expectedRevision: z.string().min(1).optional(), origin: z.string().min(1).max(200).optional(), dryRun: z.boolean().optional(), strict: z.boolean().optional() };
export const editingCommandSchema: z.ZodType<EditingCommand> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read') }).strict(),
  z.object({ action: z.literal('query'), query: editingQuerySchema }).strict(),
  z.object({ action: z.literal('history') }).strict(),
  z.object({ action: z.literal('context') }).strict(),
  z.object({ action: z.literal('context-update'), patch: editingContextPatchSchema, expectedSequence: z.number().int().nonnegative(), expectedRevision: z.string().min(1), origin: z.string().min(1).max(200).default('sdk') }).strict(),
  z.object({ action: z.literal('reconcile'), base: sessionProjectSchema, proposed: sessionProjectSchema, resolutions: reconciliationResolutionSchema.array().max(1000).default([]), ...commandOptions }).strict(),
  z.object({ action: z.literal('inspect'), target: editTargetSchema }).strict(),
  z.object({ action: z.literal('can'), edit: semanticEditSchema }).strict(),
  z.object({ action: z.literal('apply'), edits: semanticEditSchema.array().min(1).max(500), coalesce: z.string().min(1).max(200).optional(), ...commandOptions }).strict(),
  z.object({ action: z.literal('replace'), project: sessionProjectSchema, coalesce: z.string().min(1).max(200).optional(), ...commandOptions }).strict(),
  z.object({ action: z.enum(['undo', 'redo']), ...commandOptions }).strict(),
  z.object({ action: z.literal('checkpoint') }).strict(),
  z.object({ action: z.literal('checkpoint-save'), name: z.string().trim().min(1).max(200), expectedRevision: z.string().min(1) }).strict(),
  z.object({ action: z.literal('checkpoint-list'), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict(),
  z.object({ action: z.literal('checkpoint-compare'), id: z.string().uuid(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict(),
  z.object({ action: z.literal('checkpoint-restore'), id: z.string().uuid(), ...commandOptions }).strict(),
  z.object({ action: z.literal('checkpoint-delete'), id: z.string().uuid() }).strict(),
]);
export type EditingCommand =
  | { action: 'read' | 'history' | 'context' | 'checkpoint' }
  | { action: 'query'; query: EditingQuery }
  | { action: 'context-update'; patch: EditingContextPatch; expectedSequence: number; expectedRevision: string; origin: string }
  | ({ action: 'reconcile'; base: GenmotionProject; proposed: GenmotionProject; resolutions: ReconciliationResolution[] } & SessionApplyOptions)
  | { action: 'inspect'; target: EditTarget }
  | { action: 'can'; edit: SemanticEdit }
  | ({ action: 'apply'; edits: SemanticEdit[] } & SessionApplyOptions)
  | ({ action: 'replace'; project: GenmotionProject } & SessionApplyOptions)
  | ({ action: 'undo' | 'redo' } & SessionApplyOptions)
  | { action: 'checkpoint-save'; name: string; expectedRevision: string }
  | { action: 'checkpoint-list'; offset: number; limit: number }
  | { action: 'checkpoint-compare'; id: string; offset: number; limit: number }
  | ({ action: 'checkpoint-restore'; id: string } & SessionApplyOptions)
  | { action: 'checkpoint-delete'; id: string };
export async function executeEditingCommand(session: EditingSession, input: EditingCommand): Promise<unknown> {
  const command = editingCommandSchema.parse(input);
  switch (command.action) {
    case 'read': return await session.read();
    case 'query': return await session.query(command.query);
    case 'history': return await session.historyState();
    case 'context': return await session.context();
    case 'context-update': return await session.updateContext(command.patch, command);
    case 'reconcile': return await session.reconcile(command.base, command.proposed, command.resolutions, command);
    case 'inspect': return await session.inspect(command.target);
    case 'can': return await session.can(command.edit);
    case 'apply': return await session.apply(command.edits, command);
    case 'replace': return await session.replace(command.project, command);
    case 'undo': return await session.undo(command);
    case 'redo': return await session.redo(command);
    case 'checkpoint': return await session.checkpoint();
    case 'checkpoint-save': return await session.saveNamedCheckpoint(command.name, command.expectedRevision);
    case 'checkpoint-list': return await session.listNamedCheckpoints(command.offset, command.limit);
    case 'checkpoint-compare': return await session.compareNamedCheckpoint(command.id, command.offset, command.limit);
    case 'checkpoint-restore': return await session.restoreNamedCheckpoint(command.id, command);
    case 'checkpoint-delete': return await session.deleteNamedCheckpoint(command.id);
  }
}

/** One mutation queue, one persistence call and one history entry per accepted batch. */
export class EditingSession {
  private undoEntries: HistoryEntry[] = [];
  private redoEntries: HistoryEntry[] = [];
  private historyRevision: string | undefined;
  private contextState: EditingContextState = initialEditingContext();
  private listeners = new Set<(event: EditingEvent) => void>();
  private pending: Promise<unknown> = Promise.resolve();
  private closed = false;
  private abort = new AbortController();
  private readonly limits: Required<EditingSessionOptions>;
  constructor(private readonly adapter: EditingAdapter, options: EditingSessionOptions = {}) {
    this.limits = { maxHistory: 100, maxHistoryBytes: 32 * 1024 * 1024, coalesceWindowMs: 750, ownsAdapter: false, ...options };
    for (const key of ['maxHistory', 'maxHistoryBytes', 'coalesceWindowMs'] as const) if (!Number.isSafeInteger(this.limits[key]) || this.limits[key] < 0) throw new GenmotionError('SESSION_OPTIONS_INVALID', `${key} must be a nonnegative integer.`);
    if (this.limits.maxHistory > 500) throw new GenmotionError('SESSION_OPTIONS_INVALID', 'At most 500 history entries can be retained.');
  }
  private assertOpen(): void { if (this.closed) throw new GenmotionError('SESSION_DISPOSED', 'Editing session has been disposed.'); }
  private checkpointStore(): NamedCheckpointStore { if (!this.adapter.checkpoints) throw new GenmotionError('CHECKPOINT_STORE_UNAVAILABLE', 'This host has not supplied a named checkpoint store.'); return this.adapter.checkpoints; }
  saveNamedCheckpoint(name: string, expectedRevision: string): Promise<CheckpointSummary> {
    return this.enqueue(async () => { const snapshot = await this.adapter.read(); if (snapshot.revision !== expectedRevision) throw new GenmotionError('REVISION_CONFLICT', 'Read the current revision before naming a checkpoint.'); const entry = makeNamedCheckpoint(snapshot.project, snapshot.revision, name); await this.checkpointStore().create(entry); const { project: _project, ...summary } = entry; void _project; return summary; });
  }
  listNamedCheckpoints(offset = 0, limit = 50): Promise<{ total: number; items: CheckpointSummary[]; nextOffset: number | null }> {
    z.number().int().nonnegative().parse(offset); z.number().int().min(1).max(100).parse(limit);
    return this.enqueue(async () => { const entries = await this.checkpointStore().list(); return { total: entries.length, items: entries.slice(offset, offset + limit), nextOffset: offset + limit < entries.length ? offset + limit : null }; });
  }
  compareNamedCheckpoint(id: string, offset = 0, limit = 50): Promise<{ revision: string; total: number; nextOffset: number | null; changes: Array<{ op: string; path: string; beforeExists: boolean; afterExists: boolean; before?: unknown; after?: unknown; omitted?: boolean; bytes: number }> }> {
    z.number().int().nonnegative().parse(offset); z.number().int().min(1).max(100).parse(limit);
    return this.enqueue(async () => {
      const current = await this.adapter.read(), checkpoint = await this.checkpointStore().read(id), changes = documentDiff(checkpoint.project, current.project);
      let budget = 16384;
      return { revision: current.revision, total: changes.length, nextOffset: offset + limit < changes.length ? offset + limit : null, changes: changes.slice(offset, offset + limit).map(change => {
        const before = documentPointerValue(checkpoint.project, change.path), after = documentPointerValue(current.project, change.path);
        const bytes = Buffer.byteLength(JSON.stringify([before, after]));
        const summary = { op: change.op, path: change.path, beforeExists: before.exists, afterExists: after.exists, bytes };
        if (bytes > budget) return { ...summary, omitted: true };
        budget -= bytes; return { ...summary, before: structuredClone(before.value), after: structuredClone(after.value) };
      }) };
    });
  }
  async restoreNamedCheckpoint(id: string, options: SessionApplyOptions = {}): Promise<EditingReceipt> {
    const checkpoint = await this.enqueue(async () => this.checkpointStore().read(id));
    return this.replace(checkpoint.project, { ...options, origin: options.origin ?? 'checkpoint-restore' });
  }
  deleteNamedCheckpoint(id: string): Promise<{ deleted: string }> { return this.enqueue(async () => { await this.checkpointStore().remove(id); return { deleted: id }; }); }
  private emit(event: EditingEvent): void { for (const listener of this.listeners) { try { listener(structuredClone(event)); } catch { /* Host observers cannot roll back an accepted edit. */ } } }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    this.assertOpen();
    const result = this.pending.then(async () => { this.assertOpen(); return await work(); });
    this.pending = result.catch(error => { this.emit({ type: 'failed', code: error instanceof GenmotionError ? error.code : 'SESSION_FAILED', message: error instanceof Error ? error.message : String(error) }); });
    return result;
  }
  subscribe(listener: (event: EditingEvent) => void): () => void { this.assertOpen(); this.listeners.add(listener); return () => this.listeners.delete(listener); }
  read(): Promise<EditingSnapshot> { return this.enqueue(async () => structuredClone(await this.adapter.read())); }
  context(): Promise<EditingContextView & { undoDepth: number; redoDepth: number }> {
    return this.enqueue(async () => { const snapshot = await this.adapter.read(); const stale = this.historyRevision !== undefined && this.historyRevision !== snapshot.revision; return { ...editingContextView(snapshot.project, snapshot.revision, this.contextState), undoDepth: stale ? 0 : this.undoEntries.length, redoDepth: stale ? 0 : this.redoEntries.length }; });
  }
  updateContext(patch: EditingContextPatch, options: { expectedSequence: number; expectedRevision: string; origin?: string }): Promise<EditingContextView> {
    const parsed = editingContextPatchSchema.parse(patch);
    return this.enqueue(async () => {
      const snapshot = await this.adapter.read();
      if (snapshot.revision !== options.expectedRevision || options.expectedSequence !== this.contextState.sequence) throw new GenmotionError('CONTEXT_CONFLICT', 'The document or live context changed. Read the context before navigating again.');
      this.contextState = updateEditingContext(snapshot.project, this.contextState, parsed, options.origin ?? 'sdk');
      const context = editingContextView(snapshot.project, snapshot.revision, this.contextState); this.emit({ type: 'context', context }); return context;
    });
  }
  query(input: EditingQuery): Promise<{ revision: string; result: unknown }> { const query = editingQuerySchema.parse(input); return this.enqueue(async () => { const snapshot = await this.adapter.read(); return { revision: snapshot.revision, result: queryEditingProject(snapshot.project, query) }; }); }
  historyState(): Promise<{ revision: string; undoDepth: number; redoDepth: number; stale: boolean }> { return this.enqueue(async () => { const snapshot = await this.adapter.read(); const stale = this.historyRevision !== undefined && snapshot.revision !== this.historyRevision; return { revision: snapshot.revision, undoDepth: stale ? 0 : this.undoEntries.length, redoDepth: stale ? 0 : this.redoEntries.length, stale }; }); }
  async reconcile(base: GenmotionProject, proposed: GenmotionProject, resolutions: ReconciliationResolution[] = [], options: SessionApplyOptions = {}): Promise<ReconciliationResult & { receipt?: EditingReceipt; revision: string }> {
    // Reconciliation is pure; the later write is protected by the exact revision read here.
    const current = await this.read();
    if (options.expectedRevision !== undefined && options.expectedRevision !== current.revision) throw new GenmotionError('REVISION_CONFLICT', 'Reconciliation uses a stale current revision.');
    const result = reconcileProjects(base, current.project, proposed, resolutions);
    if (!result.project) return { ...result, revision: current.revision };
    const receipt = await this.replace(result.project, { ...options, expectedRevision: current.revision, origin: options.origin ?? 'reconcile' });
    return { ...result, receipt, revision: receipt.revision };
  }
  inspect(target: EditTarget): Promise<ReturnType<typeof inspectEditTarget> & { revision: string }> { return this.enqueue(async () => { const snapshot = await this.adapter.read(); return { ...inspectEditTarget(snapshot.project, target), revision: snapshot.revision }; }); }
  can(edit: SemanticEdit): Promise<ReturnType<typeof canApplySemanticEdit> & { revision: string }> { return this.enqueue(async () => { const snapshot = await this.adapter.read(); return { ...canApplySemanticEdit(snapshot.project, edit), revision: snapshot.revision }; }); }
  private boundHistory(): void {
    while (this.undoEntries.length > this.limits.maxHistory) this.undoEntries.shift();
    while (this.redoEntries.length > this.limits.maxHistory) this.redoEntries.shift();
    while (Buffer.byteLength(JSON.stringify({ version: 1, revision: this.historyRevision ?? '', undo: this.undoEntries, redo: this.redoEntries })) > this.limits.maxHistoryBytes && (this.undoEntries.length || this.redoEntries.length)) {
      if (this.undoEntries.length) this.undoEntries.shift(); else this.redoEntries.shift();
    }
  }
  apply(input: SemanticEdit[], options: SessionApplyOptions = {}): Promise<EditingReceipt> {
    const edits = semanticEditSchema.array().min(1).max(500).parse(input);
    const signature = JSON.stringify(edits.map(edit => edit.op === 'property' ? { op: edit.op, target: edit.target, path: edit.path } : edit.op === 'text' ? { op: edit.op, target: edit.target } : edit.op === 'style' ? { op: edit.op, target: edit.target, properties: Object.keys(edit.values).sort() } : edit.op === 'timing' ? { op: edit.op, target: edit.target, start: edit.start !== undefined, duration: edit.duration !== undefined } : { nonce: randomUUID() }));
    return this.mutate(before => ({ ...applySemanticEdits(before, edits), signature }), options);
  }
  replace(input: GenmotionProject, options: SessionApplyOptions = {}): Promise<EditingReceipt> {
    const project = projectSchema.parse(structuredClone(input));
    return this.mutate(before => ({ project, affectedTargets: [], signature: options.coalesce ? documentGestureSignature(before, project) ?? randomUUID() : randomUUID() }), options);
  }
  private mutate(build: (before: GenmotionProject) => { project: GenmotionProject; affectedTargets: EditTarget[]; signature: string }, options: SessionApplyOptions): Promise<EditingReceipt> {
    return this.enqueue(async () => {
      const before = await this.adapter.read();
      const origin = options.origin ?? 'sdk';
      let applied: ReturnType<typeof build>;
      try {
        if (options.expectedRevision !== undefined && options.expectedRevision !== before.revision) throw new GenmotionError('REVISION_CONFLICT', 'The session edit uses a stale revision.');
        applied = build(before.project);
      } catch (error) { throw editingFailure(error, before.revision, origin, 'proposal'); }
      let result: EditingWriteResult;
      try { result = await this.adapter.write(applied.project, { expectedRevision: before.revision, origin, dryRun: options.dryRun ?? false, strict: options.strict ?? false, signal: this.abort.signal }); }
      catch (error) { throw editingFailure(error, before.revision, origin, 'persistence'); }
      const changed = !isDeepStrictEqual(before.project, result.snapshot.project);
      if (result.persisted && changed) {
        if (this.historyRevision && this.historyRevision !== before.revision) { this.undoEntries = []; this.redoEntries = []; }
        // Structural edits are never gesture-coalesced. Property identity and origin must match exactly.
        const signature = applied.signature;
        const previous = this.undoEntries.at(-1), now = Date.now();
        if (options.coalesce && previous?.group === options.coalesce && previous.signature === signature && previous.origin === origin && now - previous.at <= this.limits.coalesceWindowMs && !this.redoEntries.length) { previous.after = structuredClone(result.snapshot.project); previous.at = now; }
        else this.undoEntries.push({ before: structuredClone(before.project), after: structuredClone(result.snapshot.project), origin, signature, at: now, ...(options.coalesce ? { group: options.coalesce } : {}) });
        this.redoEntries = []; this.historyRevision = result.snapshot.revision; this.boundHistory();
      }
      const receipt = await this.receipt(before, result, origin, changed, applied.affectedTargets); this.emit({ type: 'commit', receipt }); return receipt;
    });
  }
  private async receipt(before: EditingSnapshot, result: EditingWriteResult, origin: string, changed: boolean, affectedTargets: EditTarget[] = []): Promise<EditingReceipt> {
    let readback: EditingReceipt['evidence']['readback'] = { status: 'not-applicable' };
    if (result.persisted) {
      try {
        const observed = await this.adapter.read();
        readback = { status: observed.revision === result.snapshot.revision && isDeepStrictEqual(observed.project, result.snapshot.project) ? 'matched' : 'mismatched', revision: observed.revision };
      } catch (error) { readback = { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) }; }
    }
    const verified = readback.status === 'matched';
    return { id: randomUUID(), state: verified ? 'verified' : result.persisted ? 'saved' : 'validated', changed, persisted: result.persisted, beforeRevision: before.revision, revision: result.snapshot.revision, origin, affectedTargets, validation: result.validation, findings: result.findings, undoDepth: this.undoEntries.length, redoDepth: this.redoEntries.length, inverse: documentDiff(result.snapshot.project, before.project), evidence: { readback, verificationScope: verified ? 'source-document' : 'none', frames: [] } };
  }
  private history(direction: 'undo' | 'redo', options: SessionApplyOptions): Promise<EditingReceipt> {
    return this.enqueue(async () => {
      const source = direction === 'undo' ? this.undoEntries : this.redoEntries, destination = direction === 'undo' ? this.redoEntries : this.undoEntries;
      const entry = source.at(-1); if (!entry) throw new GenmotionError('SESSION_HISTORY_EMPTY', `No ${direction} entry is available.`);
      const before = await this.adapter.read();
      if (before.revision !== this.historyRevision || (options.expectedRevision !== undefined && options.expectedRevision !== before.revision)) throw new GenmotionError('REVISION_CONFLICT', 'History belongs to a different document revision. Refresh or reopen an appropriate checkpoint.');
      const origin = options.origin ?? direction;
      let result: EditingWriteResult;
      try { result = await this.adapter.write(structuredClone(direction === 'undo' ? entry.before : entry.after), { expectedRevision: before.revision, origin, dryRun: options.dryRun ?? false, strict: options.strict ?? false, signal: this.abort.signal }); }
      catch (error) { throw editingFailure(error, before.revision, origin, 'persistence'); }
      if (result.persisted) { source.pop(); destination.push(entry); this.historyRevision = result.snapshot.revision; this.boundHistory(); }
      const receipt = await this.receipt(before, result, origin, true); this.emit({ type: direction, receipt }); return receipt;
    });
  }
  undo(options: SessionApplyOptions = {}): Promise<EditingReceipt> { return this.history('undo', options); }
  redo(options: SessionApplyOptions = {}): Promise<EditingReceipt> { return this.history('redo', options); }
  checkpoint(): Promise<EditingCheckpoint> { return this.enqueue(async () => { const current = await this.adapter.read(); const valid = !this.historyRevision || this.historyRevision === current.revision; return { version: 1, revision: current.revision, undo: valid ? structuredClone(this.undoEntries) : [], redo: valid ? structuredClone(this.redoEntries) : [] }; }); }
  restore(input: EditingCheckpoint): Promise<void> {
    const checkpoint = editingCheckpointSchema.parse(input);
    if ((checkpoint.undo.length || checkpoint.redo.length) && Buffer.byteLength(JSON.stringify(checkpoint)) > this.limits.maxHistoryBytes) throw new GenmotionError('SESSION_CHECKPOINT_TOO_LARGE', 'Checkpoint exceeds the session history byte limit.');
    return this.enqueue(async () => {
      const current = await this.adapter.read();
      if (current.revision !== checkpoint.revision) throw new GenmotionError('REVISION_CONFLICT', 'Checkpoint revision does not match the document.');
      let expected = current.project;
      for (const entry of [...checkpoint.undo].reverse()) {
        if (!isDeepStrictEqual(entry.after, expected)) throw new GenmotionError('SESSION_CHECKPOINT_INVALID', 'Undo history is not a continuous chain from this document.');
        expected = entry.before;
      }
      expected = current.project;
      for (const entry of [...checkpoint.redo].reverse()) {
        if (!isDeepStrictEqual(entry.before, expected)) throw new GenmotionError('SESSION_CHECKPOINT_INVALID', 'Redo history is not a continuous chain from this document.');
        expected = entry.after;
      }
      this.undoEntries = structuredClone(checkpoint.undo); this.redoEntries = structuredClone(checkpoint.redo); this.historyRevision = current.revision; this.boundHistory();
    });
  }
  async dispose(): Promise<void> { if (this.closed) return; this.closed = true; this.abort.abort(new GenmotionError('SESSION_DISPOSED', 'Editing session was disposed.')); await this.pending; this.emit({ type: 'disposed' }); this.listeners.clear(); this.undoEntries = []; this.redoEntries = []; if (this.limits.ownsAdapter) await this.adapter.dispose?.(); }
}
