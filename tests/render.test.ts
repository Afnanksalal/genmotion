import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { renderFramePng } from '../src/engine/draw.js';
import { renderProject, resolveRenderResolution } from '../src/engine/render.js';
import { runProcess } from '../src/engine/process.js';

const fixture = path.resolve('tests/fixtures/basic');
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('native renderer', () => {
  it('maps export quality to a real delivery resolution', () => {
    expect(resolveRenderResolution({ width: 320, height: 180 }, 'draft')).toEqual({ width: 320, height: 180 });
    expect(resolveRenderResolution({ width: 320, height: 180 }, 'standard')).toEqual({ width: 1280, height: 720 });
    expect(resolveRenderResolution({ width: 320, height: 180 }, 'high')).toEqual({ width: 1920, height: 1080 });
    expect(resolveRenderResolution({ width: 3840, height: 2160 }, 'high')).toEqual({ width: 3840, height: 2160 });
    expect(() => resolveRenderResolution({ width: 320, height: 180 }, 'high', { width: 1920, height: 1200 })).toThrow(/aspect ratio/i);
  });

  it('renders identical bytes for the same frame', async () => {
    const loaded = await loadProject(fixture);
    const first = await renderFramePng(loaded.project, loaded.projectDir, 14);
    const second = await renderFramePng(loaded.project, loaded.projectDir, 14);
    expect(createHash('sha256').update(first).digest('hex')).toBe(createHash('sha256').update(second).digest('hex'));
    expect(first.length).toBeGreaterThan(1000);
  });

  it('streams frames to a playable H.264 output', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-render-'));
    temporary.push(directory);
    const loaded = await loadProject(fixture);
    const output = path.join(directory, 'result.mp4');
    const result = await renderProject(loaded, { output, quality: 'draft', workers: 2 });
    expect(result.frames).toBe(30);
    const probe = await runProcess('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', output]);
    const parsed = JSON.parse(probe.stdout) as { streams: Array<{ codec_name: string; width: number; height: number }> };
    expect(parsed.streams[0]).toMatchObject({ codec_name: 'h264', width: 320, height: 180 });
  });

  it('renders high quality at a verified 1080p minimum instead of only changing compression', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-high-render-'));
    temporary.push(directory);
    const loaded = await loadProject(fixture);
    loaded.project = { ...loaded.project, fps: 1, scenes: loaded.project.scenes.map((scene) => ({ ...scene, duration: 1, transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' } })) };
    const result = await renderProject(loaded, { output: path.join(directory, 'high.mp4'), quality: 'high', workers: 1 });
    expect(result).toMatchObject({ width: 1920, height: 1080, quality: 'high', codec: 'h264' });
    const probe = await runProcess('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', result.output]);
    const parsed = JSON.parse(probe.stdout) as { streams: Array<{ width: number; height: number }> };
    expect(parsed.streams[0]).toMatchObject({ width: 1920, height: 1080 });
  });

  it('mixes, pans, and solos a real audio track into the encoded video', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-audio-'));
    temporary.push(directory);
    const audio = path.join(directory, 'tone.wav');
    await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', audio]);
    const source = JSON.parse(await readFile(path.join(fixture, 'genmotion.json'), 'utf8')) as Record<string, unknown>;
    source.audio = [
      { id: 'tone', src: 'tone.wav', start: 0, trimStart: 0, duration: 1, volume: 0.1, pan: 0.75, fadeIn: 0.05, fadeOut: 0.05, muted: false, solo: true, loop: false, duckUnderVoice: false, kind: 'music' },
      { id: 'excluded', src: 'missing.wav', start: 0, trimStart: 0, duration: 1, volume: 1, pan: 0, fadeIn: 0, fadeOut: 0, muted: false, solo: false, loop: false, duckUnderVoice: false, kind: 'sfx' },
    ];
    await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(source));
    await writeFile(path.join(directory, 'tone.wav'), await readFile(audio));
    const loaded = await loadProject(directory);
    const output = path.join(directory, 'with-audio.mp4');
    await renderProject(loaded, { output, quality: 'draft', workers: 2 });
    const probe = await runProcess('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name,channels', '-of', 'json', output]);
    const parsed = JSON.parse(probe.stdout) as { streams: Array<{ codec_name: string; channels: number }> };
    expect(parsed.streams[0]).toMatchObject({ codec_name: 'aac', channels: 2 });
    expect((await readdir(directory)).filter((entry) => entry.includes('.silent.'))).toEqual([]);
  });
});
