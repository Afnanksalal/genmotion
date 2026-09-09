import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { acquireRestrictedAsset, recordRestrictedAssetAcceptance } from '../src/ir/restricted-assets.js';

describe('hash-bound restricted asset acceptance', () => {
  it('records explicit terms and refuses changed upstream bytes without substitution', async () => { const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-restricted-')); try { const bytes = Buffer.from('licensed font'), record = recordRestrictedAssetAcceptance({ id: 'brand-font-v1', assetRole: 'font', expectedSha256: createHash('sha256').update(bytes).digest('hex'), termsUrl: 'https://example.test/font-terms', termsVersion: '2026-09', actor: 'user@example.test', acceptedAt: '2026-09-09T00:00:00.000Z', sourceUrl: 'https://example.test/font.woff2' }), output = path.join(directory, 'font.woff2'); const accepted = await acquireRestrictedAsset(record, output, (_url, file) => writeFile(file, bytes)); expect(accepted).toMatchObject({ acceptanceId: 'brand-font-v1', termsVersion: '2026-09' }); expect(await readFile(output)).toEqual(bytes); await expect(acquireRestrictedAsset(record, path.join(directory, 'changed.woff2'), (_url, file) => writeFile(file, 'different'))).rejects.toThrow(/substitution refused/); } finally { await rm(directory, { recursive: true, force: true }); } });
});
