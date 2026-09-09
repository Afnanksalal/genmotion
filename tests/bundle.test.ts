import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProjectBundle, verifyProjectBundle } from '../src/ir/bundle.js';
import { loadProject, loadProjectDocument } from '../src/ir/loader.js';
import { commitProject, readProjectSnapshot } from '../src/ir/store.js';
import { renderFrame } from '../src/engine/draw.js';
import { projectSchema } from '../src/ir/schema.js';

async function image(file: string, color: string) {
  const canvas = createCanvas(8, 8), context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 8, 8);
  await writeFile(file, canvas.toBuffer('image/png'));
}
describe('content-addressed project bundles', () => {
  it('freezes dependencies and inactive variants, reuses exact identities and verifies relocated native output', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'genmotion-bundle-'));
    try {
      const source = path.join(root, 'source'); await mkdir(path.join(source, 'assets'), { recursive: true });
      await image(path.join(source, 'assets', 'red.png'), '#ff0000'); await image(path.join(source, 'assets', 'blue.png'), '#0000ff');
      const project = projectSchema.parse({ schemaVersion: 1, id: 'bundle', title: 'Bundle', width: 100, height: 100, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, parameters: [{ id: 'art', label: 'Artwork', type: 'asset', default: 'assets/red.png' }], variants: [{ id: 'blue', label: 'Blue', values: { art: 'assets/blue.png' } }], scenes: [{ id: 'main', purpose: 'Frozen artwork', duration: 1, background: '#000', layers: [{ id: 'image', type: 'image', x: 0, y: 0, width: 100, height: 100, src: 'assets/red.png', bindings: { src: 'art' } }] }] });
      await writeFile(path.join(source, 'genmotion.json'), JSON.stringify(project));
      const loaded = await loadProject(source), first = await createProjectBundle(loaded, path.join(root, 'bundles'));
      expect(first.manifest.files.map((entry) => entry.path)).toEqual(['assets/blue.png', 'assets/red.png', 'genmotion.json']);
      const again = await createProjectBundle(loaded, path.join(root, 'bundles'));
      expect(again).toMatchObject({ reused: true, directory: first.directory });
      const relocated = path.join(root, 'relocated'); await cp(first.directory, relocated, { recursive: true });
      const frozen = await loadProject(relocated);
      expect((await renderFrame(loaded.project, source, 0)).equals(await renderFrame(frozen.project, relocated, 0))).toBe(true);
      await image(path.join(source, 'assets', 'red.png'), '#00ff00');
      expect((await renderFrame(frozen.project, relocated, 0))[0]).toBe(255);
      expect((await createProjectBundle(loaded, path.join(root, 'bundles'))).manifest.id).not.toBe(first.manifest.id);
      const snapshot = await readProjectSnapshot(relocated);
      await expect(commitProject(relocated, { expectedRevision: snapshot.revision, update: (document) => ({ ...document, title: 'Mutation' }) })).rejects.toMatchObject({ code: 'BUNDLE_READ_ONLY' });
      await image(path.join(relocated, 'assets', 'red.png'), '#0000ff');
      await expect(loadProject(relocated)).rejects.toMatchObject({ code: 'BUNDLE_INTEGRITY_FAILED' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('cleans failed staging and enforces cancellation and byte/file budgets', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'genmotion-bundle-limits-'));
    try {
      const loaded = await loadProject(path.resolve('tests/fixtures/basic'));
      await expect(createProjectBundle(loaded, root, { maxBytes: 1 })).rejects.toMatchObject({ code: 'BUNDLE_LIMIT' });
      expect(await readdir(root)).toEqual([]);
      await expect(createProjectBundle(loaded, root, { signal: AbortSignal.abort() })).rejects.toThrow('aborted');
      const malformed = structuredClone(loaded.sourceProject);
      malformed.audio = [{ id: 'missing', src: 'missing.wav', start: 0, trimStart: 0, volume: 1, fadeIn: 0, fadeOut: 0, loop: false, duckUnderVoice: false, muted: false, solo: false, pan: 0, balance: 0, locked: false, kind: 'music' }];
      const absent = await loadProjectDocument(malformed, loaded.projectFile);
      await expect(createProjectBundle(absent, root)).rejects.toThrow();
      expect(await readdir(root)).toEqual([]);
      const valid = await createProjectBundle(loaded, root);
      await expect(verifyProjectBundle(valid.directory, { maxBytes: 1 })).rejects.toMatchObject({ code: 'BUNDLE_LIMIT' });
      await expect(verifyProjectBundle(valid.directory, { maxBytes: NaN })).rejects.toMatchObject({ code: 'BUNDLE_LIMIT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
