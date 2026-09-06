import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { frozenDataSourceSchema, projectSchema, type FrozenDataSource, type GenmotionProject, type Parameter, type ParameterValue } from './schema.js';
import { validateParameterValue } from './parameter-values.js';
import { csvRows } from './csv.js';

export const frozenDataImportSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/), parameterId: z.string().min(1),
  format: z.enum(['json', 'csv']), sourceName: z.string().min(1).max(200), content: z.string().max(8 * 1024 * 1024),
}).strict();
export type FrozenDataImport = z.infer<typeof frozenDataImportSchema>;
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

function csvValue(definition: Parameter, content: string): ParameterValue {
  if (definition.type !== 'array' || definition.items?.type !== 'object' || !definition.items.properties) throw new GenmotionError('DATA_CSV_SCHEMA', 'CSV requires an array parameter with typed object items.');
  const rows = csvRows(content.replace(/^\uFEFF/, ''), 100_000), headers = rows.shift(), fields = definition.items.properties;
  if (!headers?.length || new Set(headers).size !== headers.length || headers.some(key => !Object.hasOwn(fields, key))) throw new GenmotionError('DATA_CSV_HEADER', 'CSV headers must be unique declared object properties.');
  return rows.map((cells, row) => {
    if (cells.length !== headers.length) throw new GenmotionError('DATA_CSV_COLUMNS', `CSV row ${row + 2} has the wrong column count.`);
    return Object.fromEntries(headers.map((key, index) => {
      const field = fields[key]!, cell = cells[index]!;
      if (field.optional && cell === '') return [key, null];
      if (['number', 'dimension', 'duration', 'boolean', 'array', 'object'].includes(field.type)) {
        try { return [key, JSON.parse(cell) as ParameterValue]; }
        catch { throw new GenmotionError('DATA_CSV_VALUE', `CSV row ${row + 2}, ${key} requires valid ${field.type} JSON.`); }
      }
      return [key, cell];
    }));
  });
}

/** Capture data into the project document; the original file is never read during rendering. */
export function importFrozenData(project: GenmotionProject, input: FrozenDataImport): { project: GenmotionProject; source: FrozenDataSource } {
  const request = frozenDataImportSchema.parse(input);
  if (Buffer.byteLength(request.content) > 8 * 1024 * 1024) throw new GenmotionError('DATA_SIZE_LIMIT', 'Data import exceeds 8 MiB.');
  const matches = project.parameters.filter(parameter => parameter.id === request.parameterId), definition = matches[0];
  if (matches.length !== 1 || !definition) throw new GenmotionError('DATA_PARAMETER_MISSING', 'Data import requires one existing typed project parameter.');
  if (definition.derive) throw new GenmotionError('DATA_PARAMETER_DERIVED', 'Import into an input parameter; derived parameters calculate their own values.');
  const value: unknown = request.format === 'json' ? JSON.parse(request.content.replace(/^\uFEFF/, '')) : csvValue(definition, request.content);
  const captured = frozenDataSourceSchema.parse({ version: 1, id: request.id, parameterId: request.parameterId, format: request.format, sourceName: request.sourceName, capturedAt: new Date().toISOString(), sourceHash: hash(request.content), valueHash: hash(''), value });
  captured.value = validateParameterValue(definition, captured.value); captured.valueHash = hash(JSON.stringify(captured.value));
  if (Buffer.byteLength(JSON.stringify(captured.value)) > 8 * 1024 * 1024) throw new GenmotionError('DATA_SIZE_LIMIT', 'Normalized data exceeds 8 MiB.');
  const result = structuredClone(project);
  const conflict = result.dataSources?.find(source => source.parameterId === request.parameterId && source.id !== request.id);
  if (conflict) throw new GenmotionError('DATA_PARAMETER_CONFLICT', `Parameter ${request.parameterId} is already supplied by ${conflict.id}.`);
  result.dataSources = [...(result.dataSources ?? []).filter(source => source.id !== request.id), captured];
  delete result.parameterValues[request.parameterId];
  return { project: projectSchema.parse(result), source: captured };
}

export function frozenDataValues(project: GenmotionProject): Record<string, ParameterValue> {
  const values: Record<string, ParameterValue> = {}, ids = new Set<string>();
  for (const source of project.dataSources ?? []) {
    if (ids.has(source.id) || Object.hasOwn(values, source.parameterId)) throw new GenmotionError('DATA_SOURCE_DUPLICATE', 'Frozen source IDs and supplied parameter IDs must be unique.');
    ids.add(source.id);
    const serialized = JSON.stringify(source.value);
    if (Buffer.byteLength(serialized) > 8 * 1024 * 1024 || hash(serialized) !== source.valueHash) throw new GenmotionError('DATA_SOURCE_CHANGED', `Frozen source ${source.id} changed; import a new snapshot explicitly.`);
    const definition = project.parameters.find(parameter => parameter.id === source.parameterId);
    if (!definition || definition.derive) throw new GenmotionError('DATA_PARAMETER_INVALID', `Frozen source ${source.id} must supply an existing input parameter.`);
    values[source.parameterId] = validateParameterValue(definition, source.value);
  }
  return values;
}
