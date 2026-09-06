import { assertTrackLocks } from './track-locks.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import YAML from 'yaml';
import { replaceFile } from './atomic.js';
import { GenmotionError } from '../errors.js';
import { throwIfAborted } from '../engine/process.js';
import { findProjectFile, loadProjectDocument, resolveProjectAsset, verifyBundleIfPresent, type LoadedProject } from './loader.js';
import { projectSchema, type GenmotionProject } from './schema.js';
import { hasErrors, validateProject, type Finding } from './validate.js';

export function fileRevision(source: string): string { return createHash('sha256').update(source).digest('hex'); }
export function projectRevision(project: GenmotionProject): string { return fileRevision(JSON.stringify(project)).slice(0, 16); }

export interface ProjectSnapshot extends LoadedProject { revision: string; documentRevision: string; source: string }
export interface ProjectSourceSnapshot { sourceProject: GenmotionProject; projectFile: string; projectDir: string; revision: string; documentRevision: string; source: string }
/** Source inspection remains available when evaluation is blocked by an override conflict. */
export async function readProjectSourceSnapshot(input: string): Promise<ProjectSourceSnapshot> {
  const projectFile = await realpath(await findProjectFile(input));
  await verifyBundleIfPresent(projectFile);
  const source = await readFile(projectFile, 'utf8');
  const raw: unknown = /\.ya?ml$/i.test(projectFile) ? YAML.parse(source) : JSON.parse(source);
  const sourceProject = projectSchema.parse(raw);
  return { sourceProject, projectFile, projectDir: path.dirname(projectFile), source, revision: fileRevision(source), documentRevision: projectRevision(sourceProject) };
}
export async function readProjectSnapshot(input: string): Promise<ProjectSnapshot> {
  const snapshot = await readProjectSourceSnapshot(input);
  const loaded = await loadProjectDocument(snapshot.sourceProject, snapshot.projectFile);
  return { ...loaded, source: snapshot.source, revision: snapshot.revision, documentRevision: snapshot.documentRevision };
}

export interface ProjectCommitOptions {
  expectedRevision: string;
  revisionKind?: 'file' | 'document';
  update: (project: GenmotionProject) => unknown;
  strict?: boolean;
  dryRun?: boolean;
  signal?: AbortSignal;
  lockTimeoutMs?: number;
  origin?: string;
}
export interface ProjectCommitReceipt {
  version: 1;
  id: string;
  state: 'saved' | 'validated';
  changed: boolean;
  persisted: boolean;
  origin: string;
  beforeRevision: string;
  revision: string;
  beforeDocumentRevision: string;
  documentRevision: string;
  findings: Finding[];
  loaded: LoadedProject;
}

async function durableWrite(file: string, source: string): Promise<void> {
  const handle = await open(file, 'wx');
  try { await handle.writeFile(source, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
}

/** Advisory cross-process lock shared by Genmotion writers. A dead owner's lock
 * is reported, never silently removed while another writer could own it. */
async function acquireLock(projectFile: string, options: ProjectCommitOptions): Promise<() => Promise<void>> {
  const timeout = options.lockTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new GenmotionError('INVALID_LOCK_TIMEOUT', 'Lock timeout must be between 1 and 2147483647 milliseconds.');
  const directory = resolveProjectAsset(path.dirname(projectFile), '.genmotion/locks');
  await mkdir(directory, { recursive: true });
  const lock = path.join(directory, fileRevision(projectFile).slice(0, 32) + '.lock');
  const started = performance.now();
  for (;;) {
    throwIfAborted(options.signal);
    try {
      const handle = await open(lock, 'wx');
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, id: randomUUID(), projectFile, createdAt: new Date().toISOString() })); }
      catch (error) { await handle.close(); await rm(lock, { force: true }); throw error; }
      return async () => { try { await handle.close(); } finally { await rm(lock, { force: true }); } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (performance.now() - started >= timeout) throw new GenmotionError('PROJECT_LOCKED', 'Another writer holds the project lock. Inspect the owner before retrying.', { lock });
      await delay(Math.min(25, timeout), undefined, options.signal ? { signal: options.signal } : {});
    }
  }
}

/** Validate before any project/history write, recheck revision immediately before
 * commit, and release ownership only after the atomic rename finishes. */
export async function commitProject(input: string, options: ProjectCommitOptions): Promise<ProjectCommitReceipt> {
  const projectFile = await realpath(await findProjectFile(input));
  if (await verifyBundleIfPresent(projectFile)) throw new GenmotionError('BUNDLE_READ_ONLY', 'Verified bundles are immutable. Make a working copy without the manifest before editing.');
  const release = await acquireLock(projectFile, options);
  let temporary: string | undefined;
  try {
    const before = await readProjectSourceSnapshot(projectFile);
    const actual = options.revisionKind === 'document' ? before.documentRevision : before.revision;
    if (actual !== options.expectedRevision) throw new GenmotionError('REVISION_CONFLICT', 'The project changed after it was read. Read the current revision and reconcile the edit.', { expected: options.expectedRevision, actual });
    throwIfAborted(options.signal);
    const proposed = projectSchema.parse(options.update(structuredClone(before.sourceProject)));
    assertTrackLocks(before.sourceProject, proposed);
    const loaded = await loadProjectDocument(proposed, projectFile);
    const findings = await validateProject(loaded);
    if (hasErrors(findings) || (options.strict && findings.length > 0)) throw new GenmotionError('VALIDATION_FAILED', 'Project transaction failed validation; the accepted project was preserved.', findings);
    const changed = JSON.stringify(proposed) !== JSON.stringify(before.sourceProject);
    const serialized = /\.ya?ml$/i.test(projectFile) ? YAML.stringify(proposed) : JSON.stringify(proposed, null, 2) + '\n';
    const receipt: ProjectCommitReceipt = {
      version: 1, id: randomUUID(), state: options.dryRun ? 'validated' : 'saved', changed,
      persisted: !options.dryRun, origin: options.origin ?? 'sdk', beforeRevision: before.revision,
      revision: changed ? fileRevision(serialized) : before.revision,
      beforeDocumentRevision: before.documentRevision, documentRevision: projectRevision(proposed), findings, loaded,
    };
    throwIfAborted(options.signal);
    if (options.dryRun || !changed) return receipt;
    const history = resolveProjectAsset(before.projectDir, '.genmotion/history');
    resolveProjectAsset(before.projectDir, '.genmotion/history/source');
    await mkdir(path.join(history, 'source'), { recursive: true });
    // Raw source history preserves formatting and YAML comments for recovery.
    const historyFile = path.join(history, 'source', before.revision + path.extname(projectFile));
    try { await durableWrite(historyFile, before.source); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    try { await durableWrite(path.join(history, before.documentRevision + '.json'), JSON.stringify(before.sourceProject, null, 2) + '\n'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    temporary = path.join(before.projectDir, '.' + path.basename(projectFile) + '.' + receipt.id + '.tmp');
    await durableWrite(temporary, serialized);
    await replaceFile(temporary, projectFile, {
      ...(options.signal ? { signal: options.signal } : {}),
      beforeRename: async () => {
        if (fileRevision(await readFile(projectFile, 'utf8')) !== before.revision) throw new GenmotionError('REVISION_CONFLICT', 'The project was modified outside the transaction while validation ran. The edit was not committed.');
      },
    });
    temporary = undefined;
    return receipt;
  } finally {
    try { if (temporary) await rm(temporary, { force: true }); }
    finally { await release(); }
  }
}
