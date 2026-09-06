import { parse as parseColor } from 'culori';
import { createHash } from 'node:crypto';
import { compositionTime } from '../engine/composition-time.js';
import { parameterValueSchema, projectSchema, type Composition, type GenmotionProject, type Layer, type Parameter, type ParameterValue } from './schema.js';

export type { ParameterValue } from './schema.js';
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Validate recursively without executing project expressions or coercing supplied types. */
export function validateParameterValue(parameter: Parameter, input: ParameterValue): ParameterValue {
  const value = parameterValueSchema.parse(input);
  const fail = (message: string): never => { throw new Error(`Parameter ${parameter.id} ${message}.`); };
  if (value === null) return parameter.optional ? null : fail('is required');
  if (['number', 'dimension', 'duration'].includes(parameter.type)) {
    if (typeof value !== 'number') return fail('requires a finite number');
    if (parameter.type === 'dimension' && (!Number.isInteger(value) || value <= 0)) return fail('requires positive integer pixels');
    if (parameter.type === 'duration' && value < 0) return fail('requires nonnegative seconds');
    if (parameter.min !== undefined && value < parameter.min) return fail(`is below ${String(parameter.min)}`);
    if (parameter.max !== undefined && value > parameter.max) return fail(`is above ${String(parameter.max)}`);
    return value;
  }
  if (parameter.type === 'boolean') return typeof value === 'boolean' ? value : fail('requires a boolean');
  if (parameter.type === 'array') {
    if (!Array.isArray(value)) return fail('requires an array');
    if (!parameter.items) return fail('requires an item definition');
    if (parameter.minLength !== undefined && value.length < parameter.minLength) return fail('has too few items');
    if (parameter.maxLength !== undefined && value.length > parameter.maxLength) return fail('has too many items');
    return value.map((item, index) => validateParameterValue({ ...parameter.items!, id: `${parameter.id}[${String(index)}]` }, item));
  }
  if (parameter.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) return fail('requires an object');
    const properties = parameter.properties;
    if (!properties) return fail('requires property definitions');
    for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) return fail(`has unknown property ${key}`);
    return Object.fromEntries(Object.entries(properties).map(([key, definition]) => {
      if (unsafeKeys.has(key)) return fail(`has unsafe property ${key}`);
      return [key, validateParameterValue({ ...definition, id: `${parameter.id}.${key}` }, Object.hasOwn(value, key) ? value[key]! : definition.default)];
    }));
  }
  if (typeof value !== 'string') return fail('requires a string');
  if (parameter.minLength !== undefined && value.length < parameter.minLength) return fail(`requires at least ${String(parameter.minLength)} characters`);
  if (parameter.maxLength !== undefined && value.length > parameter.maxLength) return fail(`exceeds ${String(parameter.maxLength)} characters`);
  if (parameter.type === 'color' && !parseColor(value)) return fail('requires a CSS color');
  if (parameter.type === 'enum' && !parameter.options?.includes(value)) return fail(`must be one of: ${parameter.options?.join(', ') ?? ''}`);
  if (['file', 'asset', 'font'].includes(parameter.type) && (!value || /(^[/\\]|^[a-z][a-z\d+.-]*:|(^|[/\\])\.\.([/\\]|$)|\0)/i.test(value))) return fail('requires a project-local relative file path');
  return value;
}

function writePath(target: Record<string, unknown>, path: string, value: ParameterValue): void {
  const parts = path.split('.');
  if (parts.some((part) => !part || unsafeKeys.has(part))) throw new Error(`Unsafe parameter binding target: ${path}`);
  let cursor: Record<string, unknown> | unknown[] = target;
  for (const [index, part] of parts.entries()) {
    if (Array.isArray(cursor) && !/^(0|[1-9]\d*)$/.test(part)) throw new Error(`Invalid array index in parameter binding: ${path}`);
    if (!Object.hasOwn(cursor, part)) throw new Error(`Parameter binding target does not exist: ${path}`);
    const record = cursor;
    if (index === parts.length - 1) { record[part] = structuredClone(value); return; }
    const next = record[part];
    if (!next || typeof next !== 'object') throw new Error(`Parameter binding target does not exist: ${path}`);
    cursor = next as Record<string, unknown>;
  }
}

function bindLayer(layer: Layer, values: Record<string, ParameterValue>): Layer {
  const result = structuredClone(layer);
  for (const [target, parameterId] of Object.entries(layer.bindings)) {
    if (!Object.hasOwn(values, parameterId)) throw new Error(`Layer ${layer.id} binds unknown parameter ${parameterId}.`);
    if (['id', 'type', 'bindings'].includes(target.split('.')[0]!)) throw new Error(`Parameter cannot bind layer identity or bindings: ${target}`);
    writePath(result, target, values[parameterId]!);
  }
  return result;
}

