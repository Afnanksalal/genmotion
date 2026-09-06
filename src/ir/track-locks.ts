import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GenmotionProject, Layer, CompositionLayer, InstanceOverrideChange } from './schema.js';
import { GenmotionError } from '../errors.js';
import { applyDirectInstanceOverrides } from './instance-overrides.js';

/** Locks protect canonical edits; unlocking is a separate, explicit transaction. */
export function assertTrackLocks(before: GenmotionProject, after: GenmotionProject): void {
  let inspected = 0;
  const check = (layer: Layer, next: Layer | undefined): void => {
    for (const group of layer.trackGroups ?? []) {
      if (!group.locked) continue;
      const replacement = next?.trackGroups?.find((item) => item.id === group.id);
      const oldTracks = layer.tracks.filter((track) => track.group === group.id);
      const newTracks = next?.tracks.filter((track) => track.group === group.id);
      if (!replacement || !isDeepStrictEqual({ ...group, locked: false }, { ...replacement, locked: false }) || !isDeepStrictEqual(oldTracks, newTracks)) throw new GenmotionError('TRACK_GROUP_LOCKED', `Unlock track group ${layer.id}/${group.id} before editing its tracks or removing it.`);
    }
    for (const track of layer.tracks) {
      if (!track.locked) continue;
      const replacement = next?.tracks.find((item) => item.id === track.id);
      if (!replacement || !isDeepStrictEqual({ ...track, locked: false }, { ...replacement, locked: false })) throw new GenmotionError('TRACK_LOCKED', `Unlock track ${layer.id}/${track.id} before editing or removing it.`);
    }
  };
  const definitionsBefore = new Map(before.compositions.map(item => [item.id, item]));
  const definitionsAfter = new Map(after.compositions.map(item => [item.id, item]));
  const completed = new Set<string>();
  const withoutExpectations = (changes: InstanceOverrideChange[]): InstanceOverrideChange[] => changes.map(change => {
    const result = structuredClone(change);
    if (result.op === 'remove-layer') delete result.expectedLayerHash;
    else delete result.expected;
    return result;
  });
  const descend = (layer: CompositionLayer, next: Layer | undefined, inherited: InstanceOverrideChange[], nextInherited: InstanceOverrideChange[], trail: string[]): void => {
    if (trail.includes(layer.compositionId)) throw new GenmotionError('COMPOSITION_CYCLE', 'Cannot inspect locks through a composition cycle.');
    const definition = definitionsBefore.get(layer.compositionId);
    if (!definition) throw new GenmotionError('COMPOSITION_MISSING', 'Cannot inspect inherited locks without the source definition.');
    const changes = [...(layer.overrides?.changes ?? []), ...inherited];
    const nextChanges = next?.type === 'composition' ? [...(next.overrides?.changes ?? []), ...nextInherited] : [];
    const nextDefinition = next?.type === 'composition' ? definitionsAfter.get(next.compositionId) : undefined;
    const key = createHash('sha256').update(JSON.stringify([layer.compositionId, nextDefinition?.id, changes, nextChanges])).digest('hex');
    if (completed.has(key)) return;
    if (++inspected > 10_000 || trail.length >= 128) throw new GenmotionError('TRACK_LOCK_GRAPH_LIMIT', 'Inherited lock inspection exceeded its composition traversal limit.');
    // Expectations detect base drift elsewhere. Lock comparison must also permit a
    // separate reconciliation transaction to repair stale expected-value metadata.
    let oldLayers = definition.layers;
    for (const change of withoutExpectations(changes)) {
      try { oldLayers = applyDirectInstanceOverrides(oldLayers, [change]); }
      catch (error) {
        // An orphan or invalid old override cannot make a locked base disappear.
        // Keep the base value so clearing stale records remains possible.
        if (!(error instanceof GenmotionError) && !(error instanceof z.ZodError)) throw error;
      }
    }
    const newLayers = nextDefinition ? applyDirectInstanceOverrides(nextDefinition.layers, withoutExpectations(nextChanges)) : [];
    for (const child of oldLayers) {
      const replacement = newLayers.find(item => item.id === child.id);
      check(child, replacement);
      if (child.type === 'composition') descend(child, replacement,
        changes.filter(change => change.target.length > 1 && change.target[0] === child.id).map(change => ({ ...change, target: change.target.slice(1) })),
        nextChanges.filter(change => change.target.length > 1 && change.target[0] === child.id).map(change => ({ ...change, target: change.target.slice(1) })), [...trail, layer.compositionId]);
    }
    completed.add(key);
  };
  for (const kind of ['scenes', 'compositions'] as const) {
    for (const container of before[kind]) {
      const next = after[kind].find((item) => item.id === container.id);
      for (const layer of container.layers) {
        const replacement = next?.layers.find((item) => item.id === layer.id);
        check(layer, replacement);
        if (layer.type === 'composition') descend(layer, replacement, [], [], []);
      }
    }
  }
}
