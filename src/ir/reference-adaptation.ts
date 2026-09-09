import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GenmotionProject } from './schema.js';

const id = z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
const time = z.number().finite().nonnegative();
const unit = z.number().finite().min(0).max(1);
const rectangle = z.object({ x: unit, y: unit, width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1) }).strict()
  .refine(value => value.x + value.width <= 1 && value.y + value.height <= 1, 'Bounds must remain inside the normalized frame');
const interval = z.object({ start: time, end: time }).strict().refine(value => value.end > value.start, 'Reference interval must be positive');

export const referencePixelOriginSchema = z.enum(['original-native', 'captured-evidence', 'source-derived', 'generated-replacement']);
export const adaptationTargetSchema = z.object({
  sceneId: id, layerId: id.optional(), property: z.string().min(1).max(300).optional(), pixelOrigin: referencePixelOriginSchema,
}).strict();
export const adaptationMapEntrySchema = z.object({
  id, referenceId: id, referenceInterval: interval, measurementIds: z.array(id).max(1000).default([]),
  targets: z.array(adaptationTargetSchema).min(1).max(1000),
  intentionalDifferences: z.array(z.object({ region: rectangle.optional(), reason: z.string().min(1).max(4000) }).strict()).max(1000).default([]),
}).strict();
export const referenceAdaptationMapSchema = z.object({ version: z.literal(1), entries: z.array(adaptationMapEntrySchema).max(10000) }).strict()
  .superRefine((map, context) => { if (new Set(map.entries.map(entry => entry.id)).size !== map.entries.length) context.addIssue({ code: 'custom', message: 'Adaptation entry IDs must be unique' }); });

const point = z.object({ x: unit, y: unit }).strict();
export const referenceObservationSchema = z.object({
  id, referenceId: id, kind: z.enum(['timing-landmark', 'motion-landmark', 'camera-position', 'cursor-position', 'visual-region']),
  interval, confidence: unit, point: point.optional(), bounds: rectangle.optional(),
  values: z.record(z.string(), z.number().finite()).default({}),
  source: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), analyzer: z.string().min(1), version: z.string().min(1) }).strict(),
  correction: z.object({ actor: z.string().min(1), at: z.string().datetime(), reason: z.string().min(1).max(4000), previousHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
}).strict().superRefine((observation, context) => {
  if (['motion-landmark', 'camera-position', 'cursor-position'].includes(observation.kind) && !observation.point) context.addIssue({ code: 'custom', message: `${observation.kind} requires a point` });
  if (observation.kind === 'visual-region' && !observation.bounds) context.addIssue({ code: 'custom', message: 'visual-region requires bounds' });
});
export const referenceObservationsSchema = z.array(referenceObservationSchema).max(100000)
  .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Observation IDs must be unique');

const measuredPoint = point.extend({ confidence: unit }).strict();
export const referenceMeasurementSampleSchema = z.object({
  at: time, duration: z.number().finite().positive().max(10).default(1 / 30), motionEnergy: unit.default(0), motionPoint: measuredPoint.optional(), camera: measuredPoint.optional(), cursor: measuredPoint.optional(),
  regions: z.array(rectangle.extend({ id, confidence: unit }).strict()).max(100).default([]),
}).strict();
export const referenceAnalysisOptionsSchema = z.object({ referenceId: id, sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), analyzer: z.string().min(1).max(200), analyzerVersion: z.string().min(1).max(200), samples: z.array(referenceMeasurementSampleSchema).min(1).max(10000), landmarkThreshold: unit.default(.65), maxObservations: z.number().int().min(1).max(100000).default(10000) }).strict();

/** Converts bounded extracted measurements into reviewable declarative observations. */
export function analyzeReferenceMeasurements(input: z.input<typeof referenceAnalysisOptionsSchema>) {
  const options = referenceAnalysisOptionsSchema.parse(input), samples = [...options.samples].sort((a, b) => a.at - b.at), source = { sha256: options.sourceSha256, analyzer: options.analyzer, version: options.analyzerVersion };
  const observations: z.input<typeof referenceObservationSchema>[] = [];
  let dropped = false;
  const add = (kind: z.input<typeof referenceObservationSchema>['kind'], sample: typeof samples[number], suffix: string, confidence: number, extra: Partial<z.input<typeof referenceObservationSchema>> = {}): void => { if (observations.length >= options.maxObservations) { dropped = true; return; } observations.push({ id: `${kind}-${suffix}-${hash([options.referenceId, kind, sample.at, extra]).slice(0, 12)}`, referenceId: options.referenceId, kind, interval: { start: sample.at, end: sample.at + sample.duration }, confidence, source, ...extra }); };
  samples.forEach((sample, index) => {
    const previous = samples[index - 1]?.motionEnergy ?? -1, next = samples[index + 1]?.motionEnergy ?? -1;
    if (sample.motionEnergy >= options.landmarkThreshold && sample.motionEnergy >= previous && sample.motionEnergy >= next) add('timing-landmark', sample, String(index), sample.motionEnergy, { values: { motionEnergy: sample.motionEnergy } });
    if (sample.motionPoint) add('motion-landmark', sample, String(index), sample.motionPoint.confidence, { point: { x: sample.motionPoint.x, y: sample.motionPoint.y }, values: { motionEnergy: sample.motionEnergy } });
    if (sample.camera) add('camera-position', sample, String(index), sample.camera.confidence, { point: { x: sample.camera.x, y: sample.camera.y } });
    if (sample.cursor) add('cursor-position', sample, String(index), sample.cursor.confidence, { point: { x: sample.cursor.x, y: sample.cursor.y } });
    for (const region of sample.regions) add('visual-region', sample, `${String(index)}-${region.id}`, region.confidence, { bounds: { x: region.x, y: region.y, width: region.width, height: region.height }, values: { measurementIndex: index } });
  });
  return { version: 1 as const, referenceId: options.referenceId, source, sampleCount: samples.length, truncated: dropped, observations: referenceObservationsSchema.parse(observations), limitations: ['Camera, cursor and visual-region confidence originates in the frozen measurement extractor and remains reviewable.', 'Landmarks are local peaks in bounded motion-energy measurements; manual correction is retained explicitly.'] };
}

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function correctReferenceObservation(input: z.input<typeof referenceObservationSchema>, patch: Partial<Pick<z.input<typeof referenceObservationSchema>, 'interval' | 'confidence' | 'point' | 'bounds' | 'values'>>, actor: string, reason: string, at = new Date().toISOString()) {
  const current = referenceObservationSchema.parse(input);
  return referenceObservationSchema.parse({ ...current, ...patch, correction: { actor, at, reason, previousHash: hash(current) } });
}

