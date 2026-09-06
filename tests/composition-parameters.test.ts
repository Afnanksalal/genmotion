import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderFrame } from '../src/engine/draw.js';
import { loadProjectDocument } from '../src/ir/loader.js';
import { resolveParameters } from '../src/ir/parameters.js';
import { projectSchema } from '../src/ir/schema.js';
import { validateProject } from '../src/ir/validate.js';

function source() {
  return projectSchema.parse({
    schemaVersion: 1, id: 'instances', title: 'Independent instances', width: 320, height: 180, fps: 30,
    brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
    parameters: [{ id: 'tint', label: 'Project tint', type: 'color', default: '#00ff00' }],
    compositions: [{ id: 'badge', width: 100, height: 100, duration: 1,
      parameters: [{ id: 'tint', label: 'Badge tint', type: 'color', default: '#ff0000' }],
      layers: [{ id: 'face', type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#000', bindings: { fill: 'tint' } }],
    }],
    scenes: [{ id: 'main', purpose: 'Independent local overrides', duration: 1, background: '#000', layers: [
      { id: 'left', type: 'composition', compositionId: 'badge', x: 0, y: 0, width: 100, height: 100 },
      { id: 'right', type: 'composition', compositionId: 'badge', parameterValues: { tint: '#0000ff' }, x: 160, y: 0, width: 100, height: 100 },
      { id: 'repeat', type: 'composition', compositionId: 'badge', parameterValues: { tint: '#0000ff' }, x: 270, y: 0, width: 50, height: 50 },
    ] }],
  });
}

describe('composition parameter instances', () => {
  it('compiles native motion recipes inside reusable definitions before evaluating instances', async () => {
    const project = source();
    project.compositions[0]!.layers[0]!.motion = [{ recipe: 'masked-rise', start: 0, duration: .5, intensity: 1 }];
    const loaded = await loadProjectDocument(project, path.resolve('tests/fixtures/basic/genmotion.json'));
    const first = await renderFrame(loaded.project, loaded.projectDir, 0);
    const settled = await renderFrame(loaded.project, loaded.projectDir, 20);
    expect(first[(50 * 320 + 50) * 4]).toBe(0);
    expect(settled[(50 * 320 + 50) * 4]).toBe(255);
    expect(settled[(50 * 320 + 210) * 4 + 2]).toBe(255);
  });
  it('renders frame holds and interval holds with identical native pixels', async () => {
    const project = source();
    const face = project.compositions[0]!.layers[0]!;
    face.width = 20;
    face.transform.x = { keyframes: [{ at: 0, value: 0, ease: 'linear' }, { at: 1, value: 70, ease: 'linear' }] };
    const instance = project.scenes[0]!.layers[0]!;
    if (instance.type !== 'composition') throw new Error('Expected composition.');
    project.scenes[0]!.layers = [instance];
    instance.freeze = { frame: 15 };
    let loaded = await loadProjectDocument(project, path.resolve('tests/fixtures/basic/genmotion.json'));
    expect(await renderFrame(loaded.project, loaded.projectDir, 0)).toEqual(await renderFrame(loaded.project, loaded.projectDir, 20));
    instance.freeze = { frame: 15, from: 0.2, to: 0.6 };
    loaded = await loadProjectDocument(project, loaded.projectFile);
    const held = await renderFrame(loaded.project, loaded.projectDir, 9);
    expect(await renderFrame(loaded.project, loaded.projectDir, 15)).toEqual(held);
    expect(await renderFrame(loaded.project, loaded.projectDir, 3)).not.toEqual(held);
    expect(await renderFrame(loaded.project, loaded.projectDir, 24)).not.toEqual(held);
  });

  it('renders independent values, shadows globals and shares identical evaluated definitions', async () => {
    const project = source();
    const loaded = await loadProjectDocument(project, path.resolve('tests/fixtures/basic/genmotion.json'));
    expect(loaded.project.compositions).toHaveLength(2);
    expect((await validateProject(loaded)).filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(loaded.project.scenes[0]!.layers[1]).toMatchObject({ compositionId: loaded.project.scenes[0]!.layers[2]!.type === 'composition' ? loaded.project.scenes[0]!.layers[2]!.compositionId : '' });
    const frame = await renderFrame(loaded.project, loaded.projectDir, 0);
    const pixel = (x: number, y: number): number[] => [...frame.subarray((y * 320 + x) * 4, (y * 320 + x) * 4 + 4)];
    expect(pixel(50, 50)).toEqual([255, 0, 0, 255]);
    expect(pixel(200, 50)).toEqual([0, 0, 255, 255]);
    expect(await renderFrame(loaded.project, loaded.projectDir, 0)).toEqual(frame);
    expect(project.compositions).toHaveLength(1);
    expect(project.compositions[0]!.layers[0]).toMatchObject({ fill: '#000' });
    expect(loaded.sourceProject.scenes[0]!.layers[1]).toMatchObject({ compositionId: 'badge' });
  });

  it('rejects invalid local overrides and composition cycles before evaluation', () => {
    const project = source();
    const right = project.scenes[0]!.layers[1]!;
    if (right.type !== 'composition') throw new Error('Expected composition fixture.');
    right.parameterValues = { missing: true };
    expect(() => resolveParameters(project)).toThrow('Unknown composition parameter');
    right.parameterValues = { tint: 1 };
    expect(() => resolveParameters(project)).toThrow('requires a string');
    right.parameterValues = {};
    project.compositions[0]!.layers.push({ ...right, id: 'self' });
    expect(() => resolveParameters(project)).toThrow('Composition cycle');
  });

  it('passes structured parent values into nested instance parameters', () => {
    const project = source();
    const nested = project.scenes[0]!.layers[1]!;
    if (nested.type !== 'composition') throw new Error('Expected composition fixture.');
    project.compositions.push({ id: 'wrapper', width: 100, height: 100, duration: 1, parameters: [{ id: 'child', label: 'Child', type: 'object', default: {}, properties: { tint: { id: 'tint', label: 'Tint', type: 'color', default: '#ffffff' } } }], layers: [{ ...nested, x: 0, parameterValues: {}, bindings: { parameterValues: 'child' } }] });
    project.scenes[0]!.layers = [{ ...nested, compositionId: 'wrapper', parameterValues: { child: { tint: '#aabbcc' } } }];
    const resolved = resolveParameters(project);
    const instance = resolved.scenes[0]!.layers[0]!;
    if (instance.type !== 'composition') throw new Error('Expected resolved composition.');
    const child = resolved.compositions.find((composition) => composition.id === instance.compositionId)!.layers[0]!;
    if (child.type !== 'composition') throw new Error('Expected child composition.');
    expect(resolved.compositions.find((composition) => composition.id === child.compositionId)!.layers[0]).toMatchObject({ fill: '#aabbcc' });
  });
});
