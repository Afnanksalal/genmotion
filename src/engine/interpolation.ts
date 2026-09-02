import { formatRgb, interpolate } from 'culori';
import type { AnimationKeyframe, AnimationValue } from '../ir/schema.js';
import { ease } from './easing.js';

export type InterpolationMode = 'linear' | 'shortest-angle' | 'discrete';

function isTuple(value: AnimationValue): value is [number, number] | [number, number, number, number] {
  return Array.isArray(value);
}

export function interpolateAnimationValue(from: AnimationValue, to: AnimationValue, progress: number, mode: InterpolationMode = 'linear'): AnimationValue {
  const bounded = Math.max(0, Math.min(1, progress));
  if (mode === 'discrete') return bounded < 1 ? from : to;
  if (typeof from === 'number' && typeof to === 'number') {
    let delta = to - from;
    if (mode === 'shortest-angle') delta = ((delta + 540) % 360) - 180;
    return from + delta * progress;
  }
  if (typeof from === 'string' && typeof to === 'string') {
    try { return formatRgb(interpolate([from, to], 'oklab')(bounded)); }
    catch { return bounded < 1 ? from : to; }
  }
  if (isTuple(from) && isTuple(to) && from.length === to.length) {
    return from.map((value, index) => value + ((to[index] ?? value) - value) * progress) as AnimationValue;
  }
  return bounded < 1 ? from : to;
}

export function evaluateAnimationFrames(frames: AnimationKeyframe[], time: number, mode: InterpolationMode = 'linear'): AnimationValue {
  const ordered = [...frames].sort((left, right) => left.at - right.at);
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return 0;
  if (time <= first.at) return first.value;
  if (time >= last.at) return last.value;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index];
    const to = ordered[index + 1];
    if (!from || !to || time > to.at) continue;
    if (from.hold) return from.value;
    const progress = ease(to.ease, (time - from.at) / (to.at - from.at));
    return interpolateAnimationValue(from.value, to.value, progress, mode);
  }
  return last.value;
}

export function extendAnimationFrames(frames: AnimationKeyframe[], time: number, mode: InterpolationMode = 'linear'): AnimationValue {
  const ordered = [...frames].sort((left, right) => left.at - right.at);
  const left = time < (ordered[0]?.at ?? 0);
  const from = left ? ordered[0] : ordered.at(-2);
  const to = left ? ordered[1] : ordered.at(-1);
  if (!from || !to || from.hold || to.at === from.at) return (left ? from : to)?.value ?? 0;
  return interpolateAnimationValue(from.value, to.value, (time - from.at) / (to.at - from.at), mode);
}
