import { describe, expect, it } from 'vitest';
import { auditCatalog } from '../src/catalog/audit.js';
import { describeCatalogItem, searchCatalog } from '../src/commands/catalog.js';

describe('taste catalog', () => {
  it('has valid cross-references, licenses, and constraints', () => {
    expect(auditCatalog()).toEqual(expect.objectContaining({ ok: true, findings: [] }));
  });

  it('searches by creative intent', () => {
    const results = searchCatalog('confident product reveal', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.type === 'motion' || result.type === 'blueprint')).toBe(true);
  });
  it('describes cost, ranges, native payloads and refusal conditions before application', () => {
    expect(describeCatalogItem('motion', 'camera-push')).toMatchObject({ parameterRanges: { duration: [.7, 2], intensity: [0, 4] }, animation: { properties: ['scale'], seekSafe: true }, example: { motion: [{ recipe: 'camera-push' }] }, cost: 2, directAuthoringAvailable: true });
    expect(describeCatalogItem('reference', 'documentary-evidence')).toMatchObject({ provenance: expect.any(String), license: 'CC0-1.0', unsupported: [expect.stringContaining('not applied')] });
    expect(() => describeCatalogItem('motion', 'missing')).toThrow('Unknown');
  });
});
