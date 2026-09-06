import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAlphaOutput, flattenRgbaInPlace } from '../src/engine/alpha-output.js';
import { loadProject } from '../src/ir/loader.js';
import { renderProject } from '../src/engine/render.js';
import { runProcess } from '../src/engine/process.js';

describe('explicit alpha output', () => {
  it('composites straight RGBA and rejects unsupported alpha contracts', () => {
    const pixels = Uint8Array.from([255, 0, 0, 128, 255, 255, 255, 0]);
    flattenRgbaInPlace(pixels, [0, 0, 255]);
    expect([...pixels]).toEqual([128, 0, 127, 255, 0, 0, 255, 255]);
    expect(resolveAlphaOutput('vp9')).toEqual({ mode: 'preserve' });
    expect(resolveAlphaOutput('prores', 'preserve')).toEqual({ mode: 'preserve' });
    expect(() => resolveAlphaOutput('h264', 'preserve')).toThrow(/requires/);
    expect(() => resolveAlphaOutput('vp9', 'preserve', '#fff')).toThrow(/background/i);
    expect(() => resolveAlphaOutput('h264', 'flatten', 'transparent')).toThrow(/opaque/);
  });
  it.each(['vp9', 'prores'] as const)('round-trips transparent and translucent pixels through %s', async codec => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-alpha-'));
    try {
      const loaded = await loadProject('tests/fixtures/basic');
      loaded.project = structuredClone(loaded.sourceProject); loaded.project.fps = 1;
      const scene = loaded.project.scenes[0]!; scene.background = 'transparent';
      const shape = scene.layers.find(layer => layer.type === 'shape')!;
      if (shape.type !== 'shape') throw new Error('Fixture shape missing');
      shape.shape = 'rect'; shape.x = 20; shape.y = 20; shape.width = 100; shape.height = 100; shape.fill = '#ff000080'; shape.strokeWidth = 0; shape.motion = []; shape.tracks = [];
      scene.layers = [shape];
      const output = path.join(directory, codec === 'vp9' ? 'alpha.webm' : 'alpha.mov');
      const result = await renderProject(loaded, { output, codec, alphaMode: 'preserve', quality: 'draft', workers: 1 });
      expect(result.probe.alphaSignaled).toBe(true);
      const raw = path.join(directory, 'frame.rgba');
      await runProcess('ffmpeg', ['-v', 'error', ...(codec === 'vp9' ? ['-c:v', 'libvpx-vp9'] : []), '-i', output, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', raw]);
      const pixels = await readFile(raw);
      expect(pixels[3]).toBe(0);
      expect(pixels[(60 * 320 + 60) * 4 + 3]).toBeGreaterThanOrEqual(125);
      expect(pixels[(60 * 320 + 60) * 4 + 3]).toBeLessThanOrEqual(131);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
