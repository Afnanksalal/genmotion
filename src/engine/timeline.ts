import type { AnimatedNumber, GenmotionProject, Scene } from '../ir/schema.js';
import { ease } from './easing.js';

export function evaluateNumber(value: AnimatedNumber, time: number): number {
  if (typeof value === 'number') return value;
  const frames = [...value.keyframes].sort((a, b) => a.at - b.at);
  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last) return 0;
  if (time <= first.at) return first.value;
  if (time >= last.at) return last.value;
  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index];
    const to = frames[index + 1];
    if (!from || !to || time > to.at) continue;
    const progress = ease(to.ease, (time - from.at) / (to.at - from.at));
    return from.value + (to.value - from.value) * progress;
  }
  return last.value;
}

export interface ActiveScene {
  scene: Scene;
  index: number;
  localTime: number;
  globalStart: number;
}

export function locateScene(project: GenmotionProject, time: number): ActiveScene {
  let cursor = 0;
  for (let index = 0; index < project.scenes.length; index += 1) {
    const scene = project.scenes[index];
    if (!scene) continue;
    const end = cursor + scene.duration;
    if (time < end || index === project.scenes.length - 1) {
      return { scene, index, localTime: Math.max(0, Math.min(scene.duration, time - cursor)), globalStart: cursor };
    }
    cursor = end;
  }
  throw new Error('A valid project must contain at least one scene.');
}

export function layerIsActive(start: number, duration: number | undefined, sceneDuration: number, time: number): boolean {
  const end = start + (duration ?? sceneDuration - start);
  return time >= start && time < end;
}

export function deterministicNoise(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}
