import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileCustomLibrary, loadMotionLibraries, saveMotionLibrary } from '../src/catalog/custom.js';
import { compileProjectMotions } from '../src/engine/motion.js';
import { loadProject } from '../src/ir/loader.js';
import { startStudio } from '../src/studio/server.js';
import type { AgentRuntime } from '../src/agent/runtime.js';

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const library = {
  schemaVersion: 1 as const, id: 'brand-motion', title: 'Brand Motion', version: '1.0.0',
  motions: [{
    id: 'soft-rise', title: 'Soft rise', roles: ['entrance'], energy: ['balanced'] as const,
    signature: 'A clean vertical entrance.', duration: [0.3, 0.8] as [number, number], cost: 1 as const,
    accessibility: ['Respect reduced motion'],
    tracks: { y: [{ at: 0, value: 36, scaleWithIntensity: true }, { at: 1, value: 0, ease: 'cubic-out' as const }], opacity: [{ at: 0, value: 0 }, { at: 0.7, value: 1, ease: 'cubic-out' as const }] },
  }],
};

describe('custom motion libraries', () => {
  it('validates, namespaces, persists, reloads, and compiles declarative recipes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-library-'));
    cleanup.push(directory);
    await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
    const compiled = compileCustomLibrary(library);
    expect(compiled.recipes[0]).toMatchObject({ id: 'brand-motion:soft-rise', source: 'custom', libraryTitle: 'Brand Motion' });
    await saveMotionLibrary(directory, library);
    const catalog = await loadMotionLibraries(directory);
    expect(catalog.libraries).toEqual([expect.objectContaining({ id: 'brand-motion', motions: 1 })]);
    const loaded = await loadProject(directory);
    const source = structuredClone(loaded.sourceProject);
    source.scenes[0]!.layers[0]!.motion = [{ recipe: 'brand-motion:soft-rise', start: 0, duration: 0.5, intensity: 1 }];
    const project = compileProjectMotions(source, catalog.motions);
    expect(project.scenes[0]!.layers[0]!.transform.y).toMatchObject({ keyframes: [{ at: 0, value: 36 }, { at: 0.5, value: 0 }] });
    expect(JSON.parse(await readFile(path.join(directory, '.genmotion', 'motions', 'brand-motion.json'), 'utf8'))).toMatchObject({ schemaVersion: 1, id: 'brand-motion' });
  });

  it('rejects executable or malformed library data', () => {
    expect(() => compileCustomLibrary({ ...library, run: 'process.exit()' })).toThrow();
    expect(() => compileCustomLibrary({ ...library, motions: [{ ...library.motions[0], tracks: { x: [{ at: 1, value: 0 }, { at: 0, value: 1 }] } }] })).toThrow(/increasing/);
  });

  it('imports and exposes a library through the authenticated Studio API', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-library-api-'));
    cleanup.push(directory);
    await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
    const agent: AgentRuntime = { hosts: () => Promise.resolve([]), run: () => Promise.reject(new Error('not used')), close: () => Promise.resolve() };
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: agent });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const response = await fetch(`${studio.url}/api/motion-libraries`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-genmotion-token': token }, body: JSON.stringify(library) });
      expect(response.status).toBe(201);
      const bootstrap = await fetch(`${studio.url}/api/bootstrap`).then((item) => item.json()) as { catalog: { motions: Array<{ id: string }>; motionLibraries: Array<{ id: string }> } };
      expect(bootstrap.catalog.motions).toContainEqual(expect.objectContaining({ id: 'brand-motion:soft-rise' }));
      expect(bootstrap.catalog.motionLibraries).toContainEqual(expect.objectContaining({ id: 'brand-motion' }));
    } finally { await studio.close(); }
  });
});
