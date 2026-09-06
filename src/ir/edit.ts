import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { animationTrackSchema, layerSchema, projectSchema, type GenmotionProject, type Layer } from './schema.js';
import { applyPatch, type PatchOperation } from './patch.js';
import { compositionUses } from './compositions.js';
import { commitProject, type ProjectCommitOptions, type ProjectCommitReceipt } from './store.js';
import { assertTrackLocks } from './track-locks.js';

export const editScopeSchema = z.object({ kind: z.enum(['scene', 'composition']), id: z.string().min(1) }).strict();
export const editTargetSchema = editScopeSchema.extend({ layerId: z.string().min(1) }).strict();
export const semanticEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('text'), target: editTargetSchema, text: z.string() }).strict(),
  z.object({ op: z.literal('property'), target: editTargetSchema, path: z.array(z.string().min(1)).min(1).max(12), value: z.unknown() }).strict(),
  z.object({ op: z.literal('timing'), target: editTargetSchema, start: z.number().finite().nonnegative().optional(), duration: z.number().finite().positive().optional() }).strict(),
  z.object({ op: z.literal('asset'), target: editTargetSchema, src: z.string().min(1) }).strict(),
  z.object({ op: z.literal('track-put'), target: editTargetSchema, track: animationTrackSchema }).strict(),
  z.object({ op: z.literal('track-remove'), target: editTargetSchema, trackId: z.string().min(1) }).strict(),
  z.object({ op: z.literal('layer-add'), scope: editScopeSchema, layer: layerSchema, beforeLayerId: z.string().min(1).optional() }).strict(),
  z.object({ op: z.literal('layer-remove'), target: editTargetSchema }).strict(),
]);
export type EditScope = z.infer<typeof editScopeSchema>;
export type EditTarget = z.infer<typeof editTargetSchema>;
export type SemanticEdit = z.infer<typeof semanticEditSchema>;

function one<T extends { id: string }>(items: T[], id: string, label: string): T {
  const matches = items.filter((item) => item.id === id);
  if (matches.length !== 1) throw new GenmotionError(matches.length ? 'EDIT_TARGET_AMBIGUOUS' : 'EDIT_TARGET_MISSING', `${label} ${id} resolved to ${String(matches.length)} targets.`);
  return matches[0]!;
}
function layers(project: GenmotionProject, scope: EditScope): Layer[] {
  return scope.kind === 'scene' ? one(project.scenes, scope.id, 'Scene').layers : one(project.compositions, scope.id, 'Composition').layers;
}
export function inspectEditTarget(project: GenmotionProject, input: EditTarget): { target: EditTarget; layer: Layer; affectedInstances: ReturnType<typeof compositionUses>; dependants: string[] } {
  const target = editTargetSchema.parse(input);
  const siblings = layers(project, target);
  const layer = one(siblings, target.layerId, 'Layer');
  return {
    target, layer: structuredClone(layer),
    affectedInstances: target.kind === 'composition' ? compositionUses(project, target.id) : [],
    dependants: siblings.filter((candidate) => candidate.parentId === layer.id || candidate.constraints.some((constraint) => constraint.target === layer.id) || candidate.propertyLinks?.some((link) => link.enabled && link.sourceLayerId === layer.id)).map((candidate) => candidate.id),
  };
}

