import { cp, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import type * as FileSystem from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitProject, readProjectSnapshot } from '../src/ir/store.js';
import { runProcess } from '../src/engine/process.js';

const directories: string[] = [];
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-store-'));
  directories.push(directory);
  await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
  return directory;
}

describe('shared project transactions', () => {
  it('retries temporary replacement locks and rechecks external revisions between attempts', async () => {
    const directory = await fixture();
    const before = await readProjectSnapshot(directory);
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('Busy reader'), { code: 'EPERM' }));
    await commitProject(directory, { expectedRevision: before.revision, update: (project) => ({ ...project, title: 'Retried save' }) });
    const accepted = await readProjectSnapshot(directory);
    expect(accepted.sourceProject.title).toBe('Retried save');
    const external = JSON.stringify({ ...accepted.sourceProject, title: 'External writer during retry' });
    vi.mocked(rename).mockImplementationOnce(() => {
      writeFileSync(accepted.projectFile, external);
      return Promise.reject(Object.assign(new Error('Busy reader'), { code: 'EBUSY' }));
    });
    await expect(commitProject(directory, { expectedRevision: accepted.revision, update: (project) => ({ ...project, title: 'Stale retry' }) })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await readFile(accepted.projectFile, 'utf8')).toBe(external);
    expect((await readdir(directory)).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });

  it('validates dry runs without changing source, revision or history', async () => {
    const directory = await fixture();
    const before = await readProjectSnapshot(directory);
    const history = path.join(directory, '.genmotion', 'history');
    const existing = await readdir(history).catch(() => []);
    const receipt = await commitProject(directory, { expectedRevision: before.revision, dryRun: true, update: (project) => ({ ...project, title: 'Proposed title' }) });
    expect(receipt).toMatchObject({ state: 'validated', changed: true, persisted: false, beforeRevision: before.revision });
    expect((await readProjectSnapshot(directory)).revision).toBe(before.revision);
    expect(await readdir(history).catch(() => [])).toEqual(existing);
    expect(await readdir(path.join(directory, '.genmotion', 'locks'))).toEqual([]);
  });

  it('allows exactly one writer to commit the same expected revision', async () => {
    const directory = await fixture();
    const before = await readProjectSnapshot(directory);
    const results = await Promise.allSettled(['one', 'two'].map((title) => commitProject(directory, { expectedRevision: before.revision, update: (project) => ({ ...project, title }) })));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'REVISION_CONFLICT' } });
    const after = await readProjectSnapshot(directory);
    expect(['one', 'two']).toContain(after.sourceProject.title);
    expect(await readFile(path.join(directory, '.genmotion', 'history', 'source', before.revision + '.json'), 'utf8')).toBe(before.source);
    expect((await stat(path.join(directory, '.genmotion', 'history', before.documentRevision + '.json'))).isFile()).toBe(true);
    expect(await readdir(path.join(directory, '.genmotion', 'locks'))).toEqual([]);
  });

  it('rejects semantic errors before modifying the accepted source', async () => {
    const directory = await fixture();
    const before = await readProjectSnapshot(directory);
    await expect(commitProject(directory, { expectedRevision: before.revision, update: (project) => {
      const layer = project.scenes[0]?.layers[0];
      if (!layer) throw new Error('Missing fixture layer');
      layer.parentId = 'missing-parent';
      return project;
    } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await readFile(before.projectFile, 'utf8')).toBe(before.source);
    expect((await readdir(directory)).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });

  it('serializes writers in separate Node processes', async () => {
    const directory = await fixture();
    const before = await readProjectSnapshot(directory);
    const script = "import {commitProject} from './dist/ir/store.js'; try { const r=await commitProject(process.argv[1],{expectedRevision:process.argv[2],update:p=>({...p,title:process.argv[3]})}); process.stdout.write(r.revision); } catch(e) { process.stderr.write(e.code); process.exitCode=2; }";
    const results = await Promise.allSettled(['child-one', 'child-two'].map((title) => runProcess(process.execPath, ['--input-type=module', '-e', script, directory, before.revision, title], process.cwd())));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status !== 'rejected') throw new Error('Expected a competing writer to fail.');
    const error: unknown = failed.reason;
    expect(error instanceof Error ? error.message : String(error)).toContain('REVISION_CONFLICT');
    expect(['child-one', 'child-two']).toContain((await readProjectSnapshot(directory)).sourceProject.title);
  });

  it('detects an external write during validation and preserves that newer source', async () => {
    const directory = await fixture();
    const before = await readProjectSnapshot(directory);
    const external = JSON.stringify({ ...before.sourceProject, title: 'External change' });
    await expect(commitProject(directory, { expectedRevision: before.revision, update: (project) => {
      writeFileSync(before.projectFile, external);
      return { ...project, title: 'Stale proposal' };
    } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await readFile(before.projectFile, 'utf8')).toBe(external);
    expect((await readdir(directory)).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });

  it('does not rewrite a no-op and respects cancellation', async () => {
    const directory = await fixture();
    const before = await readProjectSnapshot(directory);
    const receipt = await commitProject(directory, { expectedRevision: before.documentRevision, revisionKind: 'document', update: (project) => project });
    expect(receipt).toMatchObject({ changed: false, revision: before.revision });
    const controller = new AbortController(); controller.abort();
    await expect(commitProject(directory, { expectedRevision: before.revision, signal: controller.signal, update: (project) => project })).rejects.toMatchObject({ code: 'PROCESS_ABORTED' });
    expect(await readFile(before.projectFile, 'utf8')).toBe(before.source);
  });
});
