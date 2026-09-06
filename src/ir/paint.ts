import { z } from 'zod';
import { parse } from 'culori';

const coordinate = z.number().finite().min(-8).max(8);
export const gradientSchema = z.object({
  type: z.enum(['linear', 'radial', 'conic']),
  angle: z.number().finite().default(0),
  center: z.tuple([coordinate, coordinate]).default([0.5, 0.5]),
  radius: z.number().finite().min(0.001).max(8).default(0.5),
  stops: z.array(z.object({ offset: z.number().finite().min(0).max(1), color: z.string().max(256).refine((value) => Boolean(parse(value)), 'Invalid gradient color') }).strict()).min(2).max(256),
}).strict().refine((gradient) => gradient.stops.every((stop, index) => index === 0 || stop.offset >= gradient.stops[index - 1]!.offset), 'Gradient stops must be ordered');
export type Gradient = z.infer<typeof gradientSchema>;
