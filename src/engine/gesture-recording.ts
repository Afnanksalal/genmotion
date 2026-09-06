import { createHash } from 'node:crypto';
import { gestureRecordingSchema, type GestureRecording } from '../ir/gesture-recording.js';
import { animationTrackSchema } from '../ir/schema.js';
import { GenmotionError } from '../errors.js';

/** Uniform sample averaging within a time window, retaining both original endpoints. */
export function compileGestureRecording(input: GestureRecording) {
  const recording = gestureRecordingSchema.parse(input), samples = recording.samples;
  let left = 0, right = 0, sumX = 0, sumY = 0;
  const smoothed = samples.map((sample, index) => {
    if (recording.smoothingWindow === 0) return { ...sample };
    const radius = recording.smoothingWindow / 2;
    while (right < samples.length && samples[right]!.at <= sample.at + radius) { sumX += samples[right]!.x; sumY += samples[right]!.y; right++; }
    while (left < right && samples[left]!.at < sample.at - radius) { sumX -= samples[left]!.x; sumY -= samples[left]!.y; left++; }
    if (index === 0 || index === samples.length - 1) return { ...sample };
    return { at: sample.at, x: sumX / (right - left), y: sumY / (right - left) };
  });
  // Error is measured at the original timestamp, preserving pauses and speed
  // changes which a purely geometric polyline simplifier would discard.
  const keep = new Set([0, smoothed.length - 1]), pending: Array<[number, number]> = [[0, smoothed.length - 1]];
  let comparisons = 0, reductionLimited = false;
  while (pending.length) {
    const [first, last] = pending.pop()!, a = smoothed[first]!, b = smoothed[last]!;
    let worst = -1, error = recording.tolerance;
    for (let index = first + 1; index < last; index++) {
      if (++comparisons > 1_000_000) { reductionLimited = true; break; }
      const point = smoothed[index]!, progress = (point.at - a.at) / (b.at - a.at);
      const distance = Math.hypot(point.x - (a.x + (b.x - a.x) * progress), point.y - (a.y + (b.y - a.y) * progress));
      if (distance > error) { error = distance; worst = index; }
    }
    if (reductionLimited) break;
    if (worst !== -1) { keep.add(worst); pending.push([first, worst], [worst, last]); }
  }
  const retained = reductionLimited ? smoothed : [...keep].sort((a, b) => a - b).map(index => smoothed[index]!);
  for (let index = 1; index < retained.length; index++) if (recording.start + retained[index]!.at <= recording.start + retained[index - 1]!.at) throw new GenmotionError('GESTURE_TIME_PRECISION', 'The gesture start is too large to preserve its sample timing.');
  const trackIds: [string, string] = [`${recording.id}-x`, `${recording.id}-y`];
  const tracks = (['x', 'y'] as const).map((axis, index) => animationTrackSchema.parse({
    id: trackIds[index], target: `transform.${axis}`, operation: 'replace', interpolation: 'linear', extrapolate: 'clamp',
    keyframes: retained.map(sample => ({ at: recording.start + sample.at, value: sample[axis], ease: 'linear' })),
  }));
  return { tracks, points: retained, provenance: { recording, sourceHash: createHash('sha256').update(JSON.stringify(recording)).digest('hex'), trackIds, retainedSamples: retained.length, reductionLimited },
    reduction: { original: samples.length, retained: retained.length, reductionLimited, tolerance: recording.tolerance, errorReference: 'smoothed-time-samples' as const } };
}
