import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { projectSchema } from '../src/ir/schema.js';
import { expandParameterMatrix, exportParameterVariants, importParameterVariants } from '../src/ir/variants.js';

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
});
