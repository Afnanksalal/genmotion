import { z } from 'zod';

const finite = z.number().finite();
const point = z.tuple([finite, finite]);
export const pathOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.enum(['union', 'intersection', 'subtract', 'exclude']), path: z.string().max(10_000_000) }).strict(),
  z.object({ op: z.literal('transform'), matrix: z.tuple([finite, finite, finite, finite, finite, finite]) }).strict(),
  z.object({ op: z.literal('stroke'), width: finite.positive(), join: z.enum(['miter', 'round', 'bevel']).default('miter'), cap: z.enum(['butt', 'round', 'square']).default('butt'), miterLimit: finite.positive().default(4) }).strict(),
  z.object({ op: z.literal('round'), radius: finite.nonnegative() }).strict(),
  z.object({ op: z.literal('trim'), start: finite.min(0).max(1), end: finite.min(0).max(1), complement: z.boolean().default(false) }).strict().refine((value) => value.end >= value.start, 'Trim end must not precede start'),
  z.object({ op: z.literal('dash'), on: finite.positive(), off: finite.positive(), phase: finite.default(0) }).strict(),
  z.object({ op: z.literal('simplify') }).strict(),
  z.object({ op: z.literal('reverse') }).strict(),
  z.object({ op: z.literal('cut'), at: finite.min(0).max(1) }).strict(),
  z.object({ op: z.literal('translate'), x: finite, y: finite }).strict(),
  z.object({ op: z.literal('scale'), x: finite, y: finite, origin: point.default([0, 0]) }).strict(),
  z.object({ op: z.literal('center'), x: finite.default(0), y: finite.default(0) }).strict(),
  z.object({ op: z.literal('subpaths'), indices: z.array(z.number().int().nonnegative()).max(100_000) }).strict(),
  z.object({ op: z.literal('subdivide'), divisions: z.number().int().min(1).max(256).default(2) }).strict(),
  z.object({ op: z.literal('warp'), corners: z.tuple([point, point, point, point]), divisions: z.number().int().min(1).max(256).default(16) }).strict(),
]);
export const pathOperationsSchema = z.array(pathOperationSchema).max(128);
export type PathOperation = z.infer<typeof pathOperationSchema>;