/** Compiles reviewed point observations into ordinary seek-safe x/y tracks. */
export function compileObservationTracks(observations: z.input<typeof referenceObservationsSchema>, target: { layerId: string; width: number; height: number; xTarget?: string; yTarget?: string }) {
  if (!Number.isFinite(target.width) || target.width <= 0 || !Number.isFinite(target.height) || target.height <= 0) throw new Error('Track compilation requires positive target dimensions');
  const points = referenceObservationsSchema.parse(observations).filter(item => item.point).sort((a, b) => a.interval.start - b.interval.start || a.id.localeCompare(b.id));
  if (!points.length) throw new Error('At least one reviewed point observation is required');
  const keyframes = (axis: 'x' | 'y') => points.map(item => ({ at: item.interval.start, value: item.point![axis] * (axis === 'x' ? target.width : target.height), ease: 'linear' as const, sourceObservationId: item.id, confidence: item.confidence }));
  return [
    { id: `${target.layerId}-reference-x`, target: target.xTarget ?? 'transform.x', keyframes: keyframes('x') },
    { id: `${target.layerId}-reference-y`, target: target.yTarget ?? 'transform.y', keyframes: keyframes('y') },
  ];
}

export function inspectReferenceAdaptation(project: Pick<GenmotionProject, 'referenceSources' | 'referencePreparations' | 'referenceAdaptationMap' | 'referenceObservations' | 'scenes' | 'compositions'>) {
  const references = new Set(project.referenceSources.map(source => source.id)), measurements = new Set(project.referencePreparations.flatMap(graph => graph.nodes.filter(node => node.kind === 'measurement').map(node => node.id)));
  const containers = new Map([...project.scenes, ...project.compositions].map(container => [container.id, container]));
  const findings: Array<{ code: string; entryId: string; target?: string }> = [];
  for (const entry of project.referenceAdaptationMap.entries) {
    if (!references.has(entry.referenceId)) findings.push({ code: 'ADAPTATION_REFERENCE_MISSING', entryId: entry.id, target: entry.referenceId });
    for (const measurement of entry.measurementIds) if (!measurements.has(measurement)) findings.push({ code: 'ADAPTATION_MEASUREMENT_MISSING', entryId: entry.id, target: measurement });
    for (const target of entry.targets) { const container = containers.get(target.sceneId); if (!container) findings.push({ code: 'ADAPTATION_SCENE_MISSING', entryId: entry.id, target: target.sceneId }); else if (target.layerId && !container.layers.some(layer => layer.id === target.layerId)) findings.push({ code: 'ADAPTATION_LAYER_MISSING', entryId: entry.id, target: `${target.sceneId}/${target.layerId}` }); }
  }
  for (const observation of project.referenceObservations) if (!references.has(observation.referenceId)) findings.push({ code: 'OBSERVATION_REFERENCE_MISSING', entryId: observation.id, target: observation.referenceId });
  const origins = Object.fromEntries(referencePixelOriginSchema.options.map(origin => [origin, project.referenceAdaptationMap.entries.flatMap(entry => entry.targets).filter(target => target.pixelOrigin === origin).length]));
  return { version: 1 as const, ok: findings.length === 0, mapHash: hash(project.referenceAdaptationMap), observationHash: hash(project.referenceObservations), entries: project.referenceAdaptationMap.entries.length, observations: project.referenceObservations.length, origins, findings };
}

export function assertReferenceAdaptation(project: Parameters<typeof inspectReferenceAdaptation>[0]) { const report = inspectReferenceAdaptation(project); if (!report.ok) throw new Error(`Reference adaptation is invalid: ${report.findings.map(finding => `${finding.code}:${finding.entryId}`).join(', ')}`); return report; }
