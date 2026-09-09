import { createHash } from 'node:crypto';
import type { AudioAnalysis } from './audio-analysis.js';
import type { LoudnessMeasurement } from './loudness.js';
import { audioEffectSchema, type AudioEffect } from '../ir/audio-effects.js';
import { z } from 'zod';

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const db = (value: number): number => 20 * Math.log10(Math.max(1e-9, value));

export interface AudioFinding { kind: 'clipping' | 'imbalance' | 'noise' | 'silence' | 'peak' | 'loudness'; severity: 'info' | 'warning' | 'error'; measured: number; unit: 'dBFS' | 'dB' | 'seconds' | 'LUFS'; message: string }
export interface AudioDiagnosticReport { version: 1; sourceSha256: string; findings: AudioFinding[]; limitations: string[]; proposal: { gainDb: number; reviewRequired: true } }

export function diagnoseAudio(analysis: AudioAnalysis, loudness?: LoudnessMeasurement): AudioDiagnosticReport {
  const bins = analysis.waveform[0]?.values ?? [], left: number[] = [], right: number[] = [], peaks: number[] = [];
  for (let i = 0; i < bins.length; i += 6) { left.push(bins[i + 2] ?? 0); right.push(bins[i + 5] ?? 0); peaks.push(Math.max(Math.abs(bins[i] ?? 0), Math.abs(bins[i + 1] ?? 0), Math.abs(bins[i + 3] ?? 0), Math.abs(bins[i + 4] ?? 0))); }
  const rms = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
  const peak = Math.max(0, ...peaks), imbalance = Math.abs(db(rms(left)) - db(rms(right)));
  const ordered = [...left.map((value, i) => Math.max(value, right[i] ?? 0))].sort((a, b) => a - b);
  const noiseFloor = db(ordered[Math.floor(ordered.length * .2)] ?? 0), silenceSeconds = analysis.silence.reduce((sum, item) => sum + item.end - item.start, 0);
  const findings: AudioFinding[] = [
    { kind: 'peak', severity: peak > .9 ? 'warning' : 'info', measured: db(peak), unit: 'dBFS', message: 'Highest decoded sample peak.' },
    ...(peak >= 1 ? [{ kind: 'clipping', severity: 'error', measured: db(peak), unit: 'dBFS', message: 'Decoded samples reach or exceed full scale.' } as AudioFinding] : []),
    ...(imbalance >= 3 ? [{ kind: 'imbalance', severity: 'warning', measured: imbalance, unit: 'dB', message: 'Left/right RMS levels differ materially.' } as AudioFinding] : []),
    ...(noiseFloor > -45 ? [{ kind: 'noise', severity: 'warning', measured: noiseFloor, unit: 'dBFS', message: 'Quiet-bin RMS indicates a raised noise floor.' } as AudioFinding] : []),
    ...(silenceSeconds ? [{ kind: 'silence', severity: 'info', measured: silenceSeconds, unit: 'seconds', message: 'Detected silence above the configured minimum duration.' } as AudioFinding] : []),
    ...(loudness?.integratedLufs != null ? [{ kind: 'loudness', severity: loudness.integratedLufs > -10 || loudness.integratedLufs < -24 ? 'warning' : 'info', measured: loudness.integratedLufs, unit: 'LUFS', message: 'Integrated gated loudness measurement.' } as AudioFinding] : []),
  ];
  const gainDb = loudness?.integratedLufs == null ? 0 : Math.max(-12, Math.min(12, -16 - loudness.integratedLufs));
  return { version: 1, sourceSha256: analysis.sourceSha256, findings, proposal: { gainDb, reviewRequired: true }, limitations: ['Sample peaks are not inter-sample true peaks.', 'Noise detection estimates the quiet-bin floor and cannot identify every noise type.', 'Short or gated material may not yield representative integrated loudness.'] };
}

