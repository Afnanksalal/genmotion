import { describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadProject } from '../src/ir/loader.js';
import { readProjectSnapshot, commitProject } from '../src/ir/store.js';
import { createProjectBundle, restoreProjectBundle, verifyProjectBundle } from '../src/ir/bundle.js';
import { renderFramePng } from '../src/engine/draw.js';
import { runProcess } from '../src/engine/process.js';
import { visualEffectSchema, visualEffectTypeSchema } from '../src/ir/schema.js';
import { applyVisualEffects, visualEffectCapabilities } from '../src/engine/effects.js';
import { createCanvas } from '@napi-rs/canvas';

async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), 'genmotion-checklist-')); const project = path.join(root, 'project'); await cp(path.resolve('tests/fixtures/basic'), project, { recursive: true }); return { root, project }; }
async function cleanup(root: string) { const relative = path.relative(os.tmpdir(), root); if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(root).startsWith('genmotion-checklist-')) await rm(root, { recursive: true, force: true }); }

describe('completed checklist cross-surface contracts', () => {
  it('restores editable bundles without altering immutable source or native output', async () => {
    const { root, project } = await fixture();
    try {
      const original = await loadProject(project), bundle = await createProjectBundle(original, path.join(root, 'bundles'));
      const restored = await restoreProjectBundle(bundle.directory, path.join(root, 'restored'));
      const loaded = await loadProject(restored.directory);
      expect((await renderFramePng(original.project, project, 15)).equals(await renderFramePng(loaded.project, loaded.projectDir, 15))).toBe(true);
      const snapshot = await readProjectSnapshot(restored.directory);
      await commitProject(restored.directory, { expectedRevision: snapshot.revision, update: document => ({ ...document, title: 'Editable copy' }) });
      expect((await verifyProjectBundle(bundle.directory)).id).toBe(bundle.manifest.id);
      await expect(restoreProjectBundle(bundle.directory, restored.directory)).rejects.toMatchObject({ code: 'BUNDLE_DESTINATION_EXISTS' });
    } finally { await cleanup(root); }
  });

  it('exercises CLI effect discovery, LUT import, production actions and bundle round trips', async () => {
    const { root, project } = await fixture();
    const cli = async (...args: string[]) => JSON.parse((await runProcess(process.execPath, [path.resolve('dist/cli.js'), ...args])).stdout) as Record<string, unknown>;
    try {
      const catalog = await cli('effects'); expect(catalog).toHaveLength(64);
      const cube = path.join(root, 'identity.cube'); await writeFile(cube, 'LUT_1D_SIZE 2\n0 0 0\n1 1 1\n');
      expect(await cli('lut-import', project, cube, '--input-space', 'srgb', '--output-space', 'srgb')).toHaveProperty('lut.source.sha256');
      const action = path.join(root, 'configure.json'); await writeFile(action, JSON.stringify({ action: 'configure', kind: 'music-film' }));
      const state = await cli('production', project, '--action-file', action, '--expected-revision', (await readProjectSnapshot(project)).revision);
      expect(state).toHaveProperty('state.workflow', 'music-film');
      expect((state.state as { capabilities: unknown[] }).capabilities).toContainEqual({ name: 'beat-analysis', available: true });
      const bundle = await cli('bundle', project, '--output', path.join(root, 'bundles'));
      expect(await cli('bundle-verify', String(bundle.directory))).toHaveProperty('id');
      const restored = await cli('bundle-restore', String(bundle.directory), '--output', path.join(root, 'restored'));
      expect((await loadProject(String(restored.directory))).project.productionWorkflow?.kind).toBe('music-film');
    } finally { await cleanup(root); }
  }, 60000);

  it('exercises MCP effects, LUTs, revisioned markers, workflows and verified bundles', async () => {
    const { root, project } = await fixture();
    const client = new Client({ name: 'checklist-contract', version: '1' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/mcp.js')], cwd: root, stderr: 'pipe' });
    try {
      await client.connect(transport);
      const call = async (name: string, args: Record<string, unknown>) => { const result = await client.callTool({ name, arguments: args }); expect(result.isError, JSON.stringify(result.content)).not.toBe(true); return result.structuredContent as Record<string, unknown>; };
      expect((await call('genmotion_effects', {})).effects).toHaveLength(64);
      const cube = path.join(root, 'identity.cube'); await writeFile(cube, 'LUT_1D_SIZE 2\n0 0 0\n1 1 1\n');
      expect(await call('genmotion_lut_import', { project, file: cube, inputColorSpace: 'srgb', outputColorSpace: 'srgb', interpolation: 'tetrahedral' })).toHaveProperty('lut.source.sha256');
      const markers = await call('genmotion_markers', { project, expectedRevision: (await readProjectSnapshot(project)).revision, markers: [{ id: 'beat', label: 'Beat', time: .5, kind: 'beat', sceneId: 'intro' }], ranges: [{ id: 'hold', label: 'Hold', start: .2, end: .8 }] });
      expect(markers.markers).toEqual([expect.objectContaining({ globalTime: .5 })]);
      expect(await call('genmotion_production', { project, expectedRevision: markers.revision, action: { action: 'configure', kind: 'explainer' } })).toHaveProperty('state.workflow', 'explainer');
      const bundle = await call('genmotion_bundle', { action: 'create', project, output: path.join(root, 'bundles') });
      expect(await call('genmotion_bundle', { action: 'verify', directory: bundle.directory })).toHaveProperty('id');
      expect(await call('genmotion_bundle', { action: 'restore', directory: bundle.directory, output: path.join(root, 'restored') })).toHaveProperty('sourceBundle');
    } finally { await client.close(); await cleanup(root); }
  }, 60000);

  it('evaluates declared treatment animation at arbitrary seek order and rejects unsupported controls', () => {
    const canvas = createCanvas(32, 32), context = canvas.getContext('2d'); context.fillStyle = '#f808'; context.fillRect(3, 3, 22, 22);
    for (const type of ['gaussian-blur', 'pixelate', 'bloom', 'noise', 'linear-reveal'] as const) {
      const values = type === 'pixelate' ? [2, 10] : type === 'gaussian-blur' ? [0, 5] : [0, 1];
      const effect = visualEffectSchema.parse({ id: 'animated', type, amount: { keyframes: [{ at: 0, value: values[0] }, { at: 1, value: values[1] }] } });
      const samples = new Map([0, .25, .75, 1].map(time => [time, applyVisualEffects(canvas, [effect], time, 81).toBuffer('image/png')]));
      for (const time of [1, .25, 0, .75]) expect(applyVisualEffects(canvas, [effect], time, 81).toBuffer('image/png').equals(samples.get(time)!)).toBe(true);
      expect(samples.get(0)!.equals(samples.get(1)!)).toBe(false);
    }
    for (const type of visualEffectTypeSchema.options) expect(visualEffectCapabilities(type).numericAnimation.every(name => visualEffectCapabilities(type).parameters.includes(name))).toBe(true);
    expect(visualEffectSchema.safeParse({ id: 'bad', type: 'brightness', frequency: 2 }).success).toBe(false);
    expect(visualEffectSchema.safeParse({ id: 'bad', type: 'tint', color: { keyframes: [{ at: 0, value: '#fff' }] } }).success).toBe(false);
  });
});
