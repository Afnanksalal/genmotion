import type { EasingName, ProceduralNoise, Stagger } from '../ir/schema.js';
import { staggerSchema } from '../ir/schema.js';
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

const randomOrders = new Map<string, number[]>();
export function staggerOrder(index: number, count: number, from: Stagger['from'], seed = 0): number {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index < 0 || index >= count || count < 1 || count > 100_000) throw new Error('Stagger index must be within count (an integer from 1 to 100000).');
  if (from === 'distance') throw new Error('Distance order requires positions; use staggerDelay or staggerSchedule.');
  if (from === 'end') return count - 1 - index;
  if (from === 'center') return Math.abs(index - (count - 1) / 2);
  if (from === 'edges') return Math.min(index, count - 1 - index);
  if (from === 'random') {
    const key = `${seed}:${count}`;
    let order = randomOrders.get(key);
    if (!order) {
      const ordered = Array.from({ length: count }, (_, candidate) => candidate).sort((a, b) => seededRandom(seed, a) - seededRandom(seed, b) || a - b);
      order = Array.from({ length: count }, () => 0);
      ordered.forEach((candidate, position) => { order![candidate] = position; });
      if (randomOrders.size >= 8) randomOrders.delete(randomOrders.keys().next().value!);
      randomOrders.set(key, order);
    }
    return order[index]!;
  }
  return index;
}

export function staggerDelay(stagger: Stagger): number {
  const position = stagger.position ?? [0, 0], origin = stagger.origin ?? [0, 0];
  const order = stagger.from === 'distance' ? Math.hypot(position[0] - origin[0], position[1] - origin[1]) / (stagger.distanceUnit ?? 100) : staggerOrder(stagger.index, stagger.count, stagger.from, stagger.seed);
  const delay = order * stagger.each + (stagger.delay ?? 0);
  if (!Number.isFinite(delay) || delay < 0) throw new Error('Stagger delay must be finite and nonnegative');
  return delay;
}

export function staggerSchedule(count: number, options: Omit<Stagger, 'index' | 'count'> & { ease?: EasingName; positions?: Array<[number, number]> }): number[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw new Error('Schedule count must be an integer from 1 to 100000');
  const { positions, ease: timing, ...settings } = options;
  staggerSchema.parse({ ...settings, count, index: 0 });
  if (options.from === 'distance' && positions?.length !== count) throw new Error('Distance schedules require one position per item');
  const raw = Array.from({ length: count }, (_, index) => options.from === 'distance' ? staggerDelay({ ...settings, index, count, each: 1, delay: 0, position: positions![index]! }) : staggerOrder(index, count, options.from, options.seed));
  const maximum = raw.reduce((max, value) => Math.max(max, value), 1);
  return raw.map((order) => {
    const delay = Math.max(0, ease(timing ?? 'linear', order / maximum)) * maximum * options.each + (options.delay ?? 0);
    if (!Number.isFinite(delay)) throw new Error('Stagger delay must be finite');
    return delay;
  });
}

export function staggerWindows(count: number, options: Omit<Stagger, 'index' | 'count'> & { ease?: EasingName; positions?: Array<[number, number]> }): Array<{ index: number; delay: number; trailStart: number; trailEnd: number }> {
  return staggerSchedule(count, options).map((delay, index) => {
    const trailEnd = delay + options.trail;
    if (!Number.isFinite(trailEnd)) throw new Error('Stagger trail end must be finite');
    return { index, delay, trailStart: delay, trailEnd };
  });
}
