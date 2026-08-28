import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProcess } from '../src/engine/process.js';
import { loadProject } from '../src/ir/loader.js';
import { prepareVideoAssets } from '../src/engine/assets.js';
import { renderFramePng } from '../src/engine/draw.js';

describe('video media', () => {
  it('freezes source video frames locally and composites them deterministically', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-video-'));
    try {
      const video = path.join(directory, 'source.mp4');
      await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
      await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify({
        schemaVersion: 1, id: 'video-test', title: 'Video', width: 160, height: 90, fps: 10,
        brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
        scenes: [{ id: 'video', purpose: 'Composite video', duration: 1, background: '#000', layers: [{ id: 'source', type: 'video', src: 'source.mp4', x: 0, y: 0, width: 160, height: 90, volume: 0 }] }],
      }));
      const loaded = await loadProject(directory);
      await prepareVideoAssets(loaded.project, loaded.projectDir);
      const frame = await renderFramePng(loaded.project, loaded.projectDir, 5);
      expect(frame.length).toBeGreaterThan(1000);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
