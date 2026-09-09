import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { animationTrackSchema, layerSchema, projectSchema, type GenmotionProject, type Layer } from './schema.js';
import { applyPatch, type PatchOperation } from './patch.js';
import { compositionUses } from './compositions.js';
import { commitProject, type ProjectCommitOptions, type ProjectCommitReceipt } from './store.js';
import { assertTrackLocks } from './track-locks.js';
import { inspectInstancePath, overridePropertyValue } from './instance-overrides.js';
import type { CompositionLayer, InstanceOverrideChange, ParameterValue } from './schema.js';
import { materializeCompositionInstance } from './materialize.js';
import { documentDiff } from './document-diff.js';
import { pathNodeEditSchema } from './path-nodes.js';
import { editPathNodes } from '../engine/path-nodes.js';
import { gestureRecordingSchema } from './gesture-recording.js';
import { compileGestureRecording } from '../engine/gesture-recording.js';
import { instanceBaseRevision, reconcileInstanceOverrides, overrideResolutionSchema } from './override-reconciliation.js';

export const editScopeSchema = z.object({ kind: z.enum(['scene', 'composition']), id: z.string().min(1) }).strict();
export const editTargetSchema = editScopeSchema.extend({ layerId: z.string().min(1), instancePath: z.array(z.string().min(1)).min(1).max(128).optional() }).strict();
export const semanticEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('text'), target: editTargetSchema, text: z.string() }).strict(),
  z.object({ op: z.literal('gesture-record'), target: editTargetSchema, recording: gestureRecordingSchema, replaceTrackIds: z.array(z.string().min(1)).max(256).default([]) }).strict(),
  z.object({ op: z.literal('path-nodes'), target: editTargetSchema, expectedPathRevision: z.string().regex(/^[a-f0-9]{64}$/), edits: pathNodeEditSchema.array().min(1).max(500), resetModes: z.boolean().default(false) }).strict(),
  z.object({ op: z.literal('property'), target: editTargetSchema, path: z.array(z.string().min(1)).min(1).max(12), value: z.unknown() }).strict(),
  z.object({ op: z.literal('timing'), target: editTargetSchema, start: z.number().finite().nonnegative().optional(), duration: z.number().finite().positive().optional() }).strict(),
  z.object({ op: z.literal('asset'), target: editTargetSchema, src: z.string().min(1) }).strict(),
  z.object({ op: z.literal('track-put'), target: editTargetSchema, track: animationTrackSchema }).strict(),
  z.object({ op: z.literal('track-remove'), target: editTargetSchema, trackId: z.string().min(1) }).strict(),
  z.object({ op: z.literal('layer-add'), scope: editScopeSchema, layer: layerSchema, beforeLayerId: z.string().min(1).optional() }).strict(),
  z.object({ op: z.literal('layer-remove'), target: editTargetSchema }).strict(),
  z.object({ op: z.literal('layer-duplicate'), target: editTargetSchema, newId: z.string().min(1), beforeLayerId: z.string().min(1).optional() }).strict(),
  z.object({ op: z.literal('layer-reorder'), target: editTargetSchema, beforeLayerId: z.string().min(1).optional() }).strict(),
  z.object({ op: z.literal('instance-materialize'), target: editTargetSchema, compositionId: z.string().min(1) }).strict(),
  z.object({ op: z.literal('instance-reconcile'), target: editTargetSchema, expectedReview: z.string().regex(/^[a-f0-9]{64}$/), resolutions: overrideResolutionSchema.array().max(500) }).strict(),
  z.object({ op: z.literal('style'), target: editTargetSchema, values: z.record(z.string().min(1), z.unknown()).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 64, 'Supply between 1 and 64 style properties') }).strict(),
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
function nestedTarget(project: GenmotionProject, target: EditTarget): { instance: CompositionLayer; path: string[]; layer: Layer; siblings: Layer[] } {
  const ids = target.instancePath;
  if (!ids?.length) throw new GenmotionError('EDIT_INSTANCE_PATH', 'A nested target requires an instance path.');
  const instance = one(layers(project, target), ids[0]!, 'Root instance');
  if (instance.type !== 'composition') throw new GenmotionError('EDIT_INSTANCE_PATH', 'The root instance is not a composition.');
  const path = [...ids.slice(1), target.layerId];
  const inspected = inspectInstancePath(project, instance, path);
  return { instance, path, layer: inspected.layer, siblings: inspected.siblings };
}
export function inspectEditTarget(project: GenmotionProject, input: EditTarget): { target: EditTarget; layer: Layer; affectedInstances: ReturnType<typeof compositionUses>; dependants: string[] } {
  const target = editTargetSchema.parse(input);
  if (target.instancePath) {
    const resolved = nestedTarget(project, target);
    return { target, layer: resolved.layer, affectedInstances: [{ container: target.kind, containerId: target.id, layerId: resolved.instance.id }], dependants: resolved.siblings.filter(candidate => candidate.parentId === resolved.layer.id || candidate.constraints.some(constraint => constraint.target === resolved.layer.id) || candidate.propertyLinks?.some(link => link.enabled && link.sourceLayerId === resolved.layer.id)).map(candidate => candidate.id) };
  }
  const siblings = layers(project, target);
  const layer = one(siblings, target.layerId, 'Layer');
  return {
    target, layer: structuredClone(layer),
    affectedInstances: target.kind === 'composition' ? compositionUses(project, target.id) : [],
    dependants: siblings.filter((candidate) => candidate.parentId === layer.id || candidate.constraints.some((constraint) => constraint.target === layer.id) || candidate.propertyLinks?.some((link) => link.enabled && link.sourceLayerId === layer.id)).map((candidate) => candidate.id),
  };
}

