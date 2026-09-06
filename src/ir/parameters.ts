import { validateParameterValue } from './parameter-values.js';
export { validateParameterValue } from './parameter-values.js';
import { createHash } from 'node:crypto';
import { compositionTime } from '../engine/composition-time.js';
import { evaluateParameterExpression } from './expressions.js';
import { frozenDataValues } from './data-sources.js';
import { automaticDuration } from './automatic-duration.js';
import { isDeepStrictEqual } from 'node:util';
import { applyDirectInstanceOverrides } from './instance-overrides.js';
import type { InstanceOverrideChange } from './schema.js';
import { parameterValueSchema, projectSchema, type Composition, type GenmotionProject, type Layer, type Parameter, type ParameterValue } from './schema.js';

export type { ParameterValue } from './schema.js';
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);

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

export function resolveParameterScope(parameters: Parameter[], supplied: Record<string, ParameterValue> = {}, parent: Record<string, ParameterValue> = {}): Record<string, ParameterValue> {
  const definitions = new Map(parameters.map(parameter => [parameter.id, parameter]));
  if (definitions.size !== parameters.length) throw new Error('Duplicate parameter identifiers.');
  for (const id of Object.keys(supplied)) if (!definitions.has(id)) throw new Error(`Unknown parameter: ${id}`);
  const values: Record<string, ParameterValue> = {}, active: string[] = [];
  const resolve = (id: string): ParameterValue => {
    if (id.startsWith('project.')) { const key = id.slice('project.'.length); if (!Object.hasOwn(parent, key)) throw new Error(`Unknown project parameter reference: ${id}`); return parent[key]!; }
    if (Object.hasOwn(values, id)) return values[id]!;
    const definition = definitions.get(id);
    if (!definition) { if (Object.hasOwn(parent, id)) return parent[id]!; throw new Error(`Unknown derived parameter reference: ${id}`); }
    if (active.includes(id)) throw new Error(`Derived parameter cycle: ${[...active, id].join(' -> ')}`);
    if (active.length >= 64) throw new Error('Derived parameter dependency depth exceeds 64.');
    active.push(id);
    try {
      validateParameterValue(definition, definition.default);
      const value = definition.derive ? evaluateParameterExpression(definition.derive, resolve) : Object.hasOwn(supplied, id) ? supplied[id]! : definition.default;
      const parsed = validateParameterValue(definition, value);
      if (definition.derive && Object.hasOwn(supplied, id) && !isDeepStrictEqual(supplied[id], parsed)) throw new Error(`Derived parameter ${id} cannot be overridden; edit its inputs instead.`);
      values[id] = parsed; return parsed;
    } finally { active.pop(); }
  };
  for (const parameter of parameters) resolve(parameter.id);
  return values;
}

function bindContainer<T extends object>(container: T & { parameterBindings?: Record<string, string | undefined> | undefined }, values: Record<string, ParameterValue>): T {
  const result = structuredClone(container);
  for (const [field, id] of Object.entries(container.parameterBindings ?? {})) {
    if (id === undefined) continue;
    if (!Object.hasOwn(values, id)) throw new Error(`Unknown preflight parameter ${id} for ${field}.`);
    (result as Record<string, unknown>)[field] = structuredClone(values[id]);
  }
  return result;
}

export function resolveParameters(project: GenmotionProject, overrides: Record<string, ParameterValue> = {}): GenmotionProject {
  return resolveParameterGraph(project, overrides).project;
}

/** Preserve the source identity behind each evaluated, specialized definition. */
export function resolveParameterGraph(project: GenmotionProject, overrides: Record<string, ParameterValue> = {}): { project: GenmotionProject; compositionSources: Record<string, string> } {
  const compositionSources: Record<string, string> = {};
  const values = resolveParameterScope(project.parameters, { ...frozenDataValues(project), ...project.parameterValues, ...overrides });
  const boundProject = bindContainer(project, values);
  const definitionsById = new Map(project.compositions.map((composition) => [composition.id, composition]));
  if (definitionsById.size !== project.compositions.length) throw new Error('Duplicate composition identifiers.');
  const resolvedCompositions = new Map<string, Composition>();
  let instanceCount = 0;
  const instantiate = (id: string, overrides: Record<string, ParameterValue>, trail: string[], changes: InstanceOverrideChange[] = []): string => {
    if (trail.includes(id)) throw new Error(`Composition cycle: ${[...trail, id].join(' -> ')}`);
    if (trail.length >= 128) throw new Error('Composition nesting exceeds 128 levels.');
    const source = definitionsById.get(id);
    if (!source) throw new Error(`Unknown composition: ${id}`);
    const definitions = source.parameters ?? [];
    for (const key of Object.keys(overrides)) if (!definitions.some(definition => definition.id === key)) throw new Error(`Unknown composition parameter: ${key}`);
    const localValues = resolveParameterScope(definitions, overrides, values);
    const specialized = Object.keys(overrides).length > 0 || changes.length > 0;
    const resolvedId = specialized ? `${id}-instance-${createHash('sha256').update(JSON.stringify({ values: localValues, changes })).digest('hex').slice(0, 20)}` : id;
    if (specialized && definitionsById.has(resolvedId)) throw new Error(`Composition identifier collides with generated instance: ${resolvedId}`);
    if (resolvedCompositions.has(resolvedId)) return resolvedId;
    compositionSources[resolvedId] = id;
    if (++instanceCount > 10_000) throw new Error('Resolved composition count exceeds 10000.');
    const scope = { ...values, ...localValues };
    const layers = applyDirectInstanceOverrides(source.layers, changes).map((layer) => {
      const nested = changes.filter(change => change.target.length > 1 && change.target[0] === layer.id).map(change => ({ ...change, target: change.target.slice(1) }));
      return resolveInstance(bindLayer(layer, scope), [...trail, id], nested);
    });
    const definition = { ...bindContainer(source, scope), id: resolvedId,
      parameters: definitions.map(parameter => ({ ...parameter, default: structuredClone(localValues[parameter.id]!) })), layers };
    definition.duration = automaticDuration(definition, resolvedCompositions);
    resolvedCompositions.set(resolvedId, definition);
    return resolvedId;
  };
  const resolveInstance = (layer: Layer, trail: string[], inherited: InstanceOverrideChange[] = []): Layer => {
    if (layer.type !== 'composition') return layer;
    const compositionId = instantiate(layer.compositionId, layer.parameterValues ?? {}, trail, [...(layer.overrides?.changes ?? []), ...inherited]);
    compositionTime(layer, resolvedCompositions.get(compositionId)!, 0, boundProject.fps);
    return { ...layer, compositionId, overrides: undefined };
  };
  for (const composition of project.compositions) instantiate(composition.id, {}, []);
  const scenes = project.scenes.map(scene => {
    const resolved = { ...bindContainer(scene, values), layers: scene.layers.map(layer => resolveInstance(bindLayer(layer, values), [])) };
    resolved.duration = automaticDuration(resolved, resolvedCompositions); return resolved;
  });
  // Materialize distinct instance values before motion compilation and asset preparation.
  // Repeated identical instances share one immutable evaluated definition.
  return { project: projectSchema.parse({
    ...boundProject, parameterValues: values,
    scenes, compositions: [...resolvedCompositions.values()],
  }), compositionSources };
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
