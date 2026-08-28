import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { renderFramePng } from '../src/engine/draw.js';
import { renderProject } from '../src/engine/render.js';
import { runProcess } from '../src/engine/process.js';

const fixture = path.resolve('tests/fixtures/basic');
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('native renderer', () => {
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

  it('mixes a real audio track into the encoded video', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-audio-'));
    temporary.push(directory);
    const audio = path.join(directory, 'tone.wav');
    await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', audio]);
    const source = JSON.parse(await readFile(path.join(fixture, 'genmotion.json'), 'utf8')) as Record<string, unknown>;
    source.audio = [{ id: 'tone', src: 'tone.wav', start: 0, trimStart: 0, duration: 1, volume: 0.1, fadeIn: 0.05, fadeOut: 0.05, loop: false, duckUnderVoice: false, kind: 'music' }];
    await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(source));
    await writeFile(path.join(directory, 'tone.wav'), await readFile(audio));
    const loaded = await loadProject(directory);
    const output = path.join(directory, 'with-audio.mp4');
    await renderProject(loaded, { output, quality: 'draft', workers: 2 });
    const probe = await runProcess('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'json', output]);
    const parsed = JSON.parse(probe.stdout) as { streams: Array<{ codec_name: string }> };
    expect(parsed.streams[0]?.codec_name).toBe('aac');
  });
});
