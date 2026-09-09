import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { createRenderPlan, verifyRenderPlanEnvironment } from '../src/ir/render-plan.js';

describe('deterministic render plan', () => {
  it('resolves delivery metadata and hashes frozen dependencies', async () => {
    const loaded = await loadProject('examples/native-milestones');
    const first = await createRenderPlan(loaded), second = await createRenderPlan(loaded);
    expect(first).toEqual(second);
    expect(first.preflight).toMatchObject({ width: 640, height: 360, fps: 30, duration: 4 });
    expect(first.selection.range).toEqual({ startFrame: 0, endFrame: 120 });
    expect(first.variantValues).toMatchObject({ accent: '#86efac' });
    expect(first.delivery).toMatchObject({ quality: 'high', codec: 'h264', container: 'mp4', dimensions: { width: 1920, height: 1080 }, fps: 30, color: { working: 'rgba8-srgb', output: 'bt709-sdr', alpha: { mode: 'flatten' } }, audio: { present: false, sampleRate: 48000, channels: 2, codec: 'aac' }, backend: { renderer: 'native-cpu', encoder: 'ffmpeg', hardwareAcceleration: false } });
    expect(first.delivery.output.identity).toMatch(/^[a-f0-9]{64}$/);
    expect(first.dependencies).toEqual([expect.objectContaining({ path: 'Inter.ttf', bytes: 876576, hash: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
    expect(first.dependencyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.reproducibility).toMatchObject({ node: process.version, platform: process.platform, architecture: process.arch, schemaVersion: 1, renderer: { name: 'native-cpu' }, encoder: { name: 'ffmpeg', version: expect.stringContaining('ffmpeg version') }, preparation: { modelDependencies: 'none', dependencyHash: first.dependencyHash } });
    expect(await verifyRenderPlanEnvironment(loaded, first)).toEqual({ compatible: true, mismatches: [] });
    const drifted = structuredClone(first); drifted.reproducibility.node = 'v0.0.0';
    expect(await verifyRenderPlanEnvironment(loaded, drifted)).toMatchObject({ compatible: false, mismatches: [expect.objectContaining({ field: 'node', expected: 'v0.0.0', actual: process.version })] });
  });
  it('plans selected ranges and rejects impossible delivery contracts', async () => {
    const loaded = await loadProject('examples/native-milestones');
    const selected = await createRenderPlan(loaded, { quality: 'draft', codec: 'vp9', filename: 'scene.webm', sceneId: 'typed-output', alphaMode: 'preserve' });
    expect(selected.selection).toMatchObject({ sceneId: 'typed-output', range: { startFrame: 60, endFrame: 120 } });
    expect(selected.delivery).toMatchObject({ dimensions: { width: 640, height: 360 }, color: { alpha: { mode: 'preserve' } }, output: { filename: 'scene.webm' } });
    await expect(createRenderPlan(loaded, { codec: 'h264', filename: 'bad.webm' })).rejects.toThrow(/requires/);
    await expect(createRenderPlan(loaded, { codec: 'h264', alphaMode: 'preserve' })).rejects.toThrow(/requires/);
  });
});
 
