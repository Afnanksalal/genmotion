import { seededRandom } from './procedural.js';

const smooth = (x: number): number => x * x * (3 - 2 * x);
/** Seek-safe interpolated lattice noise; no mutable random state. */
export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const sample = (a: number, b: number): number => seededRandom(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663));
  const top = sample(ix, iy) * (1 - fx) + sample(ix + 1, iy) * fx;
  const bottom = sample(ix, iy + 1) * (1 - fx) + sample(ix + 1, iy + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

export function fractalNoise(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0, weight = 1, weights = 0;
  for (let octave = 0; octave < Math.min(8, Math.max(1, Math.floor(octaves))); octave += 1) {
    sum += valueNoise(x, y, seed + octave * 1013) * weight; weights += weight;
    x *= 2; y *= 2; weight *= .5;
  }
  return sum / weights;
}

/** Exact hidden/visible endpoints, with a smooth threshold in between. */
export function revealCoverage(field: number, progress: number, feather: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  if (feather <= 0) return field <= progress ? 1 : 0;
  return smooth(Math.max(0, Math.min(1, (progress - field) / feather + .5)));
}
