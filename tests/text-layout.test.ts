import { describe, expect, it } from 'vitest';
import { textLayerSchema } from '../src/ir/schema.js';
import { measureTextLayer, textGraphemes } from '../src/engine/text-layout.js';
import { resolveLayerGraph } from '../src/engine/constraints.js';

const text = (overrides: Record<string, unknown> = {}) => textLayerSchema.parse({ id: 'title', type: 'text', text: 'A headline with every word preserved', x: 0, y: 0, width: 160, height: 100, fontFamily: 'Arial', fontSize: 40, color: '#fff', ...overrides });
describe('shared native text layout', () => {
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
});
