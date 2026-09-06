import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { applyDirectInstanceOverrides, inspectInstancePath, overrideHash, overridePropertyValue } from './instance-overrides.js';
import { instanceOverridesSchema, type CompositionLayer, type GenmotionProject, type InstanceOverrideChange, type InstanceOverrides } from './schema.js';

export const overrideResolutionSchema = z.object({ index: z.number().int().nonnegative(), choice: z.enum(['keep-override', 'use-base']) }).strict();
export type OverrideResolution = z.infer<typeof overrideResolutionSchema>;
export interface OverrideDiagnostic { index: number; target: string[]; code: string; message: string; canKeepOverride: boolean }
export interface OverrideReview { revision: string; baseChanged: boolean; diagnostics: OverrideDiagnostic[] }

export function instanceBaseRevision(project: GenmotionProject, instance: CompositionLayer): string {
  const bases = project.compositions.filter(item => item.id === instance.compositionId);
  if (bases.length !== 1) throw new GenmotionError('OVERRIDE_BASE_MISSING', 'Reusable base is missing or ambiguous.');
  // Include reachable definitions so a nested base edit also invalidates the review.
  const definitions = new Map<string, unknown>();
  const visit = (id: string, trail: string[]): void => {
    if (trail.includes(id)) throw new GenmotionError('COMPOSITION_CYCLE', 'Reusable base contains a composition cycle.');
    if (definitions.has(id)) return;
    const matches = project.compositions.filter(item => item.id === id);
    if (matches.length !== 1) throw new GenmotionError('OVERRIDE_BASE_MISSING', `Base ${id} is missing or ambiguous.`);
    const definition = matches[0]!; definitions.set(id, definition);
    for (const layer of definition.layers) if (layer.type === 'composition') visit(layer.compositionId, [...trail, id]);
  };
  visit(instance.compositionId, []);
  return overrideHash([...definitions.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

/** The review token covers base graph and instance data, not just array indices. */
export function reviewInstanceOverrides(project: GenmotionProject, instance: CompositionLayer): OverrideReview {
  const base = instanceBaseRevision(project, instance), changes = instance.overrides?.changes ?? [];
  const diagnostics: OverrideDiagnostic[] = [], accepted: InstanceOverrideChange[] = [];
  for (const [index, change] of changes.entries()) {
    try {
      const partial = { ...instance, overrides: { version: 1 as const, changes: accepted } };
      const { layer } = inspectInstancePath(project, partial, change.target);
      const changed = change.op === 'remove-layer'
        ? Boolean(change.expectedLayerHash && overrideHash(layer) !== change.expectedLayerHash)
        : Boolean(change.expected && overrideHash(overridePropertyValue(layer, change.path)) !== overrideHash(change.expected));
      const unchecked = change.op === 'remove-layer' ? { ...change, expectedLayerHash: undefined } : { ...change, expected: undefined };
      applyDirectInstanceOverrides([layer], [{ ...unchecked, target: [layer.id] }]);
      if (changed) diagnostics.push({ index, target: change.target, code: 'OVERRIDE_BASE_CONFLICT', message: 'The expected base value changed.', canKeepOverride: true });
      // Continue reviewing later records against the intended prior override values.
      accepted.push(unchecked);
    } catch (error) {
      diagnostics.push({ index, target: change.target, code: error instanceof GenmotionError ? error.code : 'OVERRIDE_INVALID', message: error instanceof Error ? error.message : String(error), canKeepOverride: false });
    }
  }
  return { revision: overrideHash({ base, instance }), baseChanged: Boolean(instance.overrides?.baseRevision && instance.overrides.baseRevision !== base), diagnostics };
}

/** Rebase only conflicts the caller explicitly resolved. Orphans can be dropped, never retargeted implicitly. */
export function reconcileInstanceOverrides(project: GenmotionProject, instance: CompositionLayer, expectedReview: string, input: OverrideResolution[]): InstanceOverrides {
  const review = reviewInstanceOverrides(project, instance);
  if (expectedReview !== review.revision) throw new GenmotionError('REVISION_CONFLICT', 'The instance or reusable base changed after override review.');
  const resolutions = new Map<number, OverrideResolution['choice']>();
  for (const resolution of overrideResolutionSchema.array().max(500).parse(input)) {
    if (resolutions.has(resolution.index)) throw new GenmotionError('OVERRIDE_RESOLUTION_DUPLICATE', 'An override can have only one resolution.');
    if (!review.diagnostics.some(item => item.index === resolution.index)) throw new GenmotionError('OVERRIDE_RESOLUTION_STALE', 'Resolution does not identify a current conflict.');
    resolutions.set(resolution.index, resolution.choice);
  }
  const unresolved = review.diagnostics.filter(item => !resolutions.has(item.index));
  if (unresolved.length) throw new GenmotionError('OVERRIDE_UNRESOLVED', 'Resolve all reported override conflicts before rebasing.', { diagnostics: unresolved });
  const changes: InstanceOverrideChange[] = [];
  for (const [index, change] of (instance.overrides?.changes ?? []).entries()) {
    if (resolutions.get(index) === 'use-base') continue;
    const partial = { ...instance, overrides: { version: 1 as const, changes } };
    const { layer } = inspectInstancePath(project, partial, change.target);
    // Expectations are captured against the actual preceding retained edits. If dropping
    // an earlier override invalidates a later target, inspection refuses the transaction.
    changes.push(change.op === 'remove-layer' ? { ...change, expectedLayerHash: overrideHash(layer) } : { ...change, expected: overridePropertyValue(layer, change.path) });
  }
  return instanceOverridesSchema.parse({ version: 1, baseRevision: instanceBaseRevision(project, instance), changes });
}
