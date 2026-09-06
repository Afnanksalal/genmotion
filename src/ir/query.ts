import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { editScopeSchema, editTargetSchema, inspectEditTarget, type EditTarget } from './edit.js';
import { overridePropertyValue } from './instance-overrides.js';
import type { GenmotionProject } from './schema.js';
import { resolveParameters } from './parameters.js';
import { reviewInstanceOverrides } from './override-reconciliation.js';
import { inspectPathNodes } from '../engine/path-nodes.js';
import { projectPreflight } from './preflight.js';
import { parameterExpressionReferences } from './expressions.js';
import { compositionUsagePaths } from './compositions.js';
import { gestureRecordingSchema } from './gesture-recording.js';
import { compileGestureRecording } from '../engine/gesture-recording.js';
import { frozenDataValues } from './data-sources.js';

export const editingQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('summary') }).strict(),
  z.object({ kind: z.literal('preflight') }).strict(),
  z.object({ kind: z.literal('gesture-preview'), recording: gestureRecordingSchema }).strict(),
  z.object({ kind: z.literal('data-sources'), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict(),
  z.object({ kind: z.literal('composition-usage'), compositionId: z.string().min(1), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict(),
  z.object({ kind: z.literal('parameters'), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50), maxBytes: z.number().int().min(256).max(65536).default(16384) }).strict(),
  z.object({ kind: z.literal('markers'), sceneId: z.string().min(1).optional(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict(),
  z.object({ kind: z.literal('ranges'), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict(),
  z.object({ kind: z.literal('overrides'), target: editTargetSchema }).strict(),
  z.object({ kind: z.literal('path-nodes'), target: editTargetSchema, resetModes: z.boolean().default(false) }).strict(),
  z.object({ kind: z.literal('scopes'), scopeKind: z.enum(['scene', 'composition']).optional(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict(),
  z.object({ kind: z.literal('layers'), scope: editScopeSchema, instancePath: z.array(z.string().min(1)).min(1).max(128).optional(), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(50) }).strict(),
  z.object({ kind: z.literal('properties'), target: editTargetSchema, paths: z.array(z.array(z.string().min(1)).min(1).max(16)).min(1).max(32), maxBytes: z.number().int().min(256).max(65536).default(16384) }).strict(),
]);
export type EditingQuery = z.infer<typeof editingQuerySchema>;

/** Compact source queries deliberately exclude full keyframe, media and effect payloads. */
export function queryEditingProject(project: GenmotionProject, input: EditingQuery): unknown {
  const query = editingQuerySchema.parse(input);
  if (query.kind === 'data-sources') {
    const sources = project.dataSources ?? [];
    return { total: sources.length, nextOffset: query.offset + query.limit < sources.length ? query.offset + query.limit : null,
      items: sources.slice(query.offset, query.offset + query.limit).map(source => {
        let valid = true, reason: string | undefined;
        try {
          if (sources.filter(item => item.id === source.id || item.parameterId === source.parameterId).length !== 1) throw new Error('Duplicate source or parameter ownership.');
          frozenDataValues({ ...project, dataSources: [source] });
        } catch (error) { valid = false; reason = error instanceof Error ? error.message : String(error); }
        return { id: source.id, parameterId: source.parameterId, format: source.format, sourceName: source.sourceName,
          capturedAt: source.capturedAt, sourceHash: source.sourceHash, valueHash: source.valueHash,
          bytes: Buffer.byteLength(JSON.stringify(source.value)), overridden: Object.hasOwn(project.parameterValues, source.parameterId), valid, ...(reason ? { reason } : {}) };
      }) };
  }
  if (query.kind === 'gesture-preview') return compileGestureRecording(query.recording);
  if (query.kind === 'composition-usage') return compositionUsagePaths(project, query.compositionId, query.offset, query.limit);
  if (query.kind === 'preflight') {
    const { parameterValues: _values, ...metadata } = projectPreflight(project); void _values;
    return metadata;
  }
  if (query.kind === 'parameters') {
    const resolved = resolveParameters(project); let bytes = 0;
    return {
      total: project.parameters.length, offset: query.offset,
      nextOffset: query.offset + query.limit < project.parameters.length ? query.offset + query.limit : null,
      items: project.parameters.slice(query.offset, query.offset + query.limit).map(parameter => {
        const value = resolved.parameterValues[parameter.id]!, size = Buffer.byteLength(JSON.stringify(value));
        const included = bytes + size <= query.maxBytes; if (included) bytes += size;
        return { id: parameter.id, type: parameter.type, label: parameter.label,
          source: parameter.derive ? 'derived' : Object.hasOwn(project.parameterValues, parameter.id) ? 'supplied' : project.dataSources?.some(source => source.parameterId === parameter.id) ? 'frozen-data' : 'default',
          dependencies: parameter.derive ? parameterExpressionReferences(parameter.derive) : [],
          ...(included ? { value } : { omitted: true, bytes: size }) };
      }),
    };
  }
  if (query.kind === 'summary') {
    const metadata = projectPreflight(project);
    return { id: project.id, width: metadata.width, height: metadata.height, fps: metadata.fps, duration: metadata.duration, scenes: project.scenes.length, compositions: project.compositions.length, layers: [...project.scenes, ...project.compositions].reduce((sum, scope) => sum + scope.layers.length, 0), audio: project.audio.length };
  }
  if (query.kind === 'markers' || query.kind === 'ranges') {
    const items = query.kind === 'ranges' ? project.ranges ?? [] : (project.markers ?? []).filter(marker => !query.sceneId || marker.sceneId === query.sceneId);
    return { total: items.length, nextOffset: query.offset + query.limit < items.length ? query.offset + query.limit : null, items: structuredClone(items.slice(query.offset, query.offset + query.limit)) };
  }
  if (query.kind === 'overrides') {
    if (query.target.instancePath) throw new GenmotionError('EDIT_MATERIALIZATION_REQUIRED', 'Review overrides on the outer instance first.');
    const { layer } = inspectEditTarget(project, query.target);
    if (layer.type !== 'composition') throw new GenmotionError('EDIT_INSTANCE_PATH', 'Override review requires a composition instance.');
    return { target: query.target, ...reviewInstanceOverrides(project, layer) };
  }
  if (query.kind === 'path-nodes') {
    const { layer } = inspectEditTarget(project, query.target);
    if (layer.type !== 'shape' || layer.shape !== 'path' || !layer.path) throw new GenmotionError('EDIT_UNSUPPORTED', 'Node inspection requires a path shape.');
    return { target: query.target, ...inspectPathNodes(layer.path, query.resetModes ? undefined : layer.pathEditState) };
  }
  if (query.kind === 'properties') {
    const { layer } = inspectEditTarget(project, query.target);
    let bytes = 0;
    return { target: query.target, properties: query.paths.map(path => {
      const property = overridePropertyValue(layer, path), size = Buffer.byteLength(JSON.stringify(property));
      if (bytes + size > query.maxBytes) return { path, exists: property.exists, omitted: true, bytes: size };
      bytes += size; return { path, ...property };
    }) };
  }
  if (query.kind === 'scopes') {
    const scopes = [...(query.scopeKind === 'composition' ? [] : project.scenes.map(scope => ({ kind: 'scene', id: scope.id, duration: scope.duration, layers: scope.layers.length }))), ...(query.scopeKind === 'scene' ? [] : project.compositions.map(scope => ({ kind: 'composition', id: scope.id, duration: scope.duration, layers: scope.layers.length })))];
    return { total: scopes.length, offset: query.offset, nextOffset: query.offset + query.limit < scopes.length ? query.offset + query.limit : null, items: scopes.slice(query.offset, query.offset + query.limit) };
  }
  const resolved = query.instancePath ? resolveParameters(project) : project;
  const scopes = query.scope.kind === 'scene' ? resolved.scenes : resolved.compositions;
  const matches = scopes.filter(scope => scope.id === query.scope.id);
  if (matches.length !== 1) throw new GenmotionError('EDIT_TARGET_MISSING', 'Query scope is missing or ambiguous.');
  let layers = matches[0]!.layers;
  if (query.instancePath) {
    for (const id of query.instancePath) {
      const instances = layers.filter(layer => layer.id === id);
      const instance = instances[0];
      if (instances.length !== 1 || instance?.type !== 'composition') throw new GenmotionError('EDIT_INSTANCE_PATH', 'Instance query path is missing, ambiguous or not a composition.');
      const definitions = resolved.compositions.filter(item => item.id === instance.compositionId);
      if (definitions.length !== 1) throw new GenmotionError('OVERRIDE_BASE_MISSING', 'Instance query base is missing or ambiguous.');
      layers = definitions[0]!.layers;
    }
  }
  return { total: layers.length, offset: query.offset, nextOffset: query.offset + query.limit < layers.length ? query.offset + query.limit : null, items: layers.slice(query.offset, query.offset + query.limit).map(layer => ({ target: { ...query.scope, layerId: layer.id, ...(query.instancePath ? { instancePath: query.instancePath } : {}) } satisfies EditTarget, type: layer.type, start: layer.start, duration: layer.duration, visible: layer.visible, tracks: layer.tracks.length, ...(layer.type === 'composition' ? { compositionId: layer.compositionId, overridden: Boolean(layer.overrides?.changes.length) } : {}) })) };
}
