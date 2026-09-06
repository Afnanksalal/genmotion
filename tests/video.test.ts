import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProcess } from '../src/engine/process.js';
import { loadProject } from '../src/ir/loader.js';
import { prepareVideoAssets } from '../src/engine/assets.js';
import { renderFramePng } from '../src/engine/draw.js';
import { renderProject } from '../src/engine/render.js';

describe('video media', () => {
  it('freezes source video frames locally and composites them deterministically', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-video-'));
    try {
      const video = path.join(directory, 'source.mp4');
      await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
      await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify({
        schemaVersion: 1, id: 'video-test', title: 'Video', width: 160, height: 90, fps: 10,
        brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
        scenes: [{ id: 'video', purpose: 'Composite video', duration: 1, background: '#000', layers: [{ id: 'source', type: 'video', src: 'source.mp4', x: 0, y: 0, width: 160, height: 90 }] }],
      }));
      const loaded = await loadProject(directory);
      await prepareVideoAssets(loaded.project, loaded.projectDir);
      const frame = await renderFramePng(loaded.project, loaded.projectDir, 5);
      expect(frame.length).toBeGreaterThan(1000);
      const rendered = await renderProject(loaded, { output: path.join(directory, 'silent-export.mp4'), quality: 'draft', workers: 1 });
      expect(rendered.probe.audioCodec).toBeUndefined();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('retimes video source audio while preserving pitch', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-source-audio-'));
    try {
      await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=160x90:rate=10:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', path.join(directory, 'source.mp4')]);
      await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify({ schemaVersion: 1, id: 'video-rate', title: 'Source audio rate', width: 160, height: 90, fps: 10,
        brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' },
        scenes: [{ id: 'main', purpose: 'Retimed audio', duration: 1, background: '#000', layers: [{ id: 'video', type: 'video', src: 'source.mp4', x: 0, y: 0, width: 160, height: 90, playbackRate: 2 }] }],
      }));
      const result = await renderProject(await loadProject(directory), { output: path.join(directory, 'master.mp4'), quality: 'draft', workers: 1 });
      expect(result.probe.audioCodec).toBe('aac');
      const decoded = path.join(directory, 'audio.f32');
      await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', result.output, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', decoded]);
      const pcm = await readFile(decoded);
      expect(pcm.length / 4 / 48000).toBeGreaterThan(0.95);
      let crossings = 0;
      for (let sample = 9601; sample < 38400; sample += 1) if (pcm.readFloatLE((sample - 1) * 4) <= 0 && pcm.readFloatLE(sample * 4) > 0) crossings += 1;
      expect(crossings / 0.6).toBeGreaterThan(420);
      expect(crossings / 0.6).toBeLessThan(460);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30_000);
});
