import { describe, expect, it } from 'vitest';
import { queryEditingProject, editingQuerySchema } from '../src/ir/query.js';
import { applySemanticEdits } from '../src/ir/edit.js';
import { reviewInstanceOverrides, reconcileInstanceOverrides } from '../src/ir/override-reconciliation.js';
import { projectSchema } from '../src/ir/schema.js';
import { resolveParameters } from '../src/ir/parameters.js';
import { importFrozenData, frozenDataValues } from '../src/ir/data-sources.js';
import { evaluateParameterExpression } from '../src/ir/expressions.js';
import { describeAuthoringSchema, authoringSchemaKindSchema } from '../src/ir/authoring-schema.js';
import { compileGestureRecording } from '../src/engine/gesture-recording.js';
import { gestureRecordingSchema } from '../src/ir/gesture-recording.js';
import { inspectPathNodes, editPathNodes } from '../src/engine/path-nodes.js';
import { revealUnicodeText, textDirection } from '../src/engine/text-unicode.js';
import { resolveRenderRange } from '../src/engine/render.js';
import { resolveRenderView } from '../src/engine/render-view.js';
import { locateScene } from '../src/engine/timeline.js';
import { renderFrame } from '../src/engine/draw.js';

function source() { return projectSchema.parse({ schemaVersion: 1, id: 'authoring', title: 'Authoring', width: 320, height: 180, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' }, scenes: [{ id: 'main', duration: 1, background: '#000', purpose: 'Authoring', layers: [{ id: 'box', type: 'shape', shape: 'rect', x: 10, y: 10, width: 80, height: 80, fill: '#f00', duration: 1 }] }] }); }

describe('native authoring milestone', () => {
  it('does not create a phantom frame from decimal scene sums', () => {
    const project = source(); project.scenes = [4.4, 5.2, 4.4].map((duration, i) => ({ ...project.scenes[0]!, id: 'scene-' + i, duration }));
    expect(resolveRenderRange(project, {})).toEqual({ startFrame: 0, endFrame: 420 });
    expect(locateScene(project, 288 / 30)).toMatchObject({ index: 2, localTime: 0 });
  });
  it('paginates compact source queries and bounds property values', () => {
    const project = source();
    expect(queryEditingProject(project, editingQuerySchema.parse({ kind: 'summary' }))).toMatchObject({});
    expect(queryEditingProject(project, editingQuerySchema.parse({ kind: 'scopes', limit: 1 }))).toMatchObject({ total: 1, nextOffset: null });
    expect(queryEditingProject(project, editingQuerySchema.parse({ kind: 'layers', scope: { kind: 'scene', id: 'main' } }))).toMatchObject({ total: 1, items: [{ type: 'shape' }] });
    expect(queryEditingProject(project, editingQuerySchema.parse({ kind: 'properties', target: { kind: 'scene', id: 'main', layerId: 'box' }, paths: [['x'], ['missing']] }))).toMatchObject({ properties: [{ exists: true, value: 10 }, { exists: false }] });
    for (const kind of ['parameters', 'markers', 'ranges', 'data-sources']) expect(queryEditingProject(project, editingQuerySchema.parse({ kind }))).toMatchObject({ items: [] });
    expect(queryEditingProject(project, editingQuerySchema.parse({ kind: 'preflight' }))).toMatchObject({ width: 320, duration: 1 });
  });
  it('isolates nested instance edits, materializes them, and preserves the reusable source', () => {
    const project = source(), face = project.scenes[0]!.layers[0]!;
    const input = projectSchema.parse({ ...project, compositions: [{ id: 'badge', width: 100, height: 100, duration: 1, layers: [face] }], scenes: [{ ...project.scenes[0], layers: [{ id: 'instance', type: 'composition', compositionId: 'badge', x: 0, y: 0, width: 100, height: 100 }, { id: 'sibling', type: 'composition', compositionId: 'badge', x: 0, y: 0, width: 100, height: 100 }] }] });
    const target = { kind: 'scene', id: 'main', layerId: 'box', instancePath: ['instance'] } as const;
    const changed = applySemanticEdits(input, [{ op: 'property', target: { ...target, instancePath: [...target.instancePath] }, path: ['fill'], value: '#00ff00' }]).project;
    expect(changed.compositions[0]!.layers[0]).toEqual(face);
    expect(queryEditingProject(changed, editingQuerySchema.parse({ kind: 'properties', target, paths: [['fill']] }))).toMatchObject({ properties: [{ value: '#00ff00' }] });
    expect(queryEditingProject(changed, editingQuerySchema.parse({ kind: 'layers', scope: { kind: 'scene', id: 'main' }, instancePath: ['instance'] }))).toMatchObject({ total: 1 });
    const materialized = applySemanticEdits(changed, [{ op: 'instance-materialize', target: { kind: 'scene', id: 'main', layerId: 'instance' }, compositionId: 'private-badge' }]).project;
    expect(materialized.compositions.some(item => item.id === 'private-badge')).toBe(true);
    expect(materialized.compositions.find(item => item.id === 'badge')!.layers[0]).toEqual(face);
    const baseLayer = changed.compositions[0]!.layers[0]!; if (baseLayer.type !== 'shape') throw new Error('Expected shape');
    baseLayer.fill = '#0000ff';
    expect(() => resolveParameters(changed)).toThrow(/changed/);
    const instance = changed.scenes[0]!.layers[0]!; if (instance.type !== 'composition') throw new Error('Expected instance');
    const review = reviewInstanceOverrides(changed, instance);
    expect(review.diagnostics).toMatchObject([{ code: 'OVERRIDE_BASE_CONFLICT', canKeepOverride: true }]);
    instance.overrides = reconcileInstanceOverrides(changed, instance, review.revision, [{ index: 0, choice: 'keep-override' }]);
    expect(() => resolveParameters(changed)).not.toThrow();
    changed.compositions[0]!.layers = [];
    const orphan = reviewInstanceOverrides(changed, instance); expect(orphan.diagnostics[0]!.canKeepOverride).toBe(false);
    expect(() => reconcileInstanceOverrides(changed, instance, review.revision, [])).toThrow();
    instance.overrides = reconcileInstanceOverrides(changed, instance, orphan.revision, [{ index: 0, choice: 'use-base' }]);
    expect(instance.overrides.changes).toEqual([]);
  });
  it('evaluates derived metadata and content duration while retaining editable defaults', () => {
    const project = projectSchema.parse({ ...source(), parameters: [{ id: 'size', type: 'number', label: 'Size', default: 160 }, { id: 'canvas', type: 'number', label: 'Canvas', default: 320, derive: { op: 'multiply', args: [{ ref: 'size' }, { literal: 2 }] } }], parameterBindings: { width: 'canvas' } });
    project.scenes[0]!.durationMode = 'content'; project.scenes[0]!.durationPadding = .25;
    const resolved = resolveParameters(project, { size: 240 });
    expect(resolved.width).toBe(480); expect(resolved.scenes[0]!.duration).toBe(1.25);
    expect(project.width).toBe(320); expect(project.scenes[0]!.duration).toBe(1);
  });
  it('rejects derived cycles, division by zero and invalid expression operands', () => {
    expect(() => evaluateParameterExpression({ op: 'divide', args: [{ literal: 1 }, { literal: 0 }] }, () => 0)).toThrow();
    expect(() => evaluateParameterExpression({ op: 'add', args: [{ literal: '1' }, { literal: 2 }] }, () => 0)).toThrow();
    const project = projectSchema.parse({ ...source(), parameters: [{ id: 'a', label: 'A', type: 'number', default: 1, derive: { ref: 'b' } }, { id: 'b', label: 'B', type: 'number', default: 1, derive: { ref: 'a' } }] });
    expect(() => resolveParameters(project)).toThrow(/cycle/i);
  });
  it('imports quoted CSV as typed frozen rows and rejects malformed ownership and values', () => {
    const field = (id: string, type: string, value: unknown) => ({ id, label: id, type, default: value });
    const project = projectSchema.parse({ ...source(), parameters: [{ ...field('rows', 'array', []), items: { ...field('row', 'object', {}), properties: { name: field('name', 'string', ''), count: field('count', 'number', 0) } } }] });
    const input = { id: 'table', parameterId: 'rows', format: 'csv' as const, sourceName: 'table.csv', content: 'name,count\n"North, west",42\nSouth,8' };
    const captured = importFrozenData(project, input);
    expect(frozenDataValues(captured.project)).toEqual({ rows: [{ name: 'North, west', count: 42 }, { name: 'South', count: 8 }] });
    expect(() => importFrozenData(captured.project, { ...input, id: 'other' })).toThrow(/already supplied/);
    expect(() => importFrozenData(project, { ...input, content: 'name,count\nSouth,nope' })).toThrow(/valid number/);
  });
  it('freezes typed data, detects tampering and permits explicit variant overrides', () => {
    const project = projectSchema.parse({ ...source(), parameters: [{ id: 'score', label: 'Score', type: 'number', default: 1 }] });
    const captured = importFrozenData(project, { id: 'snapshot', parameterId: 'score', format: 'json', sourceName: 'score.json', content: '42' });
    expect(frozenDataValues(captured.project)).toEqual({ score: 42 });
    expect(resolveParameters(captured.project, { score: 9 }).parameterValues.score).toBe(9);
    captured.project.dataSources![0]!.value = 43;
    expect(() => resolveParameters(captured.project)).toThrow(/changed/);
  });
  it('exports all discoverable schemas without exposing mutable cached objects', () => {
    for (const kind of authoringSchemaKindSchema.options) {
      const summary = describeAuthoringSchema(kind); expect(summary.runtimeValidationRequired).toBe(true);
      const full = describeAuthoringSchema(kind, true); expect(full.$schema).toBeDefined(); full.title = 'mutated';
      expect(describeAuthoringSchema(kind, true).title).not.toBe('mutated');
    }
  });
  it('preserves timed pauses when simplifying a recorded straight-line gesture', () => {
    const recording = gestureRecordingSchema.parse({ version: 1, id: 'gesture', origin: 'user', coordinateSpace: 'layer-parent', start: .5, tolerance: .1, samples: [{ at: 0, x: 0, y: 0 }, { at: .4, x: 0, y: 0 }, { at: .6, x: 100, y: 0 }, { at: 1, x: 100, y: 0 }] });
    const compiled = compileGestureRecording(recording);
    expect(compiled.points).toHaveLength(4); expect(compiled.tracks[0]!.keyframes.map(key => key.at)).toEqual([.5, .9, 1.1, 1.5]);
    expect(() => gestureRecordingSchema.parse({ ...recording, samples: [recording.samples[0], recording.samples[0]] })).toThrow();
  });
  it('splits a native path without changing its curve and rejects stale edits', () => {
    const path = 'M0 0 C0 100 100 100 100 0', inspected = inspectPathNodes(path);
    const split = editPathNodes(path, inspected.revision, [{ op: 'split', contour: 0, node: 0, at: .5 }]);
    expect(split.contours[0]!.nodes).toHaveLength(3);
    expect(() => editPathNodes(split.path, inspected.revision, [{ op: 'move-node', contour: 0, node: 0, point: [5, 5] }])).toThrow();
  });
  it('reveals whole graphemes and resolves the first strong bidi character', () => {
    expect(revealUnicodeText('👨‍👩‍👧‍👦A', 'characters', .5)).toBe('👨‍👩‍👧‍👦');
    expect(textDirection('123 العربية', 'auto')).toBe('rtl'); expect(textDirection('123 English', 'auto')).toBe('ltr');
  });
  it('isolates a group on transparent native pixels and rejects invalid frame intervals', async () => {
    const project = source();
    const view = resolveRenderView(project, { sceneId: 'main', layerId: 'box' });
    const pixels = await renderFrame(project, process.cwd(), 0, undefined, view);
    expect(pixels[3]).toBe(0); expect(pixels[(30 * 320 + 30) * 4]).toBe(255);
    expect(resolveRenderRange(project, { range: { startFrame: 3, endFrame: 12 } })).toEqual({ startFrame: 3, endFrame: 12 });
    expect(() => resolveRenderRange(project, { range: { startFrame: 3, endFrame: 40 } })).toThrow();
  });
});
