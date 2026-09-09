import { describe, expect, it } from 'vitest';
import { extractBrandImportManifest } from '../src/ir/brand-import.js';

describe('brand candidate import', () => {
  it('extracts ranked tokens, fonts and motion without selecting a substitute', () => {
    const manifest = extractBrandImportManifest({ captureId: 'capture-1', sourceUrl: 'https://product.test/', css: ':root{--accent:#12abef;color:#12abef;font-family:"Brand Sans", sans-serif}.hero{animation:rise 1s ease;color:#fff}', assets: [{ kind: 'logo', sourceUrl: 'https://product.test/logo.svg', localPath: 'evidence/logo.svg', rights: 'owned' }] });
    expect(manifest).toMatchObject({ ready: true, selection: null, candidates: { customProperties: { accent: '#12abef' } } });
    expect(manifest.candidates.colors[0]).toMatchObject({ value: '#12abef', occurrences: 2 });
    expect(manifest.candidates.fonts.map(item => item.value)).toContain('Brand Sans');
    expect(manifest.candidates.motion[0]?.value).toContain('rise');
  });

  it('reports ambiguous identity, unknown rights and unfrozen sources', () => {
    const manifest = extractBrandImportManifest({ captureId: 'capture-2', sourceUrl: 'https://product.test/', assets: [{ kind: 'logo', sourceUrl: 'https://product.test/a.svg' }, { kind: 'logo', sourceUrl: 'https://product.test/b.svg', rights: 'reference-only' }] });
    expect(manifest.ready).toBe(false);
    expect(manifest.findings.map(item => item.code)).toEqual(['BRAND_LOGO_AMBIGUOUS', 'BRAND_ASSET_RIGHTS_UNKNOWN', 'BRAND_ASSET_NOT_FROZEN']);
    expect(manifest.substitutionPolicy).toContain('automatically');
  });
});
