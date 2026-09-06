import { z } from 'zod';
import { animationTrackSchema, type AnimationTrack } from '../ir/schema.js';
import { evaluateTrack } from './animation.js';

export const trackAnalysisOptionsSchema = z.object({
  start: z.number().finite().optional(), end: z.number().finite().optional(),
  samples: z.number().int().min(2).max(4096).default(121),
  step: z.number().finite().min(1e-7).max(1).default(0.0001),
  seed: z.number().int().default(0),
}).strict();
export interface KinematicSample { time: number; value: number[] | null; velocity: number[] | null; acceleration: number[] | null; discontinuity: boolean }

/** Derivatives are in property units per second, independent of project FPS. */
export function analyzeTrack(track: AnimationTrack, options: z.input<typeof trackAnalysisOptionsSchema> = {}): { target: string; components: number; step: number; samples: KinematicSample[] } {
  track = animationTrackSchema.parse(track);
  const settings = trackAnalysisOptionsSchema.parse(options);
  const first = track.keyframes[0]!.at, last = track.keyframes.at(-1)!.at;
  const start = settings.start ?? first, end = settings.end ?? last;
  if (!(end > start) || !Number.isFinite(end - start)) throw new Error('Track analysis requires a finite increasing time range');
  const numeric = (time: number): number[] | null => {
    const value = evaluateTrack(track, time, settings.seed);
    const result = typeof value === 'number' ? [value] : Array.isArray(value) ? value : null;
    return result?.every(Number.isFinite) ? result : null;
  };
  const components = numeric(start)?.length ?? numeric(start + (end - start) / 2)?.length;
  if (!components) throw new Error('Velocity and acceleration require a numeric, point or rectangle track');
  const h = settings.step;
  const samples = Array.from({ length: settings.samples }, (_, index): KinematicSample => {
    const time = start + (end - start) * (index / (settings.samples - 1));
    const value = numeric(time), left = numeric(time - h), right = numeric(time + h);
    // At a key or cycle boundary a derivative is not generally defined. Never draw a spike as physical acceleration.
    const span = last - first;
    const cycle = span > 0 ? ((time - first) % span + span) % span : 0;
    const outside = time < first || time > last;
    const mode = time < first ? track.extrapolateLeft ?? track.extrapolate : track.extrapolateRight ?? track.extrapolate;
    const wrapped = outside && ['loop', 'wrap', 'ping-pong'].includes(mode);
    const iteration = span > 0 ? Math.floor((time - first) / span) : 0;
    const mappedTime = wrapped ? mode === 'ping-pong' && Math.abs(iteration) % 2 === 1 ? last - cycle : first + cycle : time;
    const discontinuity = time - h === time || time + h === time || track.keyframes.some((key) => Math.abs(mappedTime - key.at) <= h) || (wrapped && (cycle <= h || span - cycle <= h));
    if (discontinuity || !value || !left || !right || left.length !== components || right.length !== components) return { time, value, velocity: null, acceleration: null, discontinuity: true };
    const velocity = value.map((_, component) => (right[component]! - left[component]!) / (2 * h));
    const acceleration = value.map((item, component) => (right[component]! - 2 * item + left[component]!) / (h * h));
    if (![...velocity, ...acceleration].every(Number.isFinite)) return { time, value, velocity: null, acceleration: null, discontinuity: true };
    return { time, value, velocity, acceleration, discontinuity: false };
  });
  return { target: track.target, components, step: h, samples };
}
