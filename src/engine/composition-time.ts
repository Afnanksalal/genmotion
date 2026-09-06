import type { Composition, CompositionLayer } from '../ir/schema.js';
import { evaluateNumber } from './timeline.js';

/** Pure seek-safe mapping; the same source time is produced in preview and export. */
export function compositionTime(layer: CompositionLayer, composition: Composition, localTime: number, projectFps: number, options: { sampleRate?: number; quantize?: boolean } = {}): number {
  if (!Number.isFinite(localTime)) throw new Error('Composition sample time must be finite.');
  const fps = composition.fps ?? projectFps;
  const first = layer.trimBefore ?? 0;
  const end = composition.duration - (layer.trimAfter ?? 0);
  if (first >= end) throw new Error(`Composition ${composition.id} trims remove the entire source.`);
  const length = end - first;
  // Endpoints are exclusive in native layer evaluation. Hold the last source frame.
  const boundaryRate = options.sampleRate ?? fps;
  if (!Number.isFinite(boundaryRate) || boundaryRate <= 0) throw new Error('Composition sampling rate must be positive and finite');
  const last = Math.max(first, (Math.ceil(end * boundaryRate) - 1) / boundaryRate);
  const freeze = layer.freeze;
  if (freeze && freeze.frame >= Math.ceil(composition.duration * fps)) throw new Error(`Composition ${composition.id} freeze frame is outside its source.`);
  if (freeze && localTime >= (freeze.from ?? 0) && (freeze.to === undefined || localTime < freeze.to)) return Math.max(first, Math.min(last, freeze.frame / fps));
  let mapped = layer.timeRemap === undefined ? localTime * layer.timeScale + layer.timeOffset : evaluateNumber(layer.timeRemap, localTime);
  if (!Number.isFinite(mapped)) throw new Error(`Composition ${composition.id} time mapping must be finite.`);
  if (layer.loop) {
    const limit = layer.loopCount;
    if (limit !== undefined && mapped >= length * limit) mapped = layer.loopMode === 'ping-pong' && limit % 2 === 0 ? 0 : last - first;
    else {
      const cycle = Math.floor(mapped / length);
      mapped = ((mapped % length) + length) % length;
      if (layer.loopMode === 'ping-pong' && Math.abs(cycle % 2) === 1) mapped = length - mapped;
    }
  }
  const sourceTime = Math.max(first, Math.min(last, first + mapped));
  return options.quantize === false || composition.fps === undefined ? sourceTime : Math.max(first, Math.floor((sourceTime + 1e-10) * fps) / fps);
}
