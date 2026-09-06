import { isDeepStrictEqual } from 'node:util';
import type { GenmotionProject, Layer } from './schema.js';
import { GenmotionError } from '../errors.js';

/** Locks protect canonical edits; unlocking is a separate, explicit transaction. */
export function assertTrackLocks(before: GenmotionProject, after: GenmotionProject): void {
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
  for (const kind of ['scenes', 'compositions'] as const) {
    for (const container of before[kind]) {
      const next = after[kind].find((item) => item.id === container.id);
      for (const layer of container.layers) check(layer, next?.layers.find((item) => item.id === layer.id));
    }
  }
}
