import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { createCheckReport } from '../src/ir/check-report.js';

describe('native check report', () => {
  it('spans every review domain with explicit coverage and delivery evidence', async () => {
    const report = await createCheckReport(await loadProject('examples/native-milestones'));
    expect(report.version).toBe(1);
    expect(report.sections.map((section) => section.id)).toEqual(['schema', 'assets', 'layout', 'media', 'contrast', 'motion', 'output']);
    expect(report.repairs.every((repair) => repair.automatic === false && repair.suggestion.length > 0)).toBe(true);
    expect(report.sampling).toMatchObject({ coverage: 'complete', omittedTimes: 0 });
    expect(report.incompleteChecks).toEqual([]);
    expect(report.render.delivery.output.identity).toMatch(/^[a-f0-9]{64}$/);
  });
  it('reports truncated sampling as incomplete instead of silently passing', async () => {
    const report = await createCheckReport(await loadProject('examples/native-milestones'), { maxSamples: 2 });
    expect(report).toMatchObject({ ok: false, severity: 'incomplete', incompleteChecks: ['motion'], sampling: { coverage: 'truncated' } });
    expect(report.sections.find((section) => section.id === 'motion')).toMatchObject({ status: 'incomplete', complete: false });
  });
  it('returns code-aware, non-mutating repair guidance for current findings', async () => {
    const loaded = await loadProject('examples/caption-cinema');
    const caption = loaded.project.scenes.flatMap(scene => scene.layers).find(layer => layer.type === 'caption');
    if (!caption || caption.type !== 'caption') throw new Error('Caption fixture missing');
    caption.x = 0; caption.safeArea = true;
    const report = await createCheckReport(loaded);
    expect(report.repairs).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CAPTION_SAFE_AREA', automatic: false, suggestion: expect.stringContaining('safe-area') })]));
  });
});
 
