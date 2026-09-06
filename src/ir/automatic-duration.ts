import { GenmotionError } from '../errors.js';
import type { Composition, Layer } from './schema.js';

export interface DurationContainer {
  id: string; duration: number; layers: Layer[];
  durationMode?: 'explicit' | 'content' | undefined;
  durationPadding?: number | undefined;
  parameterBindings?: { duration?: string | undefined } | undefined;
}

/** Calculate finite content bounds without guessing the lifetime of a held layer. */
export function automaticDuration(container: DurationContainer, definitions: ReadonlyMap<string, Composition>): number {
  if (container.durationMode !== 'content') return container.duration;
  if (container.parameterBindings?.duration) throw new GenmotionError('DURATION_MODE_CONFLICT', `Container ${container.id} cannot combine content duration with a duration parameter binding.`);
  let end = 0;
  for (const layer of container.layers) {
    let span = layer.duration;
    if (span === undefined && layer.type === 'caption') span = layer.cues.reduce((last, cue) => Math.max(last, cue.end), 0);
    if (span === undefined && layer.type === 'composition') {
      const definition = definitions.get(layer.compositionId);
      if (!definition) throw new GenmotionError('COMPOSITION_MISSING', `Cannot calculate duration without ${layer.compositionId}.`);
      if (layer.timeRemap !== undefined || (layer.freeze && layer.freeze.to === undefined) || (layer.loop && (layer.loopCount === undefined || layer.timeScale < 0))) continue;
      const length = definition.duration - (layer.trimBefore ?? 0) - (layer.trimAfter ?? 0);
      if (length <= 0) throw new GenmotionError('DURATION_TRIM_EMPTY', `Composition ${layer.id} has no source time after trimming.`);
      const distance = layer.timeScale > 0 ? length * (layer.loop ? layer.loopCount! : 1) - layer.timeOffset : layer.timeOffset;
      if (distance <= 0) continue;
      span = distance / Math.abs(layer.timeScale);
      if (layer.freeze?.to !== undefined) span = Math.max(span, layer.freeze.to);
    }
    if (span !== undefined && span > 0) end = Math.max(end, layer.start + span);
  }
  if (end <= 0) throw new GenmotionError('DURATION_UNBOUNDED', `Container ${container.id} needs a finite clip span before content duration can be calculated.`);
  const duration = end + (container.durationPadding ?? 0);
  if (!Number.isFinite(duration)) throw new GenmotionError('DURATION_OVERFLOW', `Container ${container.id} duration is not finite.`);
  return duration;
}
