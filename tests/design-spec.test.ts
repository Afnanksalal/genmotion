import { describe, expect, it } from 'vitest';
import { auditDesignSpec, designSpecSchema } from '../src/ir/design-spec.js';
import { loadProject } from '../src/ir/loader.js';

const identity = 'a'.repeat(64);
describe('versioned design specifications', () => {
  it('audits exact bindings, provenance, medium guidance and variant drift', async () => {
    const loaded = await loadProject('tests/fixtures/basic');
    loaded.project.designSpec = designSpecSchema.parse({ version: 1, id: 'brand-system', revision: '2026.1', sourceHash: identity, provenance: { source: 'approved local design export', importedAt: '2026-09-09T00:00:00.000Z', rights: 'owned' }, palette: { accent: loaded.project.brand.accent }, exactBindings: { 'brand.accent': loaded.project.brand.accent }, recommendations: { social: ['Keep title-safe margins.'] } });
    loaded.project.productionBrief = { version: 1, sourceRequirements: [], destination: { value: 'social', origin: 'user' } };
    const accepted = await auditDesignSpec(loaded);
    expect(accepted).toMatchObject({ present: true, ok: true, identity: { id: 'brand-system', revision: '2026.1' }, recommendation: ['Keep title-safe margins.'] });
    loaded.project.brand.accent = '#010203';
    const drift = await auditDesignSpec(loaded);
    expect(drift.ok).toBe(false);
    expect(drift.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DESIGN_BINDING_DRIFT', target: 'brand.accent' })]));
  });

  it('keeps missing design contracts and immutable dependencies visible', async () => {
    const loaded = await loadProject('tests/fixtures/basic');
    expect(await auditDesignSpec(loaded)).toMatchObject({ present: false, ok: false });
    loaded.project.designSpec = designSpecSchema.parse({ version: 1, id: 'locked-assets', revision: '1', sourceHash: identity, provenance: { source: 'local', importedAt: '2026-09-09T00:00:00.000Z', rights: 'unknown' }, immutableAssets: [{ role: 'logo', path: 'missing.svg', sha256: identity }] });
    expect((await auditDesignSpec(loaded)).findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DESIGN_ASSET_MISSING' })]));
  });
});
