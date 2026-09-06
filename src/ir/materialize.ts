import { createHash } from 'node:crypto';
import { GenmotionError } from '../errors.js';
import { resolveParameters } from './parameters.js';
import { projectSchema, type GenmotionProject, type Composition, type Layer } from './schema.js';
import type { EditTarget } from './edit.js';

/** Freeze evaluated parameter bindings and sparse changes into private editable definitions. */
export function materializeCompositionInstance(project: GenmotionProject, target: EditTarget, newCompositionId: string): GenmotionProject {
  if (target.instancePath?.length) throw new GenmotionError('EDIT_MATERIALIZATION_REQUIRED', 'Materialize the outer instance first, then edit its private composition graph.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(newCompositionId) || project.compositions.some(item => item.id === newCompositionId)) throw new GenmotionError('COMPOSITION_ID_CONFLICT', 'Choose a valid unused composition ID.');
  const result = structuredClone(project), resolved = resolveParameters(project);
  const container = (target.kind === 'scene' ? result.scenes : result.compositions).filter(item => item.id === target.id);
  const evaluated = (target.kind === 'scene' ? resolved.scenes : resolved.compositions).filter(item => item.id === target.id);
  if (container.length !== 1 || evaluated.length !== 1) throw new GenmotionError('EDIT_TARGET_AMBIGUOUS', 'The instance scope is missing or ambiguous.');
  const originals = container[0]!.layers.filter(layer => layer.id === target.layerId), evaluatedLayers = evaluated[0]!.layers.filter(layer => layer.id === target.layerId);
  const instance = originals[0], source = evaluatedLayers[0];
  if (originals.length !== 1 || evaluatedLayers.length !== 1 || instance?.type !== 'composition' || source?.type !== 'composition') throw new GenmotionError('EDIT_UNSUPPORTED', 'Materialization requires a composition instance.');
  const copies = new Map<string, Composition>();
  const copy = (id: string, preferred?: string): string => {
    const existing = copies.get(id); if (existing) return existing.id;
    const definitions = resolved.compositions.filter(item => item.id === id);
    if (definitions.length !== 1) throw new GenmotionError('COMPOSITION_MISSING', `Resolved composition ${id} is missing or ambiguous.`);
    const name = preferred ?? `${newCompositionId}-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
    if (result.compositions.some(item => item.id === name) || [...copies.values()].some(item => item.id === name)) throw new GenmotionError('COMPOSITION_ID_CONFLICT', `Private composition ID ${name} already exists.`);
    const definition = structuredClone(definitions[0]!); definition.id = name; definition.parameters = []; delete definition.parameterBindings;
    copies.set(id, definition);
    definition.layers = definition.layers.map((layer): Layer => {
      const next = structuredClone(layer); next.bindings = {};
      if (next.type === 'composition') { next.compositionId = copy(next.compositionId); delete next.parameterValues; delete next.overrides; }
      return next;
    });
    return name;
  };
  instance.compositionId = copy(source.compositionId, newCompositionId);
  delete instance.parameterValues; delete instance.overrides;
  for (const binding of Object.keys(instance.bindings)) if (binding === 'parameterValues' || binding.startsWith('parameterValues.') || binding === 'overrides' || binding.startsWith('overrides.')) delete instance.bindings[binding];
  result.compositions.push(...copies.values());
  return projectSchema.parse(result);
}
