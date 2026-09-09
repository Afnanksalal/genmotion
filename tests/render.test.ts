import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { renderFramePng } from '../src/engine/draw.js';
import { defaultVideoExtension, renderProject, resolveRenderResolution, resolveRenderLimits, validateOutputContainer, type RenderStage, type VideoCodec } from '../src/engine/render.js';
import { runProcess } from '../src/engine/process.js';
import { audioEffectsSchema } from '../src/ir/audio-effects.js';

const fixture = path.resolve('tests/fixtures/basic');
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('native renderer', () => {
  it.each(['h264', 'h265', 'vp9', 'prores'] satisfies VideoCodec[])('encodes and decodes %s with audio in its delivery container', async (codec) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-codec-'));
    temporary.push(directory);
    await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(directory, 'tone.wav')]);
    const loaded = await loadProject(fixture);
    loaded.projectDir = directory;
    loaded.project.fps = 4;
    loaded.project.audio = [{ id: 'tone', src: 'tone.wav', start: 0, trimStart: 0, volume: 0.2, pan: 0, balance: 0, locked: false, fadeIn: 0, fadeOut: 0, muted: false, solo: false, loop: false, duckUnderVoice: false, kind: 'music' }];
    Object.assign(loaded.project.audio[0]!, { gainDb: -3, reverse: true, effects: audioEffectsSchema.parse([
      { id: 'hp', type: 'highpass', frequency: 80 }, { id: 'lp', type: 'lowpass', frequency: 8000 },
      { id: 'eq', type: 'equalizer', frequency: 440, gainDb: -3 }, { id: 'gate', type: 'gate', thresholdDb: -50 },
      { id: 'compressor', type: 'compressor', ratio: 2 }, { id: 'limiter', type: 'limiter', ceilingDb: -2 },
    ]) });
    const result = await renderProject(loaded, { output: path.join(directory, 'master' + defaultVideoExtension(codec)), quality: 'draft', codec, workers: 1 });
    expect(result.probe).toMatchObject({ videoCodec: codec === 'h265' ? 'hevc' : codec, audioCodec: codec === 'vp9' ? 'opus' : 'aac', width: 320, height: 180, frameRate: 4 });
    expect(result.manifest).toMatchObject({ version: 1, inputSha256: expect.stringMatching(/^[a-f0-9]{64}$/), artifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(result.manifest.artifactSha256).toBe(createHash('sha256').update(await readFile(result.output)).digest('hex'));
    await runProcess('ffmpeg', ['-v', 'error', '-xerror', '-i', result.output, '-f', 'null', '-']);
  }, 30_000);

  it('rejects an incompatible delivery container before rendering', () => {
    expect(() => validateOutputContainer('master.mp4', 'vp9')).toThrow(/requires .webm/);
    expect(() => validateOutputContainer('master.webm', 'prores')).toThrow(/requires .mov/);
  });

  it('enforces deadlines and rejects competing writers without replacing an accepted master', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-deadline-'));
    temporary.push(directory);
    const output = path.join(directory, 'master.mp4');
    await writeFile(output, 'accepted master');
    const loaded = await loadProject(fixture);
    const controller = new AbortController();
    const first = renderProject(loaded, { output, quality: 'draft', signal: controller.signal });
    await expect(renderProject(loaded, { output, quality: 'draft' })).rejects.toMatchObject({ code: 'OUTPUT_BUSY' });
    controller.abort();
    await expect(first).rejects.toMatchObject({ code: 'RENDER_ABORTED' });
    await expect(renderProject(loaded, { output, quality: 'high', timeoutMs: 1 })).rejects.toMatchObject({ code: 'RENDER_TIMEOUT' });
    expect(await readFile(output, 'utf8')).toBe('accepted master');
    expect(await readdir(directory)).toEqual(['master.mp4']);
  });

  it('reserves only the workers that fit the frame count and byte limits', () => {
    expect(resolveRenderLimits({ width: 1920, height: 1080 }, { workers: 8, maxBufferedFrames: 4, maxBufferedBytes: 1920 * 1080 * 4 * 2 })).toMatchObject({ workers: 2, capacity: 2 });
    expect(() => resolveRenderLimits({ width: 1920, height: 1080 }, { maxBufferedBytes: 100 })).toThrow(/one output frame/);
    expect(() => resolveRenderLimits({ width: 320, height: 180 }, { workers: Number.NaN })).toThrow(/positive safe integer/);
  });

  it('preserves the accepted output and cleans staging on failure or cancellation in every stage', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-atomic-'));
    temporary.push(directory);
    const output = path.join(directory, 'master.mp4');
    await writeFile(output, 'accepted master');
    const loaded = await loadProject(fixture);
    loaded.project = { ...loaded.project, fps: 1 };
    for (const stage of ['preparing', 'rendering', 'encoding', 'mixing', 'verifying'] satisfies RenderStage[]) {
      const controller = new AbortController();
      await expect(renderProject(loaded, { output, quality: 'draft', workers: 1, signal: controller.signal, onProgress: (progress) => { if (progress.stage === stage) controller.abort(); } })).rejects.toMatchObject({ code: 'RENDER_ABORTED' });
      expect(await readFile(output, 'utf8')).toBe('accepted master');
      expect(await readdir(directory)).toEqual(['master.mp4']);
    }
    loaded.project = { ...loaded.project, audio: [{ id: 'missing', src: 'missing.wav', start: 0, trimStart: 0, volume: 1, pan: 0, balance: 0, locked: false, fadeIn: 0, fadeOut: 0, muted: false, solo: false, loop: false, duckUnderVoice: false, kind: 'music' }] };
    await expect(renderProject(loaded, { output, quality: 'draft', workers: 1 })).rejects.toThrow();
    expect(await readFile(output, 'utf8')).toBe('accepted master');
    expect(await readdir(directory)).toEqual(['master.mp4']);
  });

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
    expect(result.manifest.output).toMatchObject({ encodedSha256: result.manifest.artifactSha256, decodedVideoSha256: expect.stringMatching(/^[a-f0-9]{64}$/), fullyDecoded: true });
    expect(result.manifest.inputs).toMatchObject({ version: 1, dependencyHash: expect.stringMatching(/^[a-f0-9]{64}$/), excludedOutputs: [path.resolve(output)] });
    expect(result.manifest.adaptation).toMatchObject({ version: 1, ok: true, entries: 0, observations: 0 });
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

  it('rejects pre-cancelled work without creating an output', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-abort-'));
    temporary.push(directory);
    const controller = new AbortController();
    controller.abort();
    const output = path.join(directory, 'cancelled.mp4');
    await expect(renderProject(await loadProject(fixture), { output, quality: 'draft', signal: controller.signal })).rejects.toThrow(/aborted/i);
    expect(await readdir(directory)).toEqual([]);
  });

  it('removes partial outputs and intermediates when audio muxing fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-failed-mux-'));
    temporary.push(directory);
    const source = JSON.parse(await readFile(path.join(fixture, 'genmotion.json'), 'utf8')) as Record<string, unknown>;
    source.audio = [{ id: 'missing', src: 'missing.wav', start: 0, trimStart: 0, duration: 1, volume: 1, pan: 0, fadeIn: 0, fadeOut: 0, muted: false, solo: false, loop: false, duckUnderVoice: false, kind: 'music' }];
    await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(source));
    const output = path.join(directory, 'failed.mp4');
    await expect(renderProject(await loadProject(directory), { output, quality: 'draft', workers: 1 })).rejects.toThrow();
    expect((await readdir(directory)).filter((entry) => entry.endsWith('.mp4'))).toEqual([]);
  });
});
