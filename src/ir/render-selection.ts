import { z } from 'zod';

export const renderFrameRangeSchema = z.object({ startFrame: z.number().int().nonnegative(), endFrame: z.number().int().positive() }).strict().refine(range => range.endFrame > range.startFrame, 'Frame range uses an exclusive end and must contain at least one frame.');
export const renderGroupSchema = z.object({ sceneId: z.string().min(1), layerId: z.string().min(1) }).strict();
