import { z } from 'zod';
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const timelineMarkerSchema = z.object({
  id, label: z.string().min(1).max(1024), time: z.number().finite().nonnegative(), sceneId: id.optional(),
  kind: z.enum(['marker', 'beat', 'comment', 'chapter']).default('marker'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f59e0b'), note: z.string().max(20000).default(''),
  origin: z.enum(['manual', 'analysis', 'import']).default('manual'), confidence: z.number().min(0).max(1).optional(),
}).strict();
export const timelineRangeSchema = z.object({ id, label: z.string().min(1).max(1024), start: z.number().finite().nonnegative(), end: z.number().finite().positive() }).strict().refine((range) => range.end > range.start, 'Range end must exceed start');
export const timelineMarkersSchema = z.array(timelineMarkerSchema).max(4096).refine((markers) => new Set(markers.map((marker) => marker.id)).size === markers.length, 'Marker IDs must be unique');
export const timelineRangesSchema = z.array(timelineRangeSchema).max(256).refine((ranges) => new Set(ranges.map((range) => range.id)).size === ranges.length, 'Range IDs must be unique');
export type TimelineMarker = z.infer<typeof timelineMarkerSchema>;
export type TimelineRange = z.infer<typeof timelineRangeSchema>;

export function globalMarkerTime(marker: TimelineMarker, scenes: Array<{ id: string; duration: number }>): number {
  if (!marker.sceneId) return marker.time;
  let offset = 0;
  for (const scene of scenes) { if (scene.id === marker.sceneId) return offset + marker.time; offset += scene.duration; }
  throw new Error(`Marker ${marker.id} references missing scene ${marker.sceneId}`);
}
