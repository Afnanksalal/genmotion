import type { AnimatedNumber, AnimationTrack, Layer } from '../ir/schema.js';
import { evaluateNumber } from './timeline.js';

function trackTime(track: AnimationTrack, time: number): number {
  const first = track.keyframes[0]?.at ?? 0;
  const last = track.keyframes.at(-1)?.at ?? first;
  const span = last - first;
  if (span <= 0 || track.extrapolate === 'clamp') return time;
  const cycle = ((time - first) % span + span) % span;
  if (track.extrapolate === 'loop') return first + cycle;
  const iteration = Math.floor(Math.max(0, time - first) / span);
  return iteration % 2 === 0 ? first + cycle : last - cycle;
}

function readNumber(target: Record<string, unknown>, path: string[], time: number): number {
  let cursor: unknown = target;
  for (const part of path) cursor = typeof cursor === 'object' && cursor !== null ? (cursor as Record<string, unknown>)[part] : undefined;
  if (typeof cursor === 'number') return cursor;
  if (typeof cursor === 'object' && cursor !== null && 'keyframes' in cursor) return evaluateNumber(cursor as AnimatedNumber, time);
  return 0;
}

function writeNumber(target: Record<string, unknown>, path: string[], value: number): void {
  let cursor = target;
  for (const part of path.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  const key = path.at(-1);
  if (key) cursor[key] = value;
}

export function evaluateLayerTracks(layer: Layer, time: number): Layer {
  if (layer.tracks.length === 0) return layer;
  const evaluated = structuredClone(layer);
  for (const track of layer.tracks) {
    if (!track.enabled) continue;
    const path = track.target.split('.');
    const value = evaluateNumber({ keyframes: track.keyframes }, trackTime(track, time));
    const current = readNumber(evaluated, path, time);
    const next = track.operation === 'add' ? current + value : track.operation === 'multiply' ? current * value : value;
    writeNumber(evaluated, path, next);
  }
  return evaluated;
}