function editOne(project: GenmotionProject, edit: SemanticEdit): void {
  if (edit.op === 'instance-reconcile') {
    if (edit.target.instancePath) throw new GenmotionError('EDIT_MATERIALIZATION_REQUIRED', 'Reconcile overrides on the outer instance first.');
    const layer = one(layers(project, edit.target), edit.target.layerId, 'Instance');
    if (layer.type !== 'composition') throw new GenmotionError('EDIT_INSTANCE_PATH', 'Override reconciliation requires a composition instance.');
    layer.overrides = reconcileInstanceOverrides(project, layer, edit.expectedReview, edit.resolutions); return;
  }
  if (edit.op === 'instance-materialize') {
    const updated = materializeCompositionInstance(project, edit.target, edit.compositionId);
    project.scenes = updated.scenes; project.compositions = updated.compositions; return;
  }
  if (edit.op === 'layer-add') {
    const siblings = layers(project, edit.scope);
    if (siblings.some((layer) => layer.id === edit.layer.id)) throw new GenmotionError('EDIT_ID_CONFLICT', 'The new layer ID already exists in this scope.');
    const before = edit.beforeLayerId ? one(siblings, edit.beforeLayerId, 'Insertion anchor') : undefined;
    siblings.splice(before ? siblings.indexOf(before) : siblings.length, 0, structuredClone(edit.layer));
    return;
  }
  if (edit.target.instancePath) {
    const { instance, path, layer } = nestedTarget(project, edit.target);
    if (edit.op === 'layer-duplicate' || edit.op === 'layer-reorder') throw new GenmotionError('EDIT_MATERIALIZATION_REQUIRED', 'Structural insertion or reordering requires materializing the instance. Property, text, asset, timing, track and removal edits support sparse overrides.');
    instance.overrides ??= { version: 1, baseRevision: instanceBaseRevision(project, instance), changes: [] };
    const put = (property: string[], value: unknown): void => {
      const existing = instance.overrides!.changes.find(change => change.op !== 'remove-layer' && JSON.stringify(change.target) === JSON.stringify(path) && JSON.stringify(change.path) === JSON.stringify(property));
      const change: InstanceOverrideChange = { op: 'set', target: path, path: property, value: structuredClone(value) as ParameterValue, expected: existing && existing.op !== 'remove-layer' ? existing.expected : overridePropertyValue(layer, property) };
      if (existing) instance.overrides!.changes.splice(instance.overrides!.changes.indexOf(existing), 1, change); else instance.overrides!.changes.push(change);
    };
    if (edit.op === 'layer-remove') {
      if (layer.tracks.some(track => track.locked) || layer.trackGroups?.some(group => group.locked)) throw new GenmotionError('TRACK_LOCKED', 'Unlock this instance layer before removing it.');
      if (inspectEditTarget(project, edit.target).dependants.length) throw new GenmotionError('EDIT_DEPENDANTS', 'Retarget dependent layers before removing this instance layer.');
      instance.overrides.changes = instance.overrides.changes.filter(change => JSON.stringify(change.target) !== JSON.stringify(path));
      // Validate remaining references through native preflight; the removal marker survives base updates.
      instance.overrides.changes.push({ op: 'remove-layer', target: path }); return;
    }
    // Reuse ordinary semantic validation against an isolated copy before recording sparse data.
    const temporary = structuredClone(project);
    temporary.scenes = [{ ...project.scenes[0]!, id: '__instance_edit__', layers: [structuredClone(layer)] }];
    const original = structuredClone(temporary);
    const local = { ...edit, target: { kind: 'scene' as const, id: '__instance_edit__', layerId: layer.id } };
    editOne(temporary, local);
    assertTrackLocks(original, temporary);
    const updated = temporary.scenes[0]!.layers[0]!;
    if (edit.op === 'text') put(['text'], 'text' in updated ? updated.text : undefined);
    else if (edit.op === 'gesture-record') { put(['tracks'], updated.tracks); put(['gestureRecordings'], updated.gestureRecordings); }
    else if (edit.op === 'path-nodes' && updated.type === 'shape') { put(['path'], updated.path); put(['pathEditState'], updated.pathEditState); }
    else if (edit.op === 'asset') put(['src'], 'src' in updated ? updated.src : undefined);
    else if (edit.op === 'property') put(edit.path, overridePropertyValue(updated, edit.path).value);
    else if (edit.op === 'style') for (const property of Object.keys(edit.values)) put([property], overridePropertyValue(updated, [property]).value);
    else if (edit.op === 'timing') { if (edit.start !== undefined) put(['start'], updated.start); if (edit.duration !== undefined) put(['duration'], updated.duration); }
    else put(['tracks'], updated.tracks);
    return;
  }
  const siblings = layers(project, edit.target);
  const layer = one(siblings, edit.target.layerId, 'Layer');
  if (edit.op === 'layer-duplicate') {
    if (siblings.some(item => item.id === edit.newId)) throw new GenmotionError('EDIT_ID_CONFLICT', 'The duplicate layer ID already exists in this scope.');
    const duplicate = layerSchema.parse({ ...structuredClone(layer), id: edit.newId });
    const before = edit.beforeLayerId ? one(siblings, edit.beforeLayerId, 'Insertion anchor') : undefined;
    siblings.splice(before ? siblings.indexOf(before) : siblings.indexOf(layer) + 1, 0, duplicate);
  } else if (edit.op === 'layer-reorder') {
    if (edit.beforeLayerId === layer.id) return;
    const before = edit.beforeLayerId ? one(siblings, edit.beforeLayerId, 'Insertion anchor') : undefined;
    siblings.splice(siblings.indexOf(layer), 1);
    siblings.splice(before ? siblings.indexOf(before) : siblings.length, 0, layer);
    // Explicit z order is authoritative in the renderer, so declaration order alone is insufficient.
    siblings.forEach((item, index) => { item.z = index; });
  } else if (edit.op === 'style') {
    const permitted = new Set(['color', 'fill', 'stroke', 'strokeWidth', 'radius', 'fontFamily', 'fontFile', 'fontSize', 'fontWeight', 'fontStyle', 'align', 'verticalAlign', 'lineHeight', 'letterSpacing', 'locale', 'direction', 'wrap', 'horizontalMetrics', 'verticalMetrics', 'baselineOffset', 'gradientFill', 'gradientStroke', 'shadow', 'blendMode', 'effects', 'masks', 'outlineColor', 'outlineWidth', 'highlightColor', 'background']);
    for (const [name, value] of Object.entries(edit.values)) {
      if (!permitted.has(name)) throw new GenmotionError('EDIT_UNSUPPORTED_STYLE', `Property ${name} is not a style property; use a typed property operation.`);
      editOne(project, { op: 'property', target: edit.target, path: [name], value });
    }
  } else if (edit.op === 'text') {
    if (layer.type !== 'text') throw new GenmotionError('EDIT_UNSUPPORTED', 'Text replacement requires a text layer. Caption cues have their own timing and text.');
    layer.text = edit.text;
  } else if (edit.op === 'path-nodes') {
    if (layer.type !== 'shape' || layer.shape !== 'path' || !layer.path) throw new GenmotionError('EDIT_UNSUPPORTED', 'Node editing requires a path shape.');
    if (Object.hasOwn(layer.bindings, 'path')) throw new GenmotionError('EDIT_PARAMETER_BOUND', 'Edit the bound path parameter or remove its binding before editing nodes.');
    const edited = editPathNodes(layer.path, edit.expectedPathRevision, edit.edits, edit.resetModes ? undefined : layer.pathEditState);
    layer.path = edited.path; layer.pathEditState = edited.state;
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
    if (parsed.type === 'shape' && edit.path[0] === 'path') delete parsed.pathEditState;
    // Zod object schemas strip unknown keys; reject such proposals instead of
    // returning a successful no-op for a misspelled property.
    applyPatch(parsed, [{ op: 'test', path: pointer, value: edit.value }]);
    siblings[siblings.indexOf(layer)] = parsed;
  } else if (edit.op === 'gesture-record') {
    if (layer.followPath || layer.constraints.length || layer.motion.length || layer.propertyLinks?.some(link => link.enabled && ['transform.x', 'transform.y'].includes(link.target)) || Object.keys(layer.bindings).some(path => path === 'tracks' || path.startsWith('tracks.'))) throw new GenmotionError('GESTURE_DRIVER_CONFLICT', 'Resolve motion recipes, path following, constraints, position links and parameter-bound tracks before recording translation.');
    const compiled = compileGestureRecording(edit.recording);
    const previous = layer.gestureRecordings?.find(item => item.recording.id === edit.recording.id);
    const replace = new Set([...edit.replaceTrackIds, ...(previous?.trackIds ?? [])]);
    if (layer.tracks.some(track => track.enabled && track.solo && !replace.has(track.id)) || layer.trackGroups?.some(group => group.solo)) throw new GenmotionError('GESTURE_SOLO_CONFLICT', 'Clear track or group solo before recording translation.');
    for (const id of edit.replaceTrackIds) {
      const track = one(layer.tracks, id, 'Replacement track');
      if (!['transform.x', 'transform.y'].includes(track.target)) throw new GenmotionError('GESTURE_REPLACEMENT_TARGET', 'Gesture replacement can only target translation tracks.');
    }
    const conflicts = layer.tracks.filter(track => track.enabled && ['transform.x', 'transform.y'].includes(track.target) && !replace.has(track.id));
    if (conflicts.length) throw new GenmotionError('GESTURE_TRACK_CONFLICT', 'Explicitly choose which existing translation tracks this recording replaces.', { tracks: conflicts.map(track => track.id) });
    for (const track of compiled.tracks) if (layer.tracks.some(existing => existing.id === track.id && !replace.has(existing.id))) throw new GenmotionError('EDIT_ID_CONFLICT', `Recording track ID ${track.id} already exists.`);
    layer.tracks = [...layer.tracks.filter(track => !replace.has(track.id)), ...compiled.tracks];
    layer.gestureRecordings = [...(layer.gestureRecordings ?? []).filter(item => item.recording.id !== edit.recording.id), compiled.provenance];
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
    if (edit.op === 'layer-duplicate') { const duplicate = { ...edit.target, layerId: edit.newId }; affected.set(JSON.stringify(duplicate), duplicate); }
  }
  const parsed = projectSchema.parse(proposed);
  assertTrackLocks(project, parsed);
  return { project: parsed, affectedTargets: [...affected.values()], inverse: documentDiff(parsed, project) };
}

