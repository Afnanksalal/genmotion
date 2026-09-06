import { z } from 'zod';
import { resolveParameters } from './parameters.js';
import { GenmotionError } from '../errors.js';
import { editTargetSchema, inspectEditTarget, type EditTarget } from './edit.js';
import type { GenmotionProject } from './schema.js';

export const editingContextPatchSchema = z.object({
  frame: z.number().int().nonnegative().optional(),
  selection: editTargetSchema.array().max(32).optional(),
  viewport: z.object({ zoom: z.number().finite().positive().max(100), panX: z.number().finite(), panY: z.number().finite(), width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative() }).strict().optional(),
  range: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).strict().nullable().optional(),
}).strict();
export type EditingContextPatch = z.infer<typeof editingContextPatchSchema>;
export interface EditingContextState {
  sequence: number; origin: string; frame: number; selection: EditTarget[];
  viewport: { zoom: number; panX: number; panY: number; width: number; height: number };
  range: { start: number; end: number } | null;
}
export interface EditingContextView extends EditingContextState {
  revision: string; fps: number; totalFrames: number;
  scene: { id: string; startFrame: number; localFrame: number } | null;
  targets: Array<{ target: EditTarget; type?: string; lockedTracks?: string[]; inherited: boolean; code?: string; reason?: string }>;
  markers: Array<{ id: string; frame: number; kind: string; label: string; note: string }>;
  totalMarkers: number;
}
export const initialEditingContext = (): EditingContextState => ({ sequence: 0, origin: 'session', frame: 0, selection: [], viewport: { zoom: 1, panX: 0, panY: 0, width: 0, height: 0 }, range: null });
export function editingContextView(project: GenmotionProject, revision: string, state: EditingContextState): EditingContextView {
  const evaluated = resolveParameters(project);
  const totalFrames = Math.max(1, Math.ceil(evaluated.scenes.reduce((sum, scene) => sum + scene.duration, 0) * evaluated.fps));
  const frame = Math.min(totalFrames - 1, state.frame);
  let elapsed = 0, scene: EditingContextView['scene'] = null;
  for (const item of evaluated.scenes) {
    if (frame / evaluated.fps < elapsed + item.duration) { scene = { id: item.id, startFrame: Math.ceil(elapsed * evaluated.fps), localFrame: frame - Math.ceil(elapsed * evaluated.fps) }; break; }
    elapsed += item.duration;
  }
  const targets = state.selection.map(target => {
    try {
      const { layer } = inspectEditTarget(project, target);
      const lockedGroups = new Set((layer.trackGroups ?? []).filter(group => group.locked).map(group => group.id));
      return { target, type: layer.type, lockedTracks: layer.tracks.filter(track => track.locked || (track.group && lockedGroups.has(track.group))).map(track => track.id), inherited: Boolean(target.instancePath?.length) };
    } catch (error) { return { target, inherited: Boolean(target.instancePath?.length), code: error instanceof GenmotionError ? error.code : 'EDIT_TARGET_INVALID', reason: error instanceof Error ? error.message : String(error) }; }
  });
  const range = state.range ? { start: Math.min(state.range.start, totalFrames - 1), end: Math.min(state.range.end, totalFrames - 1) } : null;
  const starts = new Map<string, number>(); let start = 0;
  for (const item of evaluated.scenes) { starts.set(item.id, start); start += item.duration; }
  const markers = (project.markers ?? []).map(marker => ({ id: marker.id, frame: Math.round((marker.time + (marker.sceneId ? starts.get(marker.sceneId) ?? 0 : 0)) * evaluated.fps), kind: marker.kind, label: marker.label.slice(0, 256), note: marker.note.slice(0, 1024) })).sort((left, right) => Math.abs(left.frame - frame) - Math.abs(right.frame - frame)).slice(0, 16);
  return structuredClone({ ...state, frame, range, revision, fps: evaluated.fps, totalFrames, scene, targets, markers, totalMarkers: project.markers?.length ?? 0 });
}
export function updateEditingContext(project: GenmotionProject, state: EditingContextState, input: EditingContextPatch, origin: string): EditingContextState {
  const patch = editingContextPatchSchema.parse(input);
  const evaluated = resolveParameters(project);
  const totalFrames = Math.max(1, Math.ceil(evaluated.scenes.reduce((sum, scene) => sum + scene.duration, 0) * evaluated.fps));
  if (patch.frame !== undefined && patch.frame >= totalFrames) throw new GenmotionError('CONTEXT_FRAME_RANGE', 'Playhead frame is outside the project.');
  if (patch.range && (patch.range.start > patch.range.end || patch.range.end >= totalFrames)) throw new GenmotionError('CONTEXT_RANGE_INVALID', 'Timeline range must be ordered and inside the project.');
  if (patch.selection) {
    const unique = new Set<string>();
    for (const target of patch.selection) {
      inspectEditTarget(project, target);
      const key = JSON.stringify(target);
      if (unique.has(key)) throw new GenmotionError('CONTEXT_SELECTION_DUPLICATE', 'Selection contains a duplicate target.');
      unique.add(key);
    }
  }
  const updated = structuredClone(state);
  if (patch.frame !== undefined) updated.frame = patch.frame;
  if (patch.selection !== undefined) updated.selection = structuredClone(patch.selection);
  if (patch.viewport !== undefined) updated.viewport = structuredClone(patch.viewport);
  if (patch.range !== undefined) updated.range = structuredClone(patch.range);
  return { ...updated, origin, sequence: state.sequence + 1 };
}
