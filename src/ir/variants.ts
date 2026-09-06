import { z } from 'zod';
import { parameterValueSchema, variantSchema, type GenmotionProject, type ParameterValue } from './schema.js';
import { resolveParameters } from './parameters.js';

export type ParameterVariant = z.infer<typeof variantSchema>;
export const parameterMatrixSchema = z.record(z.string(), z.array(parameterValueSchema).min(1));

/** Bounded Cartesian product in authored axis order, with stable identifiers. */
export function expandParameterMatrix(project: GenmotionProject, input: Record<string, ParameterValue[]>, limit = 1_000): ParameterVariant[] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Variant limit must be a positive integer.');
  const axes = Object.entries(parameterMatrixSchema.parse(input));
  let size = 1;
  for (const [id, values] of axes) {
    if (!project.parameters.some((parameter) => parameter.id === id)) throw new Error(`Unknown project parameter: ${id}`);
    size *= values.length;
    if (size > limit) throw new Error(`Parameter matrix exceeds ${String(limit)} variants.`);
  }
  let rows: Array<Record<string, ParameterValue>> = [{}];
  for (const [id, values] of axes) rows = rows.flatMap((row) => values.map((value) => ({ ...row, [id]: structuredClone(value) })));
  return rows.map((values, index) => {
    resolveParameters(project, values);
    return { id: `variant-${String(index + 1).padStart(4, '0')}`, label: axes.length ? axes.map(([id]) => `${id}: ${JSON.stringify(values[id])}`).join(' · ') : 'Default', values };
  });
}

/** RFC 4180 quoting, including embedded newlines and doubled quotes. */
function csvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const emitCell = (): void => { row.push(cell); cell = ''; closed = false; };
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closed = true; }
      } else cell += character;
    } else if (character === ',') emitCell();
    else if (character === '\r' || character === '\n') {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      emitCell(); rows.push(row); row = [];
    } else if (character === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || character === '"') throw new Error('Malformed CSV quoting.');
      cell += character;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quoted cell.');
  if (cell || row.length || closed) { emitCell(); rows.push(row); }
  return rows;
}

export function importParameterVariants(project: GenmotionProject, content: string, format: 'json' | 'csv', limit = 1_000): ParameterVariant[] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Variant limit must be a positive integer.');
  let variants: ParameterVariant[];
  if (format === 'json') variants = z.array(variantSchema).max(limit).parse(JSON.parse(content));
  else {
    const rows = csvRows(content.replace(/^\uFEFF/, ''));
    const header = rows.shift();
    if (!header || !header.length || new Set(header).size !== header.length) throw new Error('CSV requires unique column names.');
    for (const name of header) if (name !== '$id' && name !== '$label' && !project.parameters.some((parameter) => parameter.id === name)) throw new Error(`Unknown CSV column: ${name}`);
    if (rows.length > limit) throw new Error(`CSV exceeds ${String(limit)} variants.`);
    variants = rows.map((cells, index) => {
      if (cells.length !== header.length) throw new Error(`CSV row ${String(index + 2)} has ${String(cells.length)} cells; expected ${String(header.length)}.`);
      const values: Record<string, ParameterValue> = {};
      let id = `variant-${String(index + 1).padStart(4, '0')}`, label = id;
      for (const [column, name] of header.entries()) {
        const cell = cells[column]!;
        if (name === '$id') { id = cell; continue; }
        if (name === '$label') { label = cell; continue; }
        const definition = project.parameters.find((parameter) => parameter.id === name)!;
        if (['number', 'dimension', 'duration', 'boolean', 'object', 'array'].includes(definition.type) || (definition.optional && cell === 'null')) {
          try { values[name] = parameterValueSchema.parse(JSON.parse(cell)); }
          catch { throw new Error(`CSV row ${String(index + 2)}, ${name}: invalid ${definition.type} value.`); }
        } else values[name] = cell;
      }
      return variantSchema.parse({ id, label, values });
    });
  }
  if (new Set(variants.map((variant) => variant.id)).size !== variants.length) throw new Error('Duplicate variant identifiers.');
  for (const variant of variants) resolveParameters(project, variant.values);
  return variants;
}

export function exportParameterVariants(variants: ParameterVariant[], format: 'json' | 'csv'): string {
  const checked = z.array(variantSchema).parse(variants);
  if (format === 'json') return `${JSON.stringify(checked, null, 2)}\n`;
  const names = [...new Set(checked.flatMap((variant) => Object.keys(variant.values)))];
  // CSV has no distinction between absent and empty; refuse lossy export.
  for (const variant of checked) for (const name of names) if (!Object.hasOwn(variant.values, name)) throw new Error('CSV export requires the same parameter columns in every variant. Use JSON to preserve sparse overrides.');
  const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`;
  return [['$id', '$label', ...names], ...checked.map((variant) => [variant.id, variant.label, ...names.map((name) => typeof variant.values[name] === 'string' ? variant.values[name] : JSON.stringify(variant.values[name]))])].map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
}
