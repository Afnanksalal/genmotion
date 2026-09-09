import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importMediaRecord, inspectMediaLedger, mediaLedgerSchema, mediaMetadataSchema, relocateMediaRecord } from '../src/ir/media-ledger.js';
import { loadProject } from '../src/ir/loader.js';

describe('provenance schema foundation (not an integrated media library)', () => {
  it('requires explicit provenance and rights evidence', () => {
    expect(mediaMetadataSchema.parse({ kind: 'image', title: 'Local' }).license.status).toBe('unknown');
    for (const metadata of [
      { origin: 'generated' }, { origin: 'captured' }, { origin: 'derived' },
      { license: { status: 'documented' } },
      { timeMap: [{ sourceStart: 0, sourceEnd: 1, outputStart: 0, outputEnd: 2 }, { sourceStart: 1, sourceEnd: 2, outputStart: 1, outputEnd: 3 }] },
    ]) expect(mediaMetadataSchema.safeParse({ kind: 'image', title: 'Local', ...metadata }).success).toBe(false);
  });
  it('checks parent hashes, unique IDs and cycles while allowing shared ancestry', () => {
    const hash = 'a'.repeat(64);
    const record = (id: string, parents: string[] = []) => ({ id, path: id + '.png', sha256: hash, bytes: 1, importedAt: '2026-09-06T00:00:00.000Z', metadata: { kind: 'image', title: id, parents: parents.map(recordId => ({ recordId, sha256: hash })) } });
    expect(mediaLedgerSchema.safeParse({ version: 1, records: [record('a'), record('b', ['a']), record('c', ['a', 'b'])] }).success).toBe(true);
    for (const records of [[record('a'), record('a')], [record('a', ['missing'])], [record('a', ['a'])], [record('a', ['b']), record('b', ['a'])]]) expect(mediaLedgerSchema.safeParse({ version: 1, records }).success).toBe(false);
    const child = record('b', ['a']); child.metadata.parents[0]!.sha256 = 'b'.repeat(64);
    expect(mediaLedgerSchema.safeParse({ version: 1, records: [record('a'), child] }).success).toBe(false);
  });
  it('imports, deduplicates, relocates and invalidates frozen media', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-ledger-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true }); const source = path.join(directory, 'incoming.bin'); await writeFile(source, 'frozen bytes'); const loaded = await loadProject(directory);
      const imported = await importMediaRecord(loaded, { id: 'source', sourceFile: source, path: 'assets/source.bin', metadata: { kind: 'other', title: 'Source' }, cacheDirectory: path.join(directory, '.cache') }); loaded.sourceProject = imported.project; loaded.project = imported.project;
      expect((await importMediaRecord(loaded, { id: 'duplicate', sourceFile: source, path: 'assets/duplicate.bin', metadata: { kind: 'other', title: 'Duplicate' } })).deduplicatedFrom).toBe('source');
      loaded.sourceProject = await relocateMediaRecord(loaded, 'source', 'assets/relocated.bin'); loaded.project = loaded.sourceProject;
      expect(loaded.sourceProject.mediaLedger.records[0]?.path).toBe('assets/relocated.bin'); expect((await inspectMediaLedger(loaded)).ok).toBe(true);
      await writeFile(path.join(directory, 'assets/relocated.bin'), 'changed'); expect(await inspectMediaLedger(loaded)).toMatchObject({ ok: false, invalidated: ['source'] });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
