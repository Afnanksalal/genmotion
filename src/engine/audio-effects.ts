import { audioEffectsSchema, type AudioEffect } from '../ir/audio-effects.js';

export function decibelsToGain(decibels: number): number {
  if (!Number.isFinite(decibels)) throw new Error('Decibel gain must be finite.');
  const gain = 10 ** (decibels / 20);
  if (!Number.isFinite(gain)) throw new Error('Decibel gain exceeds numeric range.');
  return gain;
}

/** Only typed native filters can enter the graph; projects cannot provide filter code. */
export function audioEffectFilters(input: AudioEffect[]): string[] {
  return audioEffectsSchema.parse(input).filter((effect) => !effect.bypass).map((effect) => {
    if (effect.type === 'highpass' || effect.type === 'lowpass') return `${effect.type}=frequency=${effect.frequency}:width_type=q:width=${effect.q}`;
    if (effect.type === 'equalizer') return `equalizer=frequency=${effect.frequency}:width_type=q:width=${effect.q}:gain=${effect.gainDb}`;
    if (effect.type === 'compressor') return `acompressor=threshold=${decibelsToGain(effect.thresholdDb)}:ratio=${effect.ratio}:attack=${effect.attackMs}:release=${effect.releaseMs}:knee=${effect.knee}:makeup=${decibelsToGain(effect.makeupDb)}`;
    if (effect.type === 'gate') return `agate=threshold=${decibelsToGain(effect.thresholdDb)}:range=${decibelsToGain(effect.rangeDb)}:ratio=${effect.ratio}:attack=${effect.attackMs}:release=${effect.releaseMs}`;
    if (effect.type === 'limiter') return `alimiter=limit=${decibelsToGain(effect.ceilingDb)}:attack=${effect.attackMs}:release=${effect.releaseMs}:level=0:latency=1`;
    throw new Error('Unsupported audio effect.');
  });
}

export function audioTempoFilters(rate: number, preservePitch = true): string[] {
  if (!Number.isFinite(rate) || rate < 0.0625 || rate > 16) throw new Error('Audio playback rate must be between 0.0625 and 16.');
  if (rate === 1) return [];
  if (!preservePitch) return [`asetrate=${48_000 * rate}`, 'aresample=48000'];
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 2) { filters.push('atempo=2'); remaining /= 2; }
  while (remaining < 0.5) { filters.push('atempo=0.5'); remaining *= 2; }
  if (remaining !== 1) filters.push(`atempo=${remaining}`);
  return filters;
}
