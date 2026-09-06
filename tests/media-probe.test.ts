import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectMedia } from '../src/engine/media-probe.js';
import { runProcess } from '../src/engine/process.js';
import { prepareVideoAssets, videoFramePath } from '../src/engine/assets.js';
import { projectSchema } from '../src/ir/schema.js';
import { audioTimeSampler } from '../src/engine/audio-time-map.js';

describe('media metadata and looping', () => {
  it('reports stream contracts and prepares a repeated short source', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-media-probe-test-'));
    try {
      const source = path.join(directory, 'short.mp4');
      await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=32x32:rate=4:duration=0.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
      const info = await inspectMedia(source);
      expect(info.streams.find((stream) => stream.video)?.video).toMatchObject({ width: 32, height: 32, displayWidth: 32, displayHeight: 32, averageFrameRate: 4, hdrTransfer: null });
      expect(info.streams.find((stream) => stream.audio)?.audio?.channels).toBe(1);
      const project = projectSchema.parse({ schemaVersion: 1, id: 'loop', title: 'Loop', width: 64, height: 64, fps: 4, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Loop', duration: 1.5, background: '#000', layers: [{ id: 'video', type: 'video', src: 'short.mp4', x: 0, y: 0, width: 32, height: 32, loop: true }] }] });
      await prepareVideoAssets(project, directory);
      const video = project.scenes[0]!.layers[0]!; if (video.type !== 'video') throw new Error('Unexpected fixture');
      const { stat } = await import('node:fs/promises');
      expect((await stat(videoFramePath(directory, video, 1.25, 4, 1.5))).size).toBeGreaterThan(0);
      const sample = audioTimeSampler({ sceneStart: 0, sceneDuration: 1.5, chain: [], video, containerDuration: 1.5, sourceDuration: .5, seed: 0, fps: 4 });
      expect(sample(1.125)?.sourceTime).toBeCloseTo(.125, 8);
    } finally {
      const relative = path.relative(os.tmpdir(), directory);
      if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('genmotion-media-probe-test-')) await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
