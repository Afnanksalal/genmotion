import type { GenmotionProject } from './schema.js';

export interface ReviewSamplePlan {
  times: number[];
  points: ReviewSamplePoint[];
  omittedTimes: number;
  totalCandidates: number;
  coverage: 'complete' | 'truncated';
  transientWindows: Array<{ start: number; end: number; kind: 'transition-in' | 'transition-out'; sceneId: string }>;
}

export interface ReviewSamplePoint { time: number; phase: 'boundary' | 'interior' | 'transient'; reasons: string[] }
export interface ReviewObservationClassification {
  classification: 'persistent-defect' | 'intentional-transient' | 'isolated-observation';
  times: number[];
  transientWindows: ReviewSamplePlan['transientWindows'];
  explanation: string;
}

/** Classifies repeated sampled observations without treating authored entrance/exit frames as persistent defects. */
export function classifyReviewObservation(plan: ReviewSamplePlan, observedTimes: number[]): ReviewObservationClassification {
  const times = [...new Set(observedTimes)].sort((left, right) => left - right);
  if (!times.length || times.some(time => !Number.isFinite(time))) throw new Error('Review observations require one or more finite timestamps.');
  const windows = plan.transientWindows.filter(window => times.some(time => time >= window.start && time <= window.end));
  const allTransient = times.every(time => plan.transientWindows.some(window => time >= window.start && time <= window.end));
  const persistent = times.length > 1 && times.some(time => plan.points.some(point => point.phase === 'interior' && Math.abs(point.time - time) < 1e-9));
  if (allTransient) return { classification: 'intentional-transient', times, transientWindows: windows, explanation: 'Every observation falls inside an authored transition entrance or exit window.' };
  if (persistent) return { classification: 'persistent-defect', times, transientWindows: windows, explanation: 'The observation repeats and includes a stable interior review sample.' };
  return { classification: 'isolated-observation', times, transientWindows: windows, explanation: 'The observation is isolated or lacks stable interior confirmation.' };
}

/** Deterministic native review sampling: boundaries, keyframes and interior holds. */
export function reviewSamplePlan(project: GenmotionProject, maximumSamples = 240): ReviewSamplePlan {
  if (!Number.isInteger(maximumSamples) || maximumSamples < 2 || maximumSamples > 10_000) throw new Error('Review sampling limit must be an integer from 2 through 10000.');
  const candidates = new Map<number, Set<string>>();
  const transientWindows: ReviewSamplePlan['transientWindows'] = [];
  const add = (time: number, reason: string): void => { const reasons = candidates.get(time) ?? new Set<string>(); reasons.add(reason); candidates.set(time, reasons); };
  let offset = 0;
  for (const scene of project.scenes) {
    add(offset, `scene:${scene.id}:start`); add(offset + scene.duration, `scene:${scene.id}:end`);
    if (scene.transitionIn?.duration) { const end = Math.min(offset + scene.duration, offset + scene.transitionIn.duration); add(offset, `transition:${scene.id}:in:start`); add(end, `transition:${scene.id}:in:end`); transientWindows.push({ start: offset, end, kind: 'transition-in', sceneId: scene.id }); }
    if (scene.transitionOut?.duration) { const start = Math.max(offset, offset + scene.duration - scene.transitionOut.duration); add(start, `transition:${scene.id}:out:start`); add(offset + scene.duration, `transition:${scene.id}:out:end`); transientWindows.push({ start, end: offset + scene.duration, kind: 'transition-out', sceneId: scene.id }); }
    for (const layer of scene.layers) {
      const end = Math.min(scene.duration, layer.start + (layer.duration ?? scene.duration - layer.start));
      add(offset + layer.start, `layer:${layer.id}:start`); add(offset + end, `layer:${layer.id}:end`);
      for (const track of layer.tracks) for (const keyframe of track.keyframes) if (layer.start + keyframe.at <= end) add(offset + layer.start + keyframe.at, `track:${layer.id}:${track.id}:keyframe`);
    }
    offset += scene.duration;
  }
  const sorted = [...candidates.keys()].sort((left, right) => left - right);
  const interiors = sorted.slice(1).flatMap((time, index) => {
    const previous = sorted[index]!;
    return time - previous > 1 / project.fps ? [(previous + time) / 2] : [];
  });
  for (const time of interiors) add(time, 'interior');
  const all = [...candidates.keys()].sort((left, right) => left - right);
  const point = (time: number): ReviewSamplePoint => { const reasons = [...candidates.get(time)!].sort(); const transient = reasons.some((reason) => reason.includes('transition:') || /layer:.*:start/.test(reason)); return { time, phase: reasons.includes('interior') ? 'interior' : transient ? 'transient' : 'boundary', reasons }; };
  if (all.length <= maximumSamples) return { times: all, points: all.map(point), omittedTimes: 0, totalCandidates: all.length, coverage: 'complete', transientWindows };
  const chosen = Array.from({ length: maximumSamples }, (_, index) => all[Math.round(index * (all.length - 1) / (maximumSamples - 1))]!);
  const times = [...new Set(chosen)];
  return { times, points: times.map(point), omittedTimes: all.length - times.length, totalCandidates: all.length, coverage: 'truncated', transientWindows };
}
