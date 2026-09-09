import { describe, expect, it } from 'vitest';
import { analyzeSourceFrames, applySuggestedColorPatch, clearSuggestedColorPatch } from '../src/index.js';

describe('representative source-frame color analysis', () => {
  it('returns distributions, clipping evidence and reversible conservative patches', () => {
    const pixels = new Uint8Array([0, 0, 0, 255, 255, 250, 245, 255, 80, 120, 160, 255, 100, 100, 100, 255]);
    const report = analyzeSourceFrames([{ time: 0, width: 2, height: 2, pixels, colorMetadata: { transfer: 'bt709', primaries: 'bt709' } }]);
    expect(report).toMatchObject({ version: 1, supported: true, aggregate: { shadowClipRatio: .25 } });
    expect(report.frames[0]).toEqual(expect.objectContaining({ p05Luminance: expect.any(Number), p95Luminance: expect.any(Number), meanChroma: expect.any(Number) }));
    expect(Math.abs(report.suggestedPatch.exposureStops)).toBeLessThanOrEqual(.5);
    expect(applySuggestedColorPatch(report).mode).toBe('dry-run');
    const applied = applySuggestedColorPatch(report, false).edit!;
    expect(clearSuggestedColorPatch([applied], report.sourceSha256)).toEqual([]);
  });

  it('refuses automatic application for unsupported HDR/log metadata', () => {
    const report = analyzeSourceFrames([{ time: 0, width: 1, height: 1, pixels: new Uint8Array([128, 128, 128, 255]), colorMetadata: { transfer: 'smpte2084' } }]);
    expect(report.supported).toBe(false);
    expect(report.diagnostics[0]).toMatch(/unsupported log or HDR/i);
    expect(() => applySuggestedColorPatch(report, false)).toThrow(/unsupported log or HDR/i);
  });
});
 
