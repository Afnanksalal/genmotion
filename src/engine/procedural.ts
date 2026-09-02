import type { EasingName, ProceduralNoise, Stagger } from '../ir/schema.js';
import { ease } from './easing.js';

function hash(seed: number, coordinates: number[]): number {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  for (const coordinate of coordinates) {
    value ^= Math.imul(coordinate + 0x7f4a7c15, 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 16), 0xc2b2ae35) >>> 0;
  }
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

export function seededRandom(seed: number, index = 0): number {
  return hash(seed, [index]);
}

const smooth = (value: number): number => value * value * value * (value * (value * 6 - 15) + 10);

export function noiseND(seed: number, coordinates: number[]): number {
  if (coordinates.length < 1 || coordinates.length > 4 || coordinates.some((value) => !Number.isFinite(value))) throw new Error('Noise requires one to four finite coordinates.');
  const base = coordinates.map(Math.floor);
  const fractions = coordinates.map((value, index) => smooth(value - (base[index] ?? 0)));
  let total = 0;
  const corners = 1 << coordinates.length;
  for (let mask = 0; mask < corners; mask += 1) {
    const corner = base.map((value, axis) => value + ((mask >> axis) & 1));
    let weight = 1;
    for (let axis = 0; axis < coordinates.length; axis += 1) weight *= ((mask >> axis) & 1) ? fractions[axis]! : 1 - fractions[axis]!;
    total += (hash(seed, corner) * 2 - 1) * weight;
  }
  return total;
}

export function fractalNoise(seed: number, coordinates: number[], options: Pick<ProceduralNoise, 'octaves' | 'lacunarity' | 'gain'>): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < options.octaves; octave += 1) {
    total += noiseND(seed + octave * 1013, coordinates.map((value) => value * frequency)) * amplitude;
    normalization += amplitude;
    amplitude *= options.gain;
    frequency *= options.lacunarity;
  }
  return normalization > 0 ? total / normalization : 0;
}

export function staggerOrder(index: number, count: number, from: Stagger['from'], seed = 0): number {
  if (index < 0 || index >= count || count < 1) throw new Error('Stagger index must be within count.');
  if (from === 'end') return count - 1 - index;
  if (from === 'center') return Math.abs(index - (count - 1) / 2);
  if (from === 'edges') return Math.min(index, count - 1 - index);
  if (from === 'random') {
    const ordered = Array.from({ length: count }, (_, candidate) => candidate).sort((a, b) => seededRandom(seed, a) - seededRandom(seed, b) || a - b);
    return ordered.indexOf(index);
  }
  return index;
}

export function staggerDelay(stagger: Stagger): number {
  return staggerOrder(stagger.index, stagger.count, stagger.from, stagger.seed) * stagger.each;
}

export function staggerSchedule(count: number, options: Omit<Stagger, 'index' | 'count'> & { ease?: EasingName }): number[] {
  const raw = Array.from({ length: count }, (_, index) => staggerOrder(index, count, options.from, options.seed));
  const maximum = Math.max(1, ...raw);
  return raw.map((order) => ease(options.ease ?? 'linear', order / maximum) * maximum * options.each);
}

export function staggerWindows(count: number, options: Omit<Stagger, 'index' | 'count'> & { ease?: EasingName }): Array<{ index: number; delay: number; trailStart: number; trailEnd: number }> {
  return staggerSchedule(count, options).map((delay, index) => ({ index, delay, trailStart: delay, trailEnd: delay + options.trail }));
}
