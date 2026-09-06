import { z } from 'zod';

export const pathEditStateSchema = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/), modes: z.array(z.enum(['corner', 'smooth', 'symmetric'])).max(4096) }).strict();
export type PathEditState = z.infer<typeof pathEditStateSchema>;
const point = z.tuple([z.number().finite(), z.number().finite()]);
const address = { contour: z.number().int().nonnegative(), node: z.number().int().nonnegative() };
export const pathNodeEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('move-node'), ...address, point }).strict(),
  z.object({ op: z.literal('move-handle'), ...address, side: z.enum(['incoming', 'outgoing']), point }).strict(),
  z.object({ op: z.literal('set-mode'), ...address, mode: z.enum(['corner', 'smooth', 'symmetric']) }).strict(),
  z.object({ op: z.literal('split'), ...address, at: z.number().finite().gt(0).lt(1).default(.5) }).strict(),
  z.object({ op: z.literal('remove-node'), ...address }).strict(),
]);
export type PathNodeEdit = z.infer<typeof pathNodeEditSchema>;