const featureEventSchema = z.object({ time: z.number().finite().nonnegative(), strength: z.number().finite().min(0), confidence: z.number().finite().min(0).max(1) }).strict();
const featureRangeSchema = z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().positive(), confidence: z.number().finite().min(0).max(1) }).strict().refine((item) => item.end > item.start, 'Audio feature range must increase');
export const frozenAudioFeaturesSchema = z.object({ version: z.literal(1), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), timeMap: z.object({ sourceStart: z.number().finite().nonnegative(), timelineStart: z.number().finite().nonnegative(), rate: z.number().finite().positive() }).strict(), beats: z.array(featureEventSchema).max(1_000_000), onsets: z.array(featureEventSchema).max(1_000_000), phrases: z.array(featureRangeSchema.extend({ energy: z.number().finite().min(0).max(1) })).max(100_000), silence: z.array(featureRangeSchema).max(100_000), corrections: z.array(z.object({ id: z.string().min(1), action: z.enum(['add', 'remove', 'move']), feature: z.enum(['beat', 'onset', 'phrase', 'silence']), from: z.number().finite().nonnegative().optional(), to: z.number().finite().nonnegative().optional(), note: z.string().max(1000).optional() }).strict()).max(100_000), analysisHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type FrozenAudioFeatures = z.infer<typeof frozenAudioFeaturesSchema>;
export function freezeAudioFeatures(analysis: AudioAnalysis, timeMap = { sourceStart: analysis.start, timelineStart: 0, rate: 1 }, corrections: FrozenAudioFeatures['corrections'] = []): FrozenAudioFeatures {
  if (!(timeMap.rate > 0)) throw new Error('Audio feature time-map rate must be positive.');
  const values = analysis.waveform[0]?.values ?? [], binSeconds = (analysis.waveform[0]?.samplesPerBin ?? 1) / analysis.sampleRate, phrases: FrozenAudioFeatures['phrases'] = [];
  for (let i = 0; i < values.length / 6; i += 25) { const end = Math.min(values.length / 6, i + 25), energies: number[] = []; for (let j = i; j < end; j += 1) energies.push(Math.max(values[j * 6 + 2] ?? 0, values[j * 6 + 5] ?? 0)); const energy = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length); phrases.push({ start: analysis.start + i * binSeconds, end: analysis.start + end * binSeconds, energy: Math.min(1, energy), confidence: .65 }); }
  const record = { version: 1 as const, sourceSha256: analysis.sourceSha256, timeMap, beats: analysis.tempo.beats.map(time => ({ time, strength: 1, confidence: analysis.tempo.confidence })), onsets: analysis.transients.map(item => ({ ...item, confidence: Math.max(.25, item.strength) })), phrases, silence: analysis.silence.map(item => ({ ...item, confidence: .9 })), corrections: structuredClone(corrections) };
  return { ...record, analysisHash: hash(record) };
}

export interface AudioFeatureMapping { id: string; feature: 'beat' | 'onset' | 'phrase-energy' | 'silence'; target: string; inputRange: [number, number]; outputRange: [number, number]; smoothingSeconds: number; latencySeconds: number; clamp: boolean }
export function evaluateAudioFeatureMapping(features: FrozenAudioFeatures, mapping: AudioFeatureMapping, timelineTime: number): number {
  if (!Number.isFinite(timelineTime) || mapping.smoothingSeconds < 0 || !Number.isFinite(mapping.latencySeconds)) throw new Error('Invalid audio feature mapping.');
  const sourceTime = features.timeMap.sourceStart + (timelineTime - features.timeMap.timelineStart - mapping.latencySeconds) * features.timeMap.rate;
  const radius = Math.max(.001, mapping.smoothingSeconds); let strength = 0;
  if (mapping.feature === 'beat' || mapping.feature === 'onset') { const events = mapping.feature === 'beat' ? features.beats : features.onsets; for (const event of events) strength = Math.max(strength, event.strength * Math.max(0, 1 - Math.abs(event.time - sourceTime) / radius)); }
  else if (mapping.feature === 'phrase-energy') strength = features.phrases.find(item => sourceTime >= item.start && sourceTime < item.end)?.energy ?? 0;
  else strength = features.silence.some(item => sourceTime >= item.start && sourceTime < item.end) ? 1 : 0;
  const [a, b] = mapping.inputRange, normalized = a === b ? 0 : (strength - a) / (b - a), amount = mapping.clamp ? Math.max(0, Math.min(1, normalized)) : normalized;
  return mapping.outputRange[0] + amount * (mapping.outputRange[1] - mapping.outputRange[0]);
}

