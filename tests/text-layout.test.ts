import { describe, expect, it } from 'vitest';
import { projectSchema, textLayerSchema } from '../src/ir/schema.js';
import { measureTextLayer, textGraphemes } from '../src/engine/text-layout.js';
import { resolveLayerGraph } from '../src/engine/constraints.js';
import { renderFrame } from '../src/engine/draw.js';

const text = (overrides: Record<string, unknown> = {}) => textLayerSchema.parse({ id: 'title', type: 'text', text: 'A headline with every word preserved', x: 0, y: 0, width: 160, height: 100, fontFamily: 'Arial', fontSize: 40, color: '#fff', ...overrides });
describe('shared native text layout', () => {
  it('renders a padded text block behind shaped text', async () => {
    const project = projectSchema.parse({
      schemaVersion: 1, id: 'text-block', title: 'Text block', width: 128, height: 64, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' },
      scenes: [{ id: 'scene', purpose: 'Text', duration: 1, background: '#000', layers: [{
        id: 'title', type: 'text', text: 'A', x: 20, y: 10, width: 80, height: 40,
        fontFamily: 'Arial', fontSize: 24, color: '#fff', blockBackground: '#ff0000', blockPadding: 8, blockRadius: 8,
      }] }],
    });
    const pixels = await renderFrame(project, process.cwd(), 0);
    expect([...pixels.subarray((30 * 128 + 25) * 4, (30 * 128 + 25) * 4 + 4)]).toEqual([255, 0, 0, 255]);
  });
  it('keeps a text outline as a native layer property', () => {
    const layer = text({ outlineColor: '#000000', outlineWidth: 2 });
    expect(layer).toMatchObject({ outlineColor: '#000000', outlineWidth: 2 });
    expect(text().outlineWidth).toBe(0);
  });
  it('renders independently padded backgrounds for wrapped lines', async () => {
    const project = projectSchema.parse({
      schemaVersion: 1, id: 'line-blocks', title: 'Line blocks', width: 128, height: 96, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' },
      scenes: [{ id: 'scene', purpose: 'Text', duration: 1, background: '#000', layers: [{
        id: 'title', type: 'text', text: 'ONE\nTWO', x: 20, y: 10, width: 80, height: 70, fontFamily: 'Arial', fontSize: 20,
        color: '#fff', lineBackground: '#00ff00', linePadding: 3, lineRadius: 3,
      }] }],
    });
    const pixels = await renderFrame(project, process.cwd(), 0);
    expect([...pixels.subarray((11 * 128 + 21) * 4, (11 * 128 + 21) * 4 + 4)]).toEqual([0, 255, 0, 255]);
    expect([...pixels.subarray((65 * 128 + 21) * 4, (65 * 128 + 21) * 4 + 4)]).toEqual([0, 0, 0, 255]);
  });
  it('fits complete text to boxes and line limits without discarding words', () => {
    const layout = measureTextLayer(text({ maxLines: 2 }));
    expect(layout.fits).toBe(true); expect(layout.lines.length).toBeLessThanOrEqual(2);
    expect(layout.lines.join(' ')).toBe('A headline with every word preserved');
    expect(layout.fontSize).toBeLessThan(40);
    const failed = measureTextLayer(text({ width: 20, height: 10, minFontSize: 20, maxLines: 1 }));
    expect(failed.fits).toBe(false); expect(failed.overflowY).toBe(true); expect(failed.overflowLines).toBe(true);
    expect(failed.fontSize).toBe(20);
    expect(measureTextLayer(text({ text: 'UnbreakablyLongWord', breakWords: false, fit: 'none', width: 10 })).overflowX).toBe(true);
  });
  it('breaks long words at grapheme boundaries and materializes automatic box dimensions', () => {
    const value = 'e\u0301👨‍👩‍👧‍👦'.repeat(5);
    const layout = measureTextLayer(text({ text: value, width: 40, height: 500, fontSize: 18, fit: 'none' }));
    expect(layout.lines.join('')).toBe(value);
    expect(layout.lines.every((line) => !line.startsWith('\u0301') && !line.startsWith('\u200d'))).toBe(true);
    expect(textGraphemes('e\u0301👨‍👩‍👧‍👦')).toHaveLength(2);
    const layer = text({ text: 'Two\nlines', autoSize: 'both' });
    const size = measureTextLayer(layer), resolved = resolveLayerGraph([layer], 0)[0]!;
    expect(size.lines).toEqual(['Two', 'lines']); expect(size.fontSize).toBe(40);
    expect(resolved).toMatchObject({ width: size.width, height: size.height });
    expect(measureTextLayer(text({ autoSize: 'height', height: 1 })).overflowY).toBe(false);
    expect(() => measureTextLayer(text({ minFontSize: 30, maxFontSize: 20 }))).toThrow('Minimum');
    expect(() => measureTextLayer(text({ text: 'x'.repeat(200001) }))).toThrow('200000');
  });
  it('enforces authored font bounds and exposes stable baseline, cap-height, and ink alignment', () => {
    const bounded = measureTextLayer(text({ width: 90, height: 50, minFontSize: 18, maxFontSize: 24 }));
    expect(bounded.fontSize).toBeGreaterThanOrEqual(18);
    expect(bounded.fontSize).toBeLessThanOrEqual(24);

    const baseline = measureTextLayer(text({ text: 'Hgj', fit: 'none', fontSize: 24, baselineOffset: 31 }));
    expect(baseline.textBaseline).toBe('alphabetic');
    expect(baseline.yOffsets[0]).toBe(31);

    const cap = measureTextLayer(text({ text: 'H', fit: 'none', fontSize: 24, verticalMetrics: 'cap-height' }));
    const ink = measureTextLayer(text({ text: 'H', fit: 'none', fontSize: 24, verticalMetrics: 'ink' }));
    expect(cap.textBaseline).toBe('alphabetic');
    expect(cap.height).toBeGreaterThan(0);
    expect(ink.inkBounds.top).toBeCloseTo(0, 5);
    expect(ink.inkBounds.bottom).toBeCloseTo(ink.height, 5);

    const advance = measureTextLayer(text({ text: 'j', fit: 'none', fontSize: 40, width: 120, align: 'center', horizontalMetrics: 'advance' }));
    const optical = measureTextLayer(text({ text: 'j', fit: 'none', fontSize: 40, width: 120, align: 'center', horizontalMetrics: 'ink' }));
    expect(optical.xOffsets[0]).not.toBe(advance.xOffsets[0]);
    expect((optical.inkBounds.left + optical.inkBounds.right) / 2).toBeCloseTo(60, 5);
  });
});