/** Pure structural capability query. Asset existence and evaluated semantic
 * checks run during the transaction's validation, never claimed here. */
export interface SemanticEditCapability {
  allowed: boolean; code?: string; reason?: string; requiresValidation: true;
  target: { resolved: boolean; locked: boolean; inherited: boolean; imported: boolean; materializationRequired: boolean; bindings: string[]; dependants: string[] };
  controls: Array<{ id: string; enabled: boolean; reason?: string }>;
}
export function canApplySemanticEdit(project: GenmotionProject, edit: SemanticEdit): SemanticEditCapability {
  let inspected: ReturnType<typeof inspectEditTarget> | undefined;
  if (edit.op !== 'layer-add') try { inspected = inspectEditTarget(project, edit.target); } catch { /* The refusal below owns the precise resolution error. */ }
  const layer = inspected?.layer, locked = Boolean(layer?.tracks.some((track) => track.locked) || layer?.trackGroups?.some((group) => group.locked));
  const materializationRequired = Boolean(edit.op !== 'layer-add' && edit.target.instancePath && (edit.op === 'layer-duplicate' || edit.op === 'layer-reorder'));
  const target = { resolved: Boolean(inspected) || edit.op === 'layer-add', locked, inherited: Boolean(edit.op !== 'layer-add' && edit.target.instancePath), imported: Boolean(layer?.tags.includes('imported:frozen')), materializationRequired, bindings: layer ? Object.keys(layer.bindings).sort() : [], dependants: inspected?.dependants ?? [] };
  const operations = ['text', 'style', 'property', 'timing', 'asset', 'track-put', 'track-remove', 'layer-remove', 'layer-duplicate', 'layer-reorder', 'instance-materialize'] as const;
  const controls = operations.map((id) => { const typeAllowed = !layer || id === 'property' || id === 'timing' || id === 'layer-remove' || id === 'layer-duplicate' || id === 'layer-reorder' || id === 'instance-materialize' || id === 'style' && (layer.type === 'text' || layer.type === 'caption' || layer.type === 'shape') || id === 'text' && layer.type === 'text' || id === 'asset' && (layer.type === 'image' || layer.type === 'video') || (id === 'track-put' || id === 'track-remove'); const enabled = typeAllowed && !locked && !(target.imported && id !== 'instance-materialize') && !(target.inherited && (id === 'layer-duplicate' || id === 'layer-reorder')); return { id, enabled, ...(!enabled ? { reason: locked ? 'Target is locked.' : target.imported ? 'Frozen imported content must be materialized.' : target.inherited && (id === 'layer-duplicate' || id === 'layer-reorder') ? 'Structural edits require materialization.' : 'Operation is not valid for this layer type.' } : {}) }; });
  try { applySemanticEdits(project, [edit]); return { allowed: true, requiresValidation: true, target, controls }; }
  catch (error) { return { allowed: false, code: error instanceof GenmotionError ? error.code : 'EDIT_INVALID', reason: error instanceof Error ? error.message : String(error), requiresValidation: true, target, controls }; }
}

export interface SemanticCommitReceipt extends ProjectCommitReceipt { affectedTargets: EditTarget[]; inverse: PatchOperation[] }
export async function commitSemanticEdits(input: string, edits: SemanticEdit[], options: Omit<ProjectCommitOptions, 'update'>): Promise<SemanticCommitReceipt> {
  let applied: SemanticEditResult | undefined;
  const receipt = await commitProject(input, { ...options, update: (project) => { applied = applySemanticEdits(project, edits); return applied.project; } });
  if (!applied) throw new GenmotionError('EDIT_NOT_APPLIED', 'The transaction did not evaluate its edits.');
  return { ...receipt, affectedTargets: applied.affectedTargets, inverse: applied.inverse };
}
