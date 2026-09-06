import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { measureAudioFile, parseLoudnessReport } from '../src/engine/loudness.js';
import { renderAudio, measureProjectAudio, mixAudio } from '../src/engine/audio.js';
import { runProcess } from '../src/engine/process.js';
import { projectSchema } from '../src/ir/schema.js';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
describe('loudness delivery', () => {
  it('measures true peak, warns on clipping and preserves explicit silence diagnostics', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-loudness-test-')); directories.push(directory);
    const source = path.join(directory, 'over.wav'), silence = path.join(directory, 'silence.wav');
    await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=997:duration=4', '-af', 'volume=12', '-c:a', 'pcm_f32le', source]);
    const loud = await measureAudioFile(source);
    expect(loud.truePeakDbtp).toBeGreaterThan(0);
    expect(loud.warnings.join(' ')).toContain('clipping');
    await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '1', silence]);
    expect(await measureAudioFile(silence)).toMatchObject({ silence: true, integratedLufs: null, truePeakDbtp: null });
    expect(() => parseLoudnessReport('no result')).toThrow('report');
    expect(() => parseLoudnessReport('{"input_i":"invalid"}')).toThrow('Invalid');
  });
  it('normalizes the processed project with measured passes and verifies delivered PCM loudness', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-normalize-test-')); directories.push(directory);
    await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6', '-af', 'volume=0.2', '-c:a', 'pcm_f32le', path.join(directory, 'tone.wav')]);
    const project = projectSchema.parse({ schemaVersion: 1, id: 'normalize', title: 'Normalize', width: 100, height: 100, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Loudness', duration: 6, background: '#000', layers: [{ id: 'background', type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#000' }] }],
      audio: [{ id: 'tone', src: 'tone.wav', kind: 'music' }], audioNormalization: { integratedLufs: -16, truePeakDbtp: -1, rangeLu: 11 },
    });
    const output = path.join(directory, 'normalized.wav');
    await renderAudio(project, directory, output);
    const measured = await measureAudioFile(output);
    expect(measured.integratedLufs).toBeCloseTo(-16, 0);
    expect(measured.truePeakDbtp).toBeLessThanOrEqual(-0.9);
    expect(measured.silence).toBe(false);
    expect((await measureProjectAudio(project, directory)).integratedLufs).toBeCloseTo(-16, 0);
    const silentVideo = path.join(directory, 'silent.mp4'), video = path.join(directory, 'normalized.mp4');
    await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=100x100:r=10:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silentVideo]);
    await mixAudio(project, directory, silentVideo, video);
    const encoded = await measureAudioFile(video);
    expect(encoded.integratedLufs).toBeCloseTo(-16, 0);
    expect(encoded.truePeakDbtp).toBeLessThanOrEqual(-0.8);
  });
});
