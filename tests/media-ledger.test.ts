import { describe, expect, it } from 'vitest';
import { mediaLedgerSchema, mediaMetadataSchema } from '../src/ir/media-ledger.js';

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
});
