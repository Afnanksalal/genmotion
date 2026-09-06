import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeImageCache, prepareVideoAssets, prepareVideoLayer, videoCacheRoot, videoFramePath } from '../src/engine/assets.js';
import { runProcess } from '../src/engine/process.js';
import { loadProject } from '../src/ir/loader.js';
import { videoLayerSchema } from '../src/ir/schema.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });
async function temporary(): Promise<string> { const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-assets-')); directories.push(directory); return directory; }
async function png(file: string, width = 8, height = 8): Promise<void> { const canvas = createCanvas(width, height); canvas.getContext('2d').fillRect(0, 0, width, height); await writeFile(file, canvas.toBuffer('image/png')); }

describe('bounded decoded media cache', () => {
  it('evicts by bytes and recency, reloads changed files, and does not retain oversized images', async () => {
    const directory = await temporary();
    const [a, b, c, large] = ['a', 'b', 'c', 'large'].map((name) => path.join(directory, name + '.png')) as [string, string, string, string];
    await Promise.all([png(a), png(b), png(c), png(large, 30, 30)]);
    const cache = new NativeImageCache(512, 2);
    const first = await cache.load(a); const second = await cache.load(b);
    expect(await cache.load(a)).toBe(first);
    await cache.load(c);
    expect(cache.byteLength).toBe(512);
    expect(await cache.load(b)).not.toBe(second);
    const oversized = await cache.load(large);
    expect(oversized.width).toBe(30);
    expect(cache.byteLength).toBeLessThanOrEqual(512);
    expect(cache.size).toBeLessThanOrEqual(2);
    await png(a, 9, 8);
    expect((await cache.load(a)).width).toBe(9);
    cache.clear(); expect(cache.byteLength).toBe(0); expect(cache.size).toBe(0);
    await writeFile(a, 'not an image');
    await expect(cache.load(a)).rejects.toThrow(); expect(cache.size).toBe(0);
    await png(a); expect((await cache.load(a)).width).toBe(8);
  });

  it('isolates same-ID video variants, respects output-time retiming and cleans failed preparations', async () => {
    const directory = await temporary();
    const source = path.join(directory, 'source.mp4');
    await runProcess('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
    const { project } = await loadProject('tests/fixtures/basic'); project.fps = 10;
    const layer = videoLayerSchema.parse({ id: 'shared', type: 'video', src: 'source.mp4', x: 0, y: 0, width: 160, height: 90, duration: 1, playbackRate: 2 });
    const slow = { ...layer, playbackRate: 0.5 };
    await Promise.all([prepareVideoLayer(project, directory, layer, 1), prepareVideoLayer(project, directory, slow, 1)]);
    expect(videoFramePath(directory, layer, 0.9, 10)).not.toBe(videoFramePath(directory, slow, 0.9, 10));
    for (const candidate of [layer, slow]) expect((await readdir(path.dirname(videoFramePath(directory, candidate, 0.9, 10)))).filter((file) => file.endsWith('.png'))).toHaveLength(10);
    const impossible = { ...layer, duration: 5 };
    await expect(prepareVideoLayer(project, directory, impossible, 5)).rejects.toMatchObject({ code: 'VIDEO_SOURCE_TOO_SHORT' });
    const cancelled = { ...layer, trimStart: 0.1 };
    await expect(prepareVideoLayer(project, directory, cancelled, 1, { timeoutMs: 1 })).rejects.toMatchObject({ code: 'PROCESS_TIMEOUT' });
    const variants = await readdir(videoCacheRoot(directory, layer.id));
    for (const variant of variants) expect((await readdir(path.join(videoCacheRoot(directory, layer.id), variant))).some((entry) => entry.startsWith('pending-') || entry.endsWith('.tmp'))).toBe(false);
    project.scenes[0]!.layers = [];
    project.compositions = [{ id: 'nested', width: 160, height: 90, duration: 1, layers: [{ ...layer, id: 'nested-video' }] }];
    await prepareVideoAssets(project, directory);
    expect(await readdir(path.dirname(videoFramePath(directory, { ...layer, id: 'nested-video' }, 0, 10)))).toHaveLength(10);
  });
});
