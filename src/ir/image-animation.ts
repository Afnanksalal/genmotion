import { z } from 'zod';
const common = {
  fps: z.number().finite().positive().max(1000).default(30),
  rate: z.number().finite().positive().max(1000).default(1),
  startFrame: z.number().int().min(0).max(10000000).default(0),
  reverse: z.boolean().default(false),
  loop: z.enum(['hold', 'repeat', 'ping-pong']).default('hold'),
};
export const imageAnimationSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('sequence'), frames: z.array(z.string().min(1).max(4096)).min(1).max(10000) }).strict(),
  z.object({ ...common, type: z.literal('sprite'), columns: z.number().int().min(1).max(1024), rows: z.number().int().min(1).max(1024), count: z.number().int().min(1).max(10000), margin: z.number().int().min(0).max(8192).default(0), gap: z.number().int().min(0).max(8192).default(0) }).strict(),
]).superRefine((animation, context) => {
  const count = animation.type === 'sequence' ? animation.frames.length : animation.count;
  if (animation.startFrame >= count) context.addIssue({ code: 'custom', path: ['startFrame'], message: 'Start frame must be inside the sequence' });
  if (animation.type === 'sprite' && animation.count > animation.columns * animation.rows) context.addIssue({ code: 'custom', path: ['count'], message: 'Sprite count exceeds grid capacity' });
});
export type ImageAnimation = z.infer<typeof imageAnimationSchema>;
