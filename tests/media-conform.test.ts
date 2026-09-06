import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { conformMedia, mediaConformPlan } from '../src/engine/media-conform.js';
import { inspectMedia } from '../src/engine/media-probe.js';
import { runProcess } from '../src/engine/process.js';

describe('explicit native media conforming', () => {
  it.each(['h264', 'prores'] as const)('creates a tagged CFR %s derivative, preserves the source and refuses replacement', async (codec) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-conform-test-'));
    try {
      const source = path.join(directory, 'source.mp4'), destination = path.join(directory, codec === 'h264' ? 'derivative.mp4' : 'derivative.mov');
      await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x32:rate=24:duration=1', '-c:v', 'libx264', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', source]);
      const original = await readFile(source), info = await inspectMedia(source);
      expect(mediaConformPlan(info, { fps: 12, width: 32, height: 16, codec }).algorithm).toBe('none');
      const result = await conformMedia(source, destination, { fps: 12, width: 32, height: 16, codec });
      expect(result.probe.streams[0]!.video).toMatchObject({ width: 32, height: 16, averageFrameRate: 12, colorTransfer: 'bt709' });
      expect((await readFile(source)).equals(original)).toBe(true);
      const derivative = await readFile(destination);
      await expect(conformMedia(source, destination, { fps: 12, codec })).rejects.toThrow(/exists/);
      expect((await readFile(destination)).equals(derivative)).toBe(true);
      const controller = new AbortController(); controller.abort();
      await expect(conformMedia(source, path.join(directory, codec === 'h264' ? 'cancelled.mp4' : 'cancelled.mov'), { fps: 12, codec }, { signal: controller.signal })).rejects.toThrow(/abort/i);
      const untagged = structuredClone(info); untagged.streams[0]!.video!.colorTransfer = null;
      expect(() => mediaConformPlan(untagged, { fps: 12 })).toThrow(/declared/);
      const hdr = structuredClone(info); hdr.streams[0]!.video!.colorTransfer = 'smpte2084';
      expect(mediaConformPlan(hdr, { fps: 12 }).algorithm).toBe('hable'); expect(() => mediaConformPlan(hdr, { fps: 12, toneMap: 'none' })).toThrow(/tone-mapping/);
    } finally {
      const relative = path.relative(os.tmpdir(), directory);
      if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('genmotion-conform-test-')) await rm(directory, { recursive: true, force: true });
    }
  }, 90000);
});
