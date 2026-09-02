import type { AnimatedNumber, AnimationTrack, AnimationValue, Extrapolation, Layer } from '../ir/schema.js';
import { extendAnimationFrames, evaluateAnimationFrames } from './interpolation.js';
import { fractalNoise } from './procedural.js';
import { evaluateNumber } from './timeline.js';

interface TrackClock { time: number; extend: boolean; identity: boolean }

function modeForSide(track: AnimationTrack, side: 'left' | 'right'): Extrapolation {
  return (side === 'left' ? track.extrapolateLeft : track.extrapolateRight) ?? track.extrapolate;
}

function trackClock(track: AnimationTrack, time: number): TrackClock {
  const first = track.keyframes[0]?.at ?? 0;
  const last = track.keyframes.at(-1)?.at ?? first;
  const span = last - first;
  if (span <= 0 || (time >= first && time <= last)) return { time, extend: false, identity: false };
  const mode = modeForSide(track, time < first ? 'left' : 'right');
  if (mode === 'identity') return { time, extend: false, identity: true };
  if (mode === 'extend') return { time, extend: true, identity: false };
  if (mode === 'clamp') return { time: time < first ? first : last, extend: false, identity: false };
  const cycle = ((time - first) % span + span) % span;
  if (mode === 'loop' || mode === 'wrap') return { time: first + cycle, extend: false, identity: false };
  const iteration = Math.floor((time - first) / span);
  return { time: Math.abs(iteration) % 2 === 0 ? first + cycle : last - cycle, extend: false, identity: false };
}

function readValue(target: Record<string, unknown>, path: string[], time: number): AnimationValue | undefined {
  let cursor: unknown = target;
  for (const part of path) cursor = typeof cursor === 'object' && cursor !== null ? (cursor as Record<string, unknown>)[part] : undefined;
  if (typeof cursor === 'number' || typeof cursor === 'string') return cursor;
  if (Array.isArray(cursor) && (cursor.length === 2 || cursor.length === 4) && cursor.every((value) => typeof value === 'number')) return cursor as AnimationValue;
  if (typeof cursor === 'object' && cursor !== null && 'keyframes' in cursor) return evaluateNumber(cursor as AnimatedNumber, time);
  return undefined;
}

function writeValue(target: Record<string, unknown>, path: string[], value: AnimationValue): void {
  let cursor = target;
  for (const part of path.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  const key = path.at(-1);
  if (key) cursor[key] = value;
}

function combine(current: AnimationValue | undefined, value: AnimationValue, operation: AnimationTrack['operation']): AnimationValue {
  if (operation === 'replace' || current === undefined) return value;
  if (typeof current === 'number' && typeof value === 'number') return operation === 'add' ? current + value : current * value;
  if (Array.isArray(current) && Array.isArray(value) && current.length === value.length) {
    return current.map((item, index) => operation === 'add' ? item + (value[index] ?? 0) : item * (value[index] ?? 1)) as AnimationValue;
  }
  return value;
}

function withNoise(value: AnimationValue, track: AnimationTrack, time: number, projectSeed: number): AnimationValue {
  if (!track.noise) return value;
  const options = track.noise;
  const sample = (component: number): number => fractalNoise(projectSeed ^ options.seed, [time * options.frequency, component], options) * options.amplitude;
  if (typeof value === 'number') return value + sample(0);
  if (Array.isArray(value)) return value.map((component, index) => component + sample(index)) as AnimationValue;
  return value;
}

export function evaluateTrack(track: AnimationTrack, time: number, projectSeed = 0): AnimationValue | undefined {
  const clock = trackClock(track, time);
  if (clock.identity) return undefined;
  const value = clock.extend
    ? extendAnimationFrames(track.keyframes, clock.time, track.interpolation ?? 'linear')
    : evaluateAnimationFrames(track.keyframes, clock.time, track.interpolation ?? 'linear');
  return withNoise(value, track, time, projectSeed);
}

export function evaluateLayerTracks(layer: Layer, time: number, projectSeed = 0): Layer {
  if (layer.tracks.length === 0) return layer;
  const evaluated = structuredClone(layer);
  for (const track of layer.tracks) {
    if (!track.enabled) continue;
    const path = track.target.split('.');
    const value = evaluateTrack(track, time, projectSeed);
    if (value === undefined) continue;
    const record = evaluated as unknown as Record<string, unknown>;
    writeValue(record, path, combine(readValue(record, path, time), value, track.operation));
  }
  return evaluated;
}
