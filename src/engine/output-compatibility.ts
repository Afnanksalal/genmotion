import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { resolveAlphaOutput, alphaModeSchema } from './alpha-output.js';

export const outputCompatibilityMatrix = {
  h264: { containers: ['mp4', 'mov'], pixelFormats: ['yuv420p'], alpha: false, color: ['bt709-sdr'], audio: ['aac'], backends: ['software', 'hardware'] },
  h265: { containers: ['mp4', 'mov'], pixelFormats: ['yuv420p10le'], alpha: false, color: ['bt709-sdr'], audio: ['aac'], backends: ['software'] },
  vp9: { containers: ['webm'], pixelFormats: ['yuv420p', 'yuva420p'], alpha: true, color: ['bt709-sdr'], audio: ['opus'], backends: ['software'] },
  prores: { containers: ['mov'], pixelFormats: ['yuv422p10le', 'yuva444p10le'], alpha: true, color: ['bt709-sdr'], audio: ['pcm_s24le'], backends: ['software'] },
} as const;

export const outputCompatibilityInputSchema = z.object({
  codec: z.enum(['h264', 'h265', 'vp9', 'prores']), filename: z.string().min(1), alphaMode: alphaModeSchema.default('auto'), alphaBackground: z.string().optional(),
  width: z.number().int().min(2), height: z.number().int().min(2), hardwareAcceleration: z.boolean().default(false),
}).strict();

export function validateCompatibilityContainer(filename: string, codec: keyof typeof outputCompatibilityMatrix): void {
  const extension = filename.split('.').at(-1)?.toLowerCase() ?? '';
  const supported = outputCompatibilityMatrix[codec].containers as readonly string[];
  if (!supported.includes(extension)) throw new GenmotionError('INVALID_OUTPUT_CONTAINER', `${codec} output requires ${supported.map((item) => `.${item}`).join(' or ')}.`, { output: filename, codec });
}

export function resolveOutputCompatibility(input: z.input<typeof outputCompatibilityInputSchema>) {
  const options = outputCompatibilityInputSchema.parse(input), contract = outputCompatibilityMatrix[options.codec];
  if (options.width % 2 || options.height % 2) throw new GenmotionError('INVALID_RENDER_RESOLUTION', 'Encoded output dimensions must be even.');
  validateCompatibilityContainer(options.filename, options.codec);
  const alpha = resolveAlphaOutput(options.codec, options.alphaMode, options.alphaBackground);
  if (options.hardwareAcceleration && !(contract.backends as readonly string[]).includes('hardware')) throw new GenmotionError('HARDWARE_CODEC_UNSUPPORTED', `Hardware acceleration is unavailable for ${options.codec}; choose software explicitly.`);
  const pixelFormat = options.codec === 'vp9' ? alpha.mode === 'preserve' ? 'yuva420p' : 'yuv420p' : options.codec === 'prores' ? alpha.mode === 'preserve' ? 'yuva444p10le' : 'yuv422p10le' : options.codec === 'h265' ? 'yuv420p10le' : 'yuv420p';
  return { compatible: true as const, codec: options.codec, container: options.filename.split('.').at(-1)!.toLowerCase(), pixelFormat, alpha, color: 'bt709-sdr' as const, audioCodec: contract.audio[0], backend: options.hardwareAcceleration ? 'hardware' as const : 'software' as const, fallback: null };
}
