import { describe, expect, it } from 'vitest';
import { auditCatalog } from '../src/catalog/audit.js';
import { searchCatalog } from '../src/commands/catalog.js';

describe('taste catalog', () => {
  it('has valid cross-references, licenses, and constraints', () => {
    expect(auditCatalog()).toEqual(expect.objectContaining({ ok: true, findings: [] }));
  });

  it('searches by creative intent', () => {
    const results = searchCatalog('confident product reveal', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.type === 'motion' || result.type === 'blueprint')).toBe(true);
  });
});
