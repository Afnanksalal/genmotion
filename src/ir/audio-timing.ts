import { z } from 'zod';
import type { AudioEffect } from './audio-effects.js';
import type { AudioTrack, GenmotionProject } from './schema.js';

export const audioTimingOptionsSchema = z.object({ floorDb: z.number().finite().min(-120).max(-20).default(-60), maximumTailSeconds: z.number().finite().positive().max(3600).default(300) }).strict();
export type AudioTimingOptions = z.input<typeof audioTimingOptionsSchema>;
export interface AudioEffectTiming { id: string; type: AudioEffect['type']; latencySeconds: number; prerollSeconds: number; tailSeconds: number; latencyCompensated: boolean; method: string }

const decayTail = (delaySeconds: number, feedback: number, floorDb: number, maximum: number): number => feedback <= 0 ? delaySeconds : Math.min(maximum, delaySeconds * Math.max(1, Math.ceil(floorDb / (20 * Math.log10(feedback)))));

export function audioEffectTiming(effect: AudioEffect, input: AudioTimingOptions = {}): AudioEffectTiming {
  const options = audioTimingOptionsSchema.parse(input);
  let latencySeconds = 0, prerollSeconds = 0, tailSeconds = 0, latencyCompensated = false, method = 'instantaneous';
  if (effect.type === 'compressor' || effect.type === 'gate') { prerollSeconds = effect.attackMs / 1000; method = 'envelope-state'; }
  else if (effect.type === 'limiter') { latencySeconds = effect.attackMs / 1000; prerollSeconds = latencySeconds; latencyCompensated = true; method = 'lookahead-compensated'; }
  else if (effect.type === 'delay') { tailSeconds = decayTail(effect.delayMs / 1000, effect.feedback, options.floorDb, options.maximumTailSeconds); method = 'feedback-decay'; }
  else if (effect.type === 'reverb') { const delay = (35 + effect.roomSize * 165) * 2.91 / 1000, feedback = Math.min(.99, .15 + effect.roomSize * .55) * (1 - effect.damping * .5); tailSeconds = decayTail(delay, feedback, options.floorDb, options.maximumTailSeconds); method = 'multi-tap-decay'; }
  else if (effect.type === 'chorus') { tailSeconds = (effect.delayMs + effect.depthMs) / 1000; prerollSeconds = tailSeconds; method = 'modulated-delay'; }
  else if (effect.type === 'phaser') { tailSeconds = decayTail(effect.delayMs / 1000, effect.decay, options.floorDb, options.maximumTailSeconds); prerollSeconds = effect.delayMs / 1000; method = 'all-pass-decay'; }
  return { id: effect.id, type: effect.type, latencySeconds, prerollSeconds, tailSeconds, latencyCompensated, method };
}

export function audioRackTiming(effects: AudioEffect[] = [], input: AudioTimingOptions = {}) {
  const active = effects.filter(effect => !effect.bypass).map(effect => audioEffectTiming(effect, input));
  return { version: 1 as const, effects: active, latencySeconds: active.reduce((sum, effect) => sum + (effect.latencyCompensated ? 0 : effect.latencySeconds), 0), compensatedLatencySeconds: active.reduce((sum, effect) => sum + (effect.latencyCompensated ? effect.latencySeconds : 0), 0), prerollSeconds: active.reduce((maximum, effect) => Math.max(maximum, effect.prerollSeconds), 0), tailSeconds: active.reduce((sum, effect) => sum + effect.tailSeconds, 0), floorDb: audioTimingOptionsSchema.parse(input).floorDb };
}

export function inspectProjectAudioTiming(project: GenmotionProject, input: AudioTimingOptions = {}) {
  const duration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const tracks = project.audio.map((track: AudioTrack) => {
    const rack = audioRackTiming(track.effects, input), audibleEnd = Math.min(duration, track.start + (track.duration ?? duration - track.start)), tailEnd = audibleEnd + rack.tailSeconds;
    return { id: track.id, start: track.start, audibleEnd, tailEnd, retainedTailSeconds: Math.max(0, Math.min(duration, tailEnd) - audibleEnd), truncatedTailSeconds: Math.max(0, tailEnd - duration), rack };
  });
  return { version: 1 as const, duration, tracks, complete: tracks.every(track => track.truncatedTailSeconds === 0), limitations: ['Tail duration is a deterministic -60 dB decay estimate by default; nonlinear program material can decay differently.', 'The processed preview and export use the same graph and project-duration boundary.'] };
}