export interface CarveProposal { version: 1; voiceSourceSha256: string; musicSourceSha256: string; analysisHashes: [string, string]; membershipHash: string; strength: number; bands: { frequency: number; voiceDb: number; musicDb: number; reductionDb: number }[]; envelope: { attackMs: number; releaseMs: number; maximumReductionDb: number }; limitations: string[] }
export function proposeSpectralCarve(voice: AudioAnalysis, music: AudioAnalysis, strength = .6, members = ['voice', 'music']): CarveProposal {
  if (strength < 0 || strength > 1) throw new Error('Carve strength must be between zero and one.');
  const frames = (analysis: AudioAnalysis) => Math.max(1, analysis.spectrum.values.length / analysis.spectrum.frequencies.length);
  const mean = (analysis: AudioAnalysis, band: number) => { let sum = 0; for (let frame = 0; frame < frames(analysis); frame += 1) sum += analysis.spectrum.values[frame * analysis.spectrum.frequencies.length + band] ?? -120; return sum / frames(analysis); };
  const count = Math.min(voice.spectrum.frequencies.length, music.spectrum.frequencies.length), bands = Array.from({ length: count }, (_, i) => { const voiceDb = mean(voice, i), musicDb = mean(music, i); return { frequency: voice.spectrum.frequencies[i]!, voiceDb, musicDb, reductionDb: Math.max(0, Math.min(9, (voiceDb - musicDb + 12) * .25 * strength)) }; }).filter(item => item.reductionDb >= .25);
  return { version: 1, voiceSourceSha256: voice.sourceSha256, musicSourceSha256: music.sourceSha256, analysisHashes: [hash(voice), hash(music)], membershipHash: hash([...members].sort()), strength, bands, envelope: { attackMs: 35, releaseMs: 220, maximumReductionDb: 9 * strength }, limitations: ['Spectral overlap is estimated from analysis-band averages.', 'The proposal must be auditioned and adjusted before delivery.'] };
}

export interface OwnedAudioEdit { owner: string; generation: number; sourceAnalysisHash: string; membershipHash: string; effects: AudioEffect[] }
export function recomputeOwnedAudioEdits(existing: OwnedAudioEdit[], proposal: CarveProposal, owner = 'genmotion:spectral-carve'): { edits: OwnedAudioEdit[]; stale: boolean } {
  const previous = existing.find(item => item.owner === owner), sourceAnalysisHash = hash(proposal.analysisHashes), stale = Boolean(previous && (previous.sourceAnalysisHash !== sourceAnalysisHash || previous.membershipHash !== proposal.membershipHash));
  const effect = audioEffectSchema.parse({ id: `${owner}:compressor`, type: 'compressor', thresholdDb: -24, ratio: 1 + proposal.strength * 5, attackMs: proposal.envelope.attackMs, releaseMs: proposal.envelope.releaseMs });
  return { stale, edits: [...existing.filter(item => item.owner !== owner), { owner, generation: (previous?.generation ?? 0) + 1, sourceAnalysisHash, membershipHash: proposal.membershipHash, effects: [effect] }] };
}

export interface AudioRepairJob { version: 1; id: string; preset: 'voice-clean' | 'level-dialogue' | 'delivery-safe'; sourceSha256: string; originalRetained: true; effects: AudioEffect[]; audition: { before: { bypass: true }; after: { bypass: false } }; acceptance: { metric: string; target: number; measured?: number; passed?: boolean }; reviewRequired: true }
export function createAudioRepairJob(sourceSha256: string, preset: AudioRepairJob['preset'], measured?: number): AudioRepairJob {
  const effects: Record<AudioRepairJob['preset'], AudioEffect[]> = {
    'voice-clean': [audioEffectSchema.parse({ id: 'repair-highpass', type: 'highpass', frequency: 80 }), audioEffectSchema.parse({ id: 'repair-compressor', type: 'compressor', thresholdDb: -18, ratio: 3, attackMs: 12, releaseMs: 180 })],
    'level-dialogue': [audioEffectSchema.parse({ id: 'repair-compressor', type: 'compressor', thresholdDb: -20, ratio: 2.5, attackMs: 15, releaseMs: 200 })],
    'delivery-safe': [audioEffectSchema.parse({ id: 'repair-limiter', type: 'limiter', ceilingDb: -1, attackMs: 5, releaseMs: 50 })],
  };
  const target = preset === 'delivery-safe' ? -1 : -16;
  return { version: 1, id: hash({ sourceSha256, preset }).slice(0, 16), preset, sourceSha256, originalRetained: true, effects: structuredClone(effects[preset]), audition: { before: { bypass: true }, after: { bypass: false } }, acceptance: { metric: preset === 'delivery-safe' ? 'sample-peak-dBFS' : 'integrated-LUFS', target, ...(measured === undefined ? {} : { measured, passed: measured <= target }) }, reviewRequired: true };
}
