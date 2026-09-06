import { z } from 'zod';

export const gestureRecordingSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  origin: z.enum(['user', 'agent']),
  coordinateSpace: z.literal('layer-parent'),
  start: z.number().finite().nonnegative(),
  smoothingWindow: z.number().finite().min(0).max(2).default(0),
  tolerance: z.number().finite().min(0).max(1000).default(0.5),
  samples: z.array(z.object({ at: z.number().finite().nonnegative().max(3600), x: z.number().finite().min(-1e9).max(1e9), y: z.number().finite().min(-1e9).max(1e9) }).strict()).min(2).max(10_000),
}).strict().superRefine((recording, context) => {
  for (let index = 1; index < recording.samples.length; index++) if (recording.samples[index]!.at <= recording.samples[index - 1]!.at) context.addIssue({ code: 'custom', path: ['samples', index, 'at'], message: 'Gesture sample times must strictly increase.' });
  if (recording.samples[0]!.at !== 0) context.addIssue({ code: 'custom', path: ['samples', 0, 'at'], message: 'Gesture samples start at zero; use start for the layer-local offset.' });
});
export type GestureRecording = z.infer<typeof gestureRecordingSchema>;

export const gestureProvenanceSchema = z.object({
  recording: gestureRecordingSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  trackIds: z.tuple([z.string().min(1), z.string().min(1)]),
  retainedSamples: z.number().int().min(2).max(10_000),
  reductionLimited: z.boolean(),
}).strict();
