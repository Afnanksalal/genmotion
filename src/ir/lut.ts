import { z } from 'zod';
const component = z.number().finite().min(-1e37).max(1e37);
const rgb = z.tuple([component, component, component]);
export const lookupTableSchema = z.object({
  version: z.literal(1), kind: z.enum(['1d', '3d']), size: z.number().int().min(2).max(65536),
  title: z.string().max(1024).optional(), domainMin: rgb.default([0, 0, 0]), domainMax: rgb.default([1, 1, 1]),
  data: z.array(component).max(65 ** 3 * 3).optional(),
  interpolation: z.enum(['trilinear', 'tetrahedral']).default('tetrahedral'),
  inputColorSpace: z.enum(['srgb', 'linear-srgb']), outputColorSpace: z.enum(['srgb', 'linear-srgb']),
  source: z.object({ path: z.string().min(1).max(2048), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
}).strict().superRefine((lut, context) => {
  if (lut.kind === '3d' && lut.size > 65) context.addIssue({ code: 'custom', path: ['size'], message: 'Native 3D LUTs are limited to 65 samples per axis' });
  if (!lut.data && !lut.source) context.addIssue({ code: 'custom', message: 'A LUT needs embedded data or a frozen source' });
  if (lut.data && lut.data.length !== (lut.kind === '1d' ? lut.size : lut.size ** 3) * 3) context.addIssue({ code: 'custom', path: ['data'], message: 'LUT data length does not match its dimensions' });
  if (lut.domainMin.some((value, channel) => value >= lut.domainMax[channel]!)) context.addIssue({ code: 'custom', path: ['domainMax'], message: 'Every LUT domain maximum must exceed its minimum' });
});
export type LookupTable = z.infer<typeof lookupTableSchema>;