function editOne(project: GenmotionProject, edit: SemanticEdit): void {
  if (edit.op === 'layer-add') {
    const siblings = layers(project, edit.scope);
    if (siblings.some((layer) => layer.id === edit.layer.id)) throw new GenmotionError('EDIT_ID_CONFLICT', 'The new layer ID already exists in this scope.');
    const before = edit.beforeLayerId ? one(siblings, edit.beforeLayerId, 'Insertion anchor') : undefined;
    siblings.splice(before ? siblings.indexOf(before) : siblings.length, 0, structuredClone(edit.layer));
    return;
  }
  const siblings = layers(project, edit.target);
  const layer = one(siblings, edit.target.layerId, 'Layer');
  if (edit.op === 'text') {
    if (layer.type !== 'text') throw new GenmotionError('EDIT_UNSUPPORTED', 'Text replacement requires a text layer. Caption cues have their own timing and text.');
    layer.text = edit.text;
  } else if (edit.op === 'asset') {
    if (layer.type !== 'image' && layer.type !== 'video') throw new GenmotionError('EDIT_UNSUPPORTED', 'Asset replacement requires an image or video layer.');
    layer.src = edit.src;
  } else if (edit.op === 'timing') {
    if (edit.start === undefined && edit.duration === undefined) throw new GenmotionError('EDIT_EMPTY', 'A timing edit must specify start or duration.');
    if (edit.start !== undefined) layer.start = edit.start;
    if (edit.duration !== undefined) layer.duration = edit.duration;
  } else if (edit.op === 'property') {
    if (['id', 'type', 'compositionId'].includes(edit.path[0]!)) throw new GenmotionError('EDIT_ID_IMMUTABLE', 'Generic property edits cannot change target identity or composition bindings.');
    const pointer = '/' + edit.path.map((segment) => segment.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
    let result: Layer;
    try { result = applyPatch(layer, [{ op: 'replace', path: pointer, value: edit.value }]); }
    catch (error) {
      if (!(error instanceof GenmotionError) || error.code !== 'PATCH_PATH_INVALID') throw error;
      result = applyPatch(layer, [{ op: 'add', path: pointer, value: edit.value }]);
    }
    const parsed = layerSchema.parse(result);
    // Zod object schemas strip unknown keys; reject such proposals instead of
    // returning a successful no-op for a misspelled property.
    applyPatch(parsed, [{ op: 'test', path: pointer, value: edit.value }]);
    siblings[siblings.indexOf(layer)] = parsed;
  } else if (edit.op === 'track-put') {
    const matches = layer.tracks.filter((track) => track.id === edit.track.id);
    if (matches.length > 1) throw new GenmotionError('EDIT_TARGET_AMBIGUOUS', 'Track ID is ambiguous.');
    const index = matches[0] ? layer.tracks.indexOf(matches[0]) : layer.tracks.length;
    layer.tracks.splice(index, matches.length, structuredClone(edit.track));
  } else if (edit.op === 'track-remove') {
    const track = one(layer.tracks, edit.trackId, 'Track');
    layer.tracks.splice(layer.tracks.indexOf(track), 1);
  } else {
    const dependants = inspectEditTarget(project, edit.target).dependants;
    if (dependants.length) throw new GenmotionError('EDIT_DEPENDANTS', 'Remove or retarget dependent layers before deleting this layer.', { dependants });
    siblings.splice(siblings.indexOf(layer), 1);
  }
}

export interface SemanticEditResult { project: GenmotionProject; affectedTargets: EditTarget[]; inverse: PatchOperation[] }
export function applySemanticEdits(project: GenmotionProject, input: SemanticEdit[]): SemanticEditResult {
  const edits = semanticEditSchema.array().min(1).max(500).parse(input);
  const proposed = structuredClone(project);
  const affected = new Map<string, EditTarget>();
  for (const edit of edits) {
    editOne(proposed, edit);
    const target = edit.op === 'layer-add' ? { ...edit.scope, layerId: edit.layer.id } : edit.target;
    affected.set(JSON.stringify(target), target);
  }
  const parsed = projectSchema.parse(proposed);
  assertTrackLocks(project, parsed);
  return { project: parsed, affectedTargets: [...affected.values()], inverse: [{ op: 'replace', path: '', value: structuredClone(project) }] };
}

/** Pure structural capability query. Asset existence and evaluated semantic
 * checks run during the transaction's validation, never claimed here. */
export function canApplySemanticEdit(project: GenmotionProject, edit: SemanticEdit): { allowed: boolean; code?: string; reason?: string; requiresValidation: true } {
  try { applySemanticEdits(project, [edit]); return { allowed: true, requiresValidation: true }; }
  catch (error) { return { allowed: false, code: error instanceof GenmotionError ? error.code : 'EDIT_INVALID', reason: error instanceof Error ? error.message : String(error), requiresValidation: true }; }
}

export interface SemanticCommitReceipt extends ProjectCommitReceipt { affectedTargets: EditTarget[]; inverse: PatchOperation[] }
export async function commitSemanticEdits(input: string, edits: SemanticEdit[], options: Omit<ProjectCommitOptions, 'update'>): Promise<SemanticCommitReceipt> {
  let applied: SemanticEditResult | undefined;
  const receipt = await commitProject(input, { ...options, update: (project) => { applied = applySemanticEdits(project, edits); return applied.project; } });
  if (!applied) throw new GenmotionError('EDIT_NOT_APPLIED', 'The transaction did not evaluate its edits.');
  return { ...receipt, affectedTargets: applied.affectedTargets, inverse: applied.inverse };
}
