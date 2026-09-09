import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteCatalogFeedback, exportCatalogFeedback, readCatalogFeedback, recordCatalogFeedback } from '../src/catalog/local-feedback.js';

describe('local catalog feedback', () => {
  it('stores, inspects, explicitly exports and selectively deletes records', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-feedback-')), file = path.join(directory, 'feedback.json');
    try { const miss = await recordCatalogFeedback(file, { kind: 'search-miss', query: 'kinetic atlas', note: 'No suitable result' }), quality = await recordCatalogFeedback(file, { kind: 'content-quality', query: 'lower third', itemId: 'lower-third', rating: 2, note: 'Weak contrast' }); expect((await readCatalogFeedback(file)).records).toHaveLength(2); expect((await exportCatalogFeedback(file, [quality.id])).records.map(item => item.id)).toEqual([quality.id]); expect(await deleteCatalogFeedback(file, [miss.id])).toEqual({ deleted: 1, remaining: 1 }); expect((await readCatalogFeedback(file)).records[0]?.id).toBe(quality.id); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
});
