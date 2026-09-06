import { createHash } from 'node:crypto';
import { GenmotionError } from '../errors.js';
import { applyPatch } from './patch.js';
import { layerSchema, instanceOverrideChangeSchema, type Layer, type InstanceOverrideChange, type GenmotionProject, type CompositionLayer, type ParameterValue } from './schema.js';

export const overrideHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex');
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function overridePropertyValue(layer: Layer, path: string[]): { exists: boolean; value?: ParameterValue } {
  let value: unknown = layer;
  for (const key of path) {
    if (forbidden.has(key)) throw new GenmotionError('OVERRIDE_UNSAFE_PATH', 'Unsafe override property.');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return { exists: false };
    value = (value as Record<string, unknown>)[key];
  }
  return value === undefined ? { exists: false } : { exists: true, value: structuredClone(value) as ParameterValue };
}
/** Applies only direct-child changes; nested changes are forwarded during instance specialization. */
export function applyDirectInstanceOverrides(layers: Layer[], input: InstanceOverrideChange[]): Layer[] {
  const result = structuredClone(layers);
  for (const raw of input) {
    const change = instanceOverrideChangeSchema.parse(raw);
    const matches = result.filter(layer => layer.id === change.target[0]);
    if (matches.length !== 1) throw new GenmotionError('OVERRIDE_ORPHAN', `Override target ${change.target.join('/')} resolved to ${String(matches.length)} layers.`);
    const layer = matches[0]!;
    if (change.target.length > 1) { if (layer.type !== 'composition') throw new GenmotionError('OVERRIDE_NOT_COMPOSITION', `${layer.id} cannot contain a nested target.`); continue; }
    if (change.op === 'remove-layer') {
      if (change.expectedLayerHash && overrideHash(layer) !== change.expectedLayerHash) throw new GenmotionError('OVERRIDE_BASE_CONFLICT', `Base layer ${layer.id} changed before removal.`);
      result.splice(result.indexOf(layer), 1); continue;
    }
    if (['id', 'type', 'compositionId', 'overrides'].includes(change.path[0]!)) throw new GenmotionError('OVERRIDE_IDENTITY_IMMUTABLE', 'Sparse overrides cannot rewrite identity or their own override records.');
    const current = overridePropertyValue(layer, change.path);
    if (change.expected && (current.exists !== change.expected.exists || (current.exists && overrideHash(current.value) !== overrideHash(change.expected.value)))) throw new GenmotionError('OVERRIDE_BASE_CONFLICT', `Base property ${layer.id}.${change.path.join('.')} changed.`);
    const pointer = '/' + change.path.map(key => key.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
    if (change.op === 'unset' && !current.exists) continue;
    const updated = applyPatch(layer, [change.op === 'unset' ? { op: 'remove', path: pointer } : { op: current.exists ? 'replace' : 'add', path: pointer, value: change.value }]);
    const parsed = layerSchema.parse(updated);
    if (change.op === 'set') applyPatch(parsed, [{ op: 'test', path: pointer, value: change.value }]);
    const property = change.path.join('.');
    for (const binding of Object.keys(parsed.bindings)) if (binding === property || binding.startsWith(property + '.') || property.startsWith(binding + '.')) delete parsed.bindings[binding];
    result[result.indexOf(layer)] = parsed;
  }
  return result;
}

export function inspectInstancePath(project: GenmotionProject, instance: CompositionLayer, target: string[]): { layer: Layer; siblings: Layer[]; compositionId: string; instancePath: string[] } {
  if (!target.length || target.length > 128) throw new GenmotionError('OVERRIDE_PATH_INVALID', 'A target must contain 1 to 128 stable layer IDs.');
  let current = instance, inherited: InstanceOverrideChange[] = [];
  const visited: string[] = [];
  for (let index = 0; index < target.length; index++) {
    if (visited.includes(current.compositionId)) throw new GenmotionError('COMPOSITION_CYCLE', 'Instance path traverses a composition cycle.');
    visited.push(current.compositionId);
    const definitions = project.compositions.filter(item => item.id === current.compositionId);
    if (definitions.length !== 1) throw new GenmotionError('OVERRIDE_BASE_MISSING', 'Instance base is missing or ambiguous.');
    const changes = [...(current.overrides?.changes ?? []), ...inherited];
    const layers = applyDirectInstanceOverrides(definitions[0]!.layers, changes);
    const matches = layers.filter(layer => layer.id === target[index]);
    if (matches.length !== 1) throw new GenmotionError('OVERRIDE_ORPHAN', `Instance target ${target.join('/')} is missing or ambiguous.`);
    const layer = matches[0]!;
    if (index === target.length - 1) return { layer: structuredClone(layer), siblings: layers, compositionId: current.compositionId, instancePath: [instance.id, ...target.slice(0, -1)] };
    if (layer.type !== 'composition') throw new GenmotionError('OVERRIDE_NOT_COMPOSITION', `${layer.id} is not a composition instance.`);
    inherited = changes.filter(change => change.target.length > 1 && change.target[0] === layer.id).map(change => ({ ...change, target: change.target.slice(1) })); current = layer;
  }
  throw new GenmotionError('OVERRIDE_PATH_INVALID', 'Invalid instance path.');
}
