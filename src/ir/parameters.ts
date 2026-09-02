import type { GenmotionProject, Layer, Parameter } from './schema.js';

export type ParameterValue = string | number | boolean;

function validateValue(parameter: Parameter, value: ParameterValue): ParameterValue {
  if (parameter.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Parameter ${parameter.id} requires a finite number.`);
    if (parameter.min !== undefined && value < parameter.min) throw new Error(`Parameter ${parameter.id} is below ${String(parameter.min)}.`);
    if (parameter.max !== undefined && value > parameter.max) throw new Error(`Parameter ${parameter.id} is above ${String(parameter.max)}.`);
  } else if (parameter.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Parameter ${parameter.id} requires a boolean.`);
  else if ((parameter.type === 'string' || parameter.type === 'color' || parameter.type === 'enum') && typeof value !== 'string') throw new Error(`Parameter ${parameter.id} requires a string.`);
  if (parameter.type === 'string' && parameter.maxLength !== undefined && String(value).length > parameter.maxLength) throw new Error(`Parameter ${parameter.id} exceeds ${String(parameter.maxLength)} characters.`);
  if (parameter.type === 'color' && !/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()/.test(String(value))) throw new Error(`Parameter ${parameter.id} requires a CSS color.`);
  if (parameter.type === 'enum' && !parameter.options.includes(String(value))) throw new Error(`Parameter ${parameter.id} must be one of: ${parameter.options.join(', ')}.`);
  return value;
}

function writePath(target: Record<string, unknown>, path: string, value: ParameterValue): void {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error(`Parameter binding target does not exist: ${path}`);
    cursor = next as Record<string, unknown>;
  }
  const key = parts.at(-1);
  if (!key || !(key in cursor)) throw new Error(`Parameter binding target does not exist: ${path}`);
  const existing = cursor[key];
  if (typeof existing !== typeof value) throw new Error(`Parameter binding ${path} cannot replace ${typeof existing} with ${typeof value}.`);
  cursor[key] = value;
}

function bindLayer(layer: Layer, values: Record<string, ParameterValue>): Layer {
  const result = structuredClone(layer);
  for (const [target, parameterId] of Object.entries(layer.bindings)) {
    if (!(parameterId in values)) throw new Error(`Layer ${layer.id} binds unknown parameter ${parameterId}.`);
    writePath(result, target, values[parameterId]!);
  }
  return result;
}

export function resolveParameters(project: GenmotionProject, overrides: Record<string, ParameterValue> = {}): GenmotionProject {
  const definitions = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
  for (const id of [...Object.keys(project.parameterValues), ...Object.keys(overrides)]) if (!definitions.has(id)) throw new Error(`Unknown project parameter: ${id}`);
  const values: Record<string, ParameterValue> = {};
  for (const parameter of project.parameters) values[parameter.id] = validateValue(parameter, overrides[parameter.id] ?? project.parameterValues[parameter.id] ?? parameter.default);
  return {
    ...project,
    parameterValues: values,
    scenes: project.scenes.map((scene) => ({ ...scene, layers: scene.layers.map((layer) => bindLayer(layer, values)) })),
    compositions: project.compositions.map((composition) => ({ ...composition, layers: composition.layers.map((layer) => bindLayer(layer, values)) })),
  };
}

export function parseParameterAssignments(assignments: string[] = []): Record<string, ParameterValue> {
  return Object.fromEntries(assignments.map((assignment) => {
    const separator = assignment.indexOf('=');
    if (separator < 1) throw new Error(`Invalid parameter assignment: ${assignment}. Expected name=value.`);
    const key = assignment.slice(0, separator);
    const raw = assignment.slice(separator + 1);
    const value: ParameterValue = raw === 'true' ? true : raw === 'false' ? false : raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    return [key, value];
  }));
}
