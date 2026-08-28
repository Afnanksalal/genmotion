import { describe, expect, it } from 'vitest';
import { GENMOTION_BRAND_ASSETS, GENMOTION_BRAND_COLOR, GENMOTION_SYMBOL_SVG, readGenmotionBrandAsset } from '../src/brand.js';

describe('Genmotion brand assets', () => {
  it('ships one deterministic symbol across vector and raster surfaces', () => {
    expect(GENMOTION_BRAND_COLOR).toBe('#2563EB');
    expect(GENMOTION_SYMBOL_SVG).toContain('viewBox="0 0 64 64"');
    expect(GENMOTION_SYMBOL_SVG).not.toMatch(/gradient|filter|shadow/i);
    expect(GENMOTION_BRAND_ASSETS).toContain('genmotion-social.png');
    expect(readGenmotionBrandAsset('genmotion-symbol.svg').length).toBeGreaterThan(500);
    expect(readGenmotionBrandAsset('genmotion-symbol-512.png').subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(readGenmotionBrandAsset('genmotion-social.png').length).toBeGreaterThan(20_000);
  });
});
