import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { projectSchema } from '../src/ir/schema.js';
import { renderAudio } from '../src/engine/audio.js';
import { runProcess } from '../src/engine/process.js';

it('renders four isolated stems that reconstruct a low-level mix, retaining ducking and metadata', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-stems-test-'));
  try {
    const kinds = ['music', 'voice', 'sfx', 'source'] as const;
    for (const [index, kind] of kinds.entries()) await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${220 + index * 220}:sample_rate=48000:duration=4`, '-c:a', 'pcm_f32le', path.join(directory, kind + '.wav')]);
    const project = projectSchema.parse({ schemaVersion: 1, id: 'stems', title: 'Stem reconstruction', width: 100, height: 100, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, metadata: { artist: 'Native QA', copyright: 'Test fixture' },
      scenes: [{ id: 'main', purpose: 'Stems', duration: 4, background: '#000', layers: [{ id: 'background', type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#000' }] }],
      audio: kinds.map((kind) => ({ id: kind, kind, src: kind + '.wav', start: kind === 'voice' ? 1 : 0, duration: kind === 'voice' ? 2 : 4, duckUnderVoice: kind === 'music' || kind === 'sfx' })),
    });
    const buffers: Buffer[] = [];
    for (const kind of [...kinds, undefined]) {
      const name = kind ?? 'mix', destination = path.join(directory, name + '-out.wav');
      await renderAudio(project, directory, destination, kind ? { stem: kind } : {});
      const decoded = path.join(directory, name + '.pcm');
      await runProcess('ffmpeg', ['-v', 'error', '-i', destination, '-f', 'f32le', '-c:a', 'pcm_f32le', decoded]);
      buffers.push(await readFile(decoded));
      const info = JSON.parse((await runProcess('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', destination])).stdout) as { format: { tags: Record<string, string>; duration: string }; streams: Array<{ codec_name: string }> };
      expect(info.format.tags.artist).toBe('Native QA');
      expect(info.format.tags.title).toBe('Stem reconstruction');
      expect(Number(info.format.duration)).toBeCloseTo(4, 4);
      if (kind) expect(info.streams[0]?.codec_name).toBe('pcm_f32le');
    }
    const mixed = buffers[4]!;
    expect(buffers.every((buffer) => buffer.length === mixed.length)).toBe(true);
    let largestError = 0;
    for (let offset = 0; offset < mixed.length; offset += 4) {
      const sum = buffers.slice(0, 4).reduce((value, buffer) => value + buffer.readFloatLE(offset), 0);
      largestError = Math.max(largestError, Math.abs(sum - mixed.readFloatLE(offset)));
    }
    expect(largestError).toBeLessThan(0.0001);
    await expect(renderAudio(project, directory, path.join(directory, 'bad.flac'), { stem: 'music' })).rejects.toMatchObject({ code: 'INVALID_STEM_OUTPUT' });
    const oversized = structuredClone(project); oversized.scenes[0]!.duration = 100_000;
    await expect(renderAudio(oversized, directory, path.join(directory, 'oversized.wav'))).rejects.toMatchObject({ code: 'AUDIO_PREPARATION_LIMIT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
