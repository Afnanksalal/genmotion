import { describe, expect, it } from 'vitest';
import { mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectSchema, shapeLayerSchema } from '../src/ir/schema.js';
import { renderFrame } from '../src/engine/draw.js';
import { evaluateLayerTracks, writeAnimationValue } from '../src/engine/animation.js';
import { resolveLayerGraph, layerDependencyCycles } from '../src/engine/constraints.js';
import { commitProject, readProjectSnapshot } from '../src/ir/store.js';
import { runProcess } from '../src/engine/process.js';

const layer = () => shapeLayerSchema.parse({ id: 'shape', type: 'shape', shape: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff', trackGroups: [{ id: 'position' }], tracks: [
  { id: 'x', target: 'x', group: 'position', keyframes: [{ at: 0, value: 10 }, { at: 1, value: 20 }] },
  { id: 'y', target: 'y', keyframes: [{ at: 0, value: 30 }, { at: 1, value: 40 }] },
] });

describe('shared track controls and property links', () => {
  it('applies group/track solo after mute and leaves locks out of render timing', () => {
    const value = layer();
    expect(evaluateLayerTracks(value, .5)).toMatchObject({ x: 15, y: 35 });
    value.trackGroups![0]!.solo = true;
    expect(evaluateLayerTracks(value, .5)).toMatchObject({ x: 15, y: 0 });
    value.trackGroups![0]!.muted = true;
    expect(evaluateLayerTracks(value, .5)).toMatchObject({ x: 0, y: 35 });
    value.tracks[1]!.locked = true; value.tracks[1]!.solo = true;
    expect(evaluateLayerTracks(value, .5)).toMatchObject({ y: 35 });
    expect(() => writeAnimationValue({}, ['__proto__', 'polluted'], 1)).toThrow('Unsafe');
  });
  it('resolves typed property chains deterministically and rejects cycles and invalid dimensions', () => {
    const source = layer(), linked = shapeLayerSchema.parse({ ...layer(), id: 'linked', propertyLinks: [{ sourceLayerId: 'shape', sourceProperty: 'x', target: 'y', scale: 2, offset: 3 }] });
    expect(resolveLayerGraph([linked, source], .5)[0]).toMatchObject({ y: 33 });
    linked.propertyLinks![0]!.target = 'fill';
    expect(() => resolveLayerGraph([source, linked], .5)).toThrow('compatible');
    linked.propertyLinks![0]!.target = 'y';
    source.propertyLinks = [{ ...linked.propertyLinks![0]!, sourceLayerId: 'linked' }];
    expect(layerDependencyCycles([source, linked])).toHaveLength(1);
    expect(() => resolveLayerGraph([source, linked], .5)).toThrow('cycle');
  });
  it('renders linked native geometry at the evaluated source time', async () => {
    const source = layer();
    const linked = shapeLayerSchema.parse({ ...layer(), id: 'linked', x: 60, y: 0, tracks: [], propertyLinks: [{ sourceLayerId: 'shape', sourceProperty: 'x', target: 'y', scale: 2, offset: 3 }] });
    const project = projectSchema.parse({ schemaVersion: 1, id: 'links', title: 'Links', width: 100, height: 100, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Linked geometry', duration: 1, background: '#000', layers: [source, linked] }] });
    const rgba = await renderFrame(project, process.cwd(), 15);
    expect(rgba[(34 * 100 + 62) * 4]).toBe(255);
    expect(rgba[(2 * 100 + 62) * 4]).toBe(0);
  });
  it('protects locked tracks and groups through real revision-safe commits until explicitly unlocked', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-track-locks-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
      const edit = async (update: Parameters<typeof commitProject>[1]['update']) => commitProject(directory, { expectedRevision: (await readProjectSnapshot(directory)).revision, update });
      await edit((project) => { project.scenes[0]!.layers[0]!.tracks = [{ ...layer().tracks[0]!, group: undefined, locked: true }]; return project; });
      await expect(edit((project) => { project.scenes[0]!.layers[0]!.tracks[0]!.keyframes[1]!.value = 90; return project; })).rejects.toMatchObject({ code: 'TRACK_LOCKED' });
      await expect(edit((project) => { project.scenes[0]!.layers.splice(0, 1); return project; })).rejects.toMatchObject({ code: 'TRACK_LOCKED' });
      await edit((project) => { project.scenes[0]!.layers[0]!.tracks[0]!.locked = false; return project; });
      await edit((project) => { project.scenes[0]!.layers[0]!.tracks[0]!.keyframes[1]!.value = 30; return project; });
      await edit((project) => { const selected = project.scenes[0]!.layers[0]!; selected.trackGroups = [{ id: 'position', locked: true }]; selected.tracks[0]!.group = 'position'; return project; });
      await expect(edit((project) => { project.scenes[0]!.layers[0]!.tracks = []; return project; })).rejects.toMatchObject({ code: 'TRACK_GROUP_LOCKED' });
      await edit((project) => { project.scenes[0]!.layers[0]!.trackGroups![0]!.locked = false; return project; });
      await edit((project) => { project.scenes[0]!.layers[0]!.tracks = []; return project; });
      const editsFile = path.join(directory, 'track-edits.json');
      await writeFile(editsFile, JSON.stringify([{ op: 'property', target: { kind: 'scene', id: 'intro', layerId: 'accent' }, path: ['propertyLinks'], value: [{ target: 'transform.x', sourceLayerId: 'title', sourceProperty: 'transform.x', scale: 1, offset: 13, enabled: true }] }]));
      await runProcess(process.execPath, [path.resolve('dist/cli.js'), 'edit', directory, '--edits', editsFile, '--expected-revision', (await readProjectSnapshot(directory)).revision]);
      expect((await readProjectSnapshot(directory)).sourceProject.scenes[0]!.layers.find((layer) => layer.id === 'accent')!.propertyLinks![0]!.offset).toBe(13);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
