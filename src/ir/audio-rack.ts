import { audioEffectSchema, audioEffectsSchema, type AudioEffect } from './audio-effects.js';

export interface AudioRackClipboard { version: 1; effects: AudioEffect[] }
export const audioRackCapabilities = {
  version: 1 as const,
  ordered: true,
  maximumEffects: 32,
  automation: { supported: false, reason: 'Effect parameters are static in audio-rack version 1.' },
  types: ['highpass', 'lowpass', 'equalizer', 'compressor', 'gate', 'limiter', 'low-shelf', 'high-shelf', 'saturation', 'delay', 'reverb', 'chorus', 'phaser', 'bitcrush'] as const,
};

export const audioRackPresets = {
  'voice-clean': audioEffectsSchema.parse([{ id: 'voice-highpass', type: 'highpass', frequency: 80 }, { id: 'voice-compressor', type: 'compressor', thresholdDb: -18, ratio: 3, attackMs: 12, releaseMs: 180 }]),
  'delivery-safe': audioEffectsSchema.parse([{ id: 'delivery-limiter', type: 'limiter', ceilingDb: -1, attackMs: 5, releaseMs: 50 }]),
} as const;

export function copyAudioRack(effects: AudioEffect[]): AudioRackClipboard { return { version: 1, effects: structuredClone(audioEffectsSchema.parse(effects)) }; }
export function pasteAudioRack(clipboard: AudioRackClipboard, existing: AudioEffect[] = []): AudioEffect[] {
  if (clipboard.version !== 1) throw new Error('Unsupported audio rack clipboard version.');
  const used = new Set(existing.map(effect => effect.id));
  const additions = clipboard.effects.map(effect => { let id = effect.id, suffix = 2; while (used.has(id)) id = `${effect.id}-${suffix++}`; used.add(id); return audioEffectSchema.parse({ ...structuredClone(effect), id }); });
  return audioEffectsSchema.parse([...existing, ...additions]);
}
export function duplicateAudioEffect(effects: AudioEffect[], effectId: string, duplicateId: string): AudioEffect[] {
  const index = effects.findIndex(effect => effect.id === effectId); if (index < 0) throw new Error(`Audio effect not found: ${effectId}`);
  const result = structuredClone(effects); result.splice(index + 1, 0, audioEffectSchema.parse({ ...result[index]!, id: duplicateId }));
  return audioEffectsSchema.parse(result);
}
export function audioRackPreset(id: keyof typeof audioRackPresets): AudioEffect[] { return structuredClone(audioRackPresets[id]); }
