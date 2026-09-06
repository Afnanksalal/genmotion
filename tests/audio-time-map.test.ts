import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { audioTimeSampler, type AudioTimeMap } from '../src/engine/audio-time-map.js';
import { compositionLayerSchema, compositionSchema, projectSchema, videoLayerSchema } from '../src/ir/schema.js';
import { renderAudio } from '../src/engine/audio.js';
import { runProcess } from '../src/engine/process.js';

const video = videoLayerSchema.parse({ id: 'video', type: 'video', src: 'source.mp4', x: 0, y: 0, width: 64, height: 64, duration: 2 });
const composition = compositionSchema.parse({ id: 'nested', width: 64, height: 64, duration: 2, fps: 12, layers: [video] });
const instance = compositionLayerSchema.parse({ id: 'instance', type: 'composition', compositionId: 'nested', x: 0, y: 0, width: 64, height: 64, duration: 8 });
const base: AudioTimeMap = { sceneStart: 0, sceneDuration: 8, video, containerDuration: 2, seed: 1, fps: 30, chain: [{ layer: instance, composition }] };

describe('nested source-audio clocks', () => {
  it('keeps slow audio clocks continuous independently of local video FPS', () => {
    const sample = audioTimeSampler({ ...base, chain: [{ composition, layer: { ...instance, timeScale: .25 } }] });
    expect(sample(1)?.sourceTime).toBeCloseTo(.25, 10);
    for (let index = 0; index < 12; index += 1) expect(sample(1 + index / 48000)?.sourceTime).toBeCloseTo(.25 + index / 192000, 10);
  });
  it('maps reverse and ping-pong playback while making explicit freezes and end holds silent', () => {
    const reverse = audioTimeSampler({ ...base, chain: [{ composition, layer: { ...instance, timeOffset: 1.5, timeScale: -1 } }] });
    expect(reverse(.25)?.sourceTime).toBeCloseTo(1.25, 10); expect(reverse(3)).toBeNull();
    const loop = audioTimeSampler({ ...base, chain: [{ composition, layer: { ...instance, loop: true, loopMode: 'ping-pong' } }] });
    expect(loop(2.25)?.sourceTime).toBeCloseTo(1.75, 10); expect(loop(4.25)?.sourceTime).toBeCloseTo(.25, 10);
    const freeze = audioTimeSampler({ ...base, chain: [{ composition, layer: { ...instance, freeze: { frame: 6, from: .25, to: .75 } } }] });
    expect(freeze(.5)).toBeNull(); expect(freeze(.8)?.sourceTime).toBeCloseTo(.8, 10); expect(freeze(3)).toBeNull();
  });
  it('renders nested video source audio through the shared mix with freeze silence', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-nested-audio-'));
    try {
      const source = path.join(directory, 'source.mp4');
      await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=12:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', source]);
      const project = projectSchema.parse({ schemaVersion: 1, id: 'nested-audio', title: 'Nested audio', width: 64, height: 64, fps: 30, brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, compositions: [composition], scenes: [{ id: 'main', purpose: 'Nested audio', duration: 2, background: '#000', layers: [{ ...instance, duration: 2, freeze: { frame: 6, from: .5, to: 1 } }] }] });
      await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(project));
      const output = path.join(directory, 'mix.wav'), raw = path.join(directory, 'mix.f32');
      const result = await renderAudio(project, directory, output); expect(result.tracks).toBe(1);
      await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', output, '-f', 'f32le', '-acodec', 'pcm_f32le', raw]);
      const bytes = await readFile(raw);
      const rms = (from: number, to: number): number => { let sum = 0, count = 0; for (let frame = Math.floor(from * 48000); frame < Math.floor(to * 48000); frame += 1) { const value = bytes.readFloatLE(frame * 8); sum += value * value; count += 1; } return Math.sqrt(sum / count); };
      expect(rms(.1, .4)).toBeGreaterThan(.02); expect(rms(.6, .9)).toBeLessThan(1e-5); expect(rms(1.1, 1.4)).toBeGreaterThan(.02);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 120000);
});
