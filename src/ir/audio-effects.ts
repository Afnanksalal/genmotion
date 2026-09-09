import { z } from 'zod';
const number = z.number().finite();
const common = { id: z.string().min(1), bypass: z.boolean().optional() };
export const audioEffectSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.enum(['highpass', 'lowpass']), frequency: number.min(20).max(20_000), q: number.min(0.1).max(20).default(0.707) }).strict(),
  z.object({ ...common, type: z.literal('equalizer'), frequency: number.min(20).max(20_000), q: number.min(0.1).max(20).default(1), gainDb: number.min(-24).max(24) }).strict(),
  z.object({ ...common, type: z.literal('compressor'), thresholdDb: number.min(-60).max(0).default(-18), ratio: number.min(1).max(20).default(4), attackMs: number.min(0.01).max(2_000).default(20), releaseMs: number.min(0.01).max(9_000).default(250), knee: number.min(1).max(8).default(2.82843), makeupDb: number.min(0).max(36).default(0) }).strict(),
  z.object({ ...common, type: z.literal('gate'), thresholdDb: number.min(-96).max(0).default(-40), rangeDb: number.min(-96).max(0).default(-60), ratio: number.min(1).max(9_000).default(4), attackMs: number.min(0.01).max(9_000).default(10), releaseMs: number.min(0.01).max(9_000).default(150) }).strict(),
  z.object({ ...common, type: z.literal('limiter'), ceilingDb: number.min(-24).max(0).default(-1), attackMs: number.min(0.1).max(80).default(5), releaseMs: number.min(1).max(8_000).default(50) }).strict(),
  z.object({ ...common, type: z.enum(['low-shelf', 'high-shelf']), frequency: number.min(20).max(20_000), gainDb: number.min(-24).max(24), q: number.min(0.1).max(20).default(.707) }).strict(),
  z.object({ ...common, type: z.literal('saturation'), drive: number.min(1).max(16).default(2), output: number.min(.0625).max(16).default(.5), curve: z.enum(['tanh', 'atan', 'cubic', 'exp', 'alg', 'quintic', 'sin', 'erf']).default('tanh'), oversample: z.number().int().min(1).max(64).default(4) }).strict(),
  z.object({ ...common, type: z.literal('delay'), delayMs: number.min(1).max(90_000).default(250), feedback: number.min(0).max(.99).default(.35), wet: number.min(0).max(1).default(.5) }).strict(),
  z.object({ ...common, type: z.literal('reverb'), roomSize: number.min(0).max(1).default(.5), damping: number.min(0).max(1).default(.35), wet: number.min(0).max(1).default(.3) }).strict(),
  z.object({ ...common, type: z.literal('chorus'), delayMs: number.min(1).max(100).default(40), depthMs: number.min(0).max(10).default(2), speedHz: number.min(.1).max(5).default(.8), feedback: number.min(0).max(.99).default(.4), wet: number.min(0).max(1).default(.4) }).strict(),
  z.object({ ...common, type: z.literal('phaser'), delayMs: number.min(0).max(5).default(3), decay: number.min(0).max(.99).default(.4), speedHz: number.min(.1).max(2).default(.5), wet: number.min(0).max(1).default(.5), waveform: z.enum(['triangular', 'sinusoidal']).default('triangular') }).strict(),
  z.object({ ...common, type: z.literal('bitcrush'), bits: number.min(1).max(64).default(8), sampleReduction: number.min(1).max(250).default(1), mix: number.min(0).max(1).default(1), antialias: number.min(0).max(1).default(.5) }).strict(),
]);
export const audioEffectsSchema = z.array(audioEffectSchema).max(32).refine((effects) => new Set(effects.map((effect) => effect.id)).size === effects.length, 'Audio effect IDs must be unique within a track');
export type AudioEffect = z.infer<typeof audioEffectSchema>;
export const audioNormalizationSchema = z.object({
  integratedLufs: number.min(-70).max(-5).default(-16),
  truePeakDbtp: number.min(-9).max(0).default(-1),
  rangeLu: number.min(1).max(50).default(11),
}).strict();
export type AudioNormalization = z.infer<typeof audioNormalizationSchema>;