export function resolveParameters(project: GenmotionProject, overrides: Record<string, ParameterValue> = {}): GenmotionProject {
  const definitions = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
  if (definitions.size !== project.parameters.length) throw new Error('Duplicate project parameter identifiers.');
  for (const id of [...Object.keys(project.parameterValues), ...Object.keys(overrides)]) if (!definitions.has(id)) throw new Error(`Unknown project parameter: ${id}`);
  const values: Record<string, ParameterValue> = {};
  for (const parameter of project.parameters) {
    validateParameterValue(parameter, parameter.default);
    values[parameter.id] = validateParameterValue(parameter, Object.hasOwn(overrides, parameter.id) ? overrides[parameter.id]! : Object.hasOwn(project.parameterValues, parameter.id) ? project.parameterValues[parameter.id]! : parameter.default);
  }
  const definitionsById = new Map(project.compositions.map((composition) => [composition.id, composition]));
  if (definitionsById.size !== project.compositions.length) throw new Error('Duplicate composition identifiers.');
  const resolvedCompositions = new Map<string, Composition>();
  const instantiate = (id: string, overrides: Record<string, ParameterValue>, trail: string[]): string => {
    if (trail.includes(id)) throw new Error(`Composition cycle: ${[...trail, id].join(' -> ')}`);
    if (trail.length >= 128) throw new Error('Composition nesting exceeds 128 levels.');
    const source = definitionsById.get(id);
    if (!source) throw new Error(`Unknown composition: ${id}`);
    const definitions = source.parameters ?? [];
    if (new Set(definitions.map((parameter) => parameter.id)).size !== definitions.length) throw new Error(`Duplicate parameters in composition ${id}.`);
    for (const key of Object.keys(overrides)) if (!definitions.some((parameter) => parameter.id === key)) throw new Error(`Unknown composition parameter ${id}.${key}.`);
    const localValues: Record<string, ParameterValue> = {};
    for (const definition of definitions) {
      validateParameterValue(definition, definition.default);
      localValues[definition.id] = validateParameterValue(definition, Object.hasOwn(overrides, definition.id) ? overrides[definition.id]! : definition.default);
    }
    const specialized = Object.keys(overrides).length > 0;
    const resolvedId = specialized ? `${id}-instance-${createHash('sha256').update(JSON.stringify(localValues)).digest('hex').slice(0, 20)}` : id;
    if (specialized && definitionsById.has(resolvedId)) throw new Error(`Composition identifier collides with generated instance: ${resolvedId}`);
    if (resolvedCompositions.has(resolvedId)) return resolvedId;
    if (resolvedCompositions.size >= 10_000) throw new Error('Resolved composition count exceeds 10000.');
    const scope = { ...values, ...localValues };
    const layers = source.layers.map((layer) => resolveInstance(bindLayer(layer, scope), [...trail, id]));
    resolvedCompositions.set(resolvedId, { ...source, id: resolvedId, layers });
    return resolvedId;
  };
  const resolveInstance = (layer: Layer, trail: string[]): Layer => {
    if (layer.type !== 'composition') return layer;
    const compositionId = instantiate(layer.compositionId, layer.parameterValues ?? {}, trail);
    compositionTime(layer, resolvedCompositions.get(compositionId)!, 0, project.fps);
    return { ...layer, compositionId };
  };
  for (const composition of project.compositions) instantiate(composition.id, {}, []);
  const scenes = project.scenes.map((scene) => ({ ...scene, layers: scene.layers.map((layer) => resolveInstance(bindLayer(layer, values), [])) }));
  // Materialize distinct instance values before motion compilation and asset preparation.
  // Repeated identical instances share one immutable evaluated definition.
  return projectSchema.parse({
    ...project, parameterValues: values,
    scenes, compositions: [...resolvedCompositions.values()],
  });
}

export function parseParameterAssignments(assignments: string[] = []): Record<string, ParameterValue> {
  const entries = assignments.map((assignment) => {
    const separator = assignment.indexOf('=');
    if (separator < 1) throw new Error(`Invalid parameter assignment: ${assignment}. Expected name=value.`);
    const key = assignment.slice(0, separator);
    if (unsafeKeys.has(key)) throw new Error(`Unsafe parameter identifier: ${key}`);
    const raw = assignment.slice(separator + 1);
    let value: ParameterValue = raw;
    try { value = parameterValueSchema.parse(JSON.parse(raw)); }
    catch { if (/^[[{"]/.test(raw.trim())) throw new Error(`Invalid JSON value for parameter ${key}.`); }
    return [key, value] as const;
  });
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error('Duplicate parameter assignments.');
  return Object.fromEntries(entries);
}
