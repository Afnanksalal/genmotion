import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { projectSchema } from '../src/ir/schema.js';
import { expandParameterMatrix, exportParameterVariants, importParameterVariants } from '../src/ir/variants.js';
import { resolveParameters } from '../src/ir/parameters.js';

async function project() {
  const raw = JSON.parse(await readFile('tests/fixtures/basic/genmotion.json', 'utf8')) as Record<string, unknown>;
  return projectSchema.parse({ ...raw, parameters: [{ id: 'title', label: 'Title', type: 'string', default: '' }, { id: 'count', label: 'Count', type: 'number', default: 1, min: 0 }] });
}

describe('parameter configurations', () => {
  it('expands deterministic Cartesian products and rejects explosive or invalid matrices', async () => {
    const source = await project();
    const matrix = { title: ['One', 'Two'], count: [1, 2] };
    const variants = expandParameterMatrix(source, matrix);
    expect(variants.map((variant) => variant.values)).toEqual([{ title: 'One', count: 1 }, { title: 'One', count: 2 }, { title: 'Two', count: 1 }, { title: 'Two', count: 2 }]);
    expect(expandParameterMatrix(source, matrix)).toEqual(variants);
    expect(() => expandParameterMatrix(source, matrix, 3)).toThrow('exceeds');
    expect(() => expandParameterMatrix(source, { unknown: [1] })).toThrow('Unknown');
    expect(() => expandParameterMatrix(source, { count: [-1] })).toThrow('below');
  });

  it('roundtrips CSV quoting, Unicode, newlines, numeric-looking strings and JSON', async () => {
    const source = await project();
    const variants = expandParameterMatrix(source, { title: ['007', 'Hello, "world"\nمرحبا'], count: [2] });
    for (const format of ['csv', 'json'] as const) expect(importParameterVariants(source, exportParameterVariants(variants, format), format)).toEqual(variants);
    expect(() => importParameterVariants(source, 'title,count\r\nhello,invalid', 'csv')).toThrow('invalid number');
    expect(() => importParameterVariants(source, 'title,title\na,b', 'csv')).toThrow('unique');
    expect(() => importParameterVariants(source, 'title\n"broken', 'csv')).toThrow('Unterminated');
    expect(() => importParameterVariants(source, 'title\n"x"tail', 'csv')).toThrow('quoting');
    expect(() => importParameterVariants(source, 'title,count\nx', 'csv')).toThrow('cells');
    expect(() => importParameterVariants(source, JSON.stringify([variants[0], variants[0]]), 'json')).toThrow('Duplicate');
  });

  it('refuses lossy sparse CSV exports while preserving JSON configurations', () => {
    const variants = [{ id: 'one', label: 'One', values: { title: 'Hello' } }, { id: 'two', label: 'Two', values: {} }];
    expect(() => exportParameterVariants(variants, 'csv')).toThrow('sparse');
    expect(JSON.parse(exportParameterVariants(variants, 'json'))).toEqual(variants);
  });

  it('resolves locale, brand, canvas and platform-safe-area configurations', () => {
    const source = projectSchema.parse({
      schemaVersion: 1, id: 'localized', title: 'Localized', width: 1920, height: 1080, fps: 30,
      brand: { background: '#000000', foreground: '#ffffff', accent: '#ff0000', muted: '#777777' },
      parameters: [
        { id: 'canvasWidth', label: 'Width', type: 'dimension', default: 1080 }, { id: 'canvasHeight', label: 'Height', type: 'dimension', default: 1920 },
        { id: 'accent', label: 'Brand accent', type: 'color', default: '#00ff00' }, { id: 'locale', label: 'Locale', type: 'string', default: 'ar' },
        { id: 'safeX', label: 'Safe X', type: 'number', default: 54 }, { id: 'safeWidth', label: 'Safe width', type: 'number', default: 972 },
      ], parameterBindings: { width: 'canvasWidth', height: 'canvasHeight', 'brand.accent': 'accent' },
      variants: [{ id: 'arabic-story', label: 'Arabic story safe', values: { canvasWidth: 1080, canvasHeight: 1920, accent: '#00ff00', locale: 'ar', safeX: 54, safeWidth: 972 } }],
      scenes: [{ id: 'main', purpose: 'Localized', duration: 1, background: '#000', layers: [{ id: 'caption', type: 'caption', x: 0, y: 1500, width: 100, height: 120, fontFamily: 'Arial', fontSize: 48, color: '#fff', direction: 'rtl', cues: [{ id: 'cue', start: 0, end: 1, text: 'مرحبا' }], bindings: { x: 'safeX', width: 'safeWidth' } }, { id: 'title', type: 'text', text: 'مرحبا', locale: 'en', direction: 'auto', x: 0, y: 0, width: 1000, height: 200, fontFamily: 'Arial', fontSize: 80, color: '#fff', bindings: { locale: 'locale' } }] }],
    });
    const resolved = resolveParameters(source, source.variants[0]!.values);
    expect(resolved).toMatchObject({ width: 1080, height: 1920, brand: { accent: '#00ff00' } });
    expect(resolved.scenes[0]!.layers[0]).toMatchObject({ x: 54, width: 972, safeArea: true });
    expect(resolved.scenes[0]!.layers[1]).toMatchObject({ locale: 'ar', direction: 'auto' });
  });
});
