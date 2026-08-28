import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { GenmotionProject } from '../ir/schema.js';
import { projectDuration } from '../ir/schema.js';
import type { LoadedProject } from '../ir/loader.js';
import { GenmotionError } from '../errors.js';
import { prepareVideoAssets } from './assets.js';
import { mixAudio } from './audio.js';
import { probeVideo } from './probe.js';

export type RenderQuality = 'draft' | 'standard' | 'high';
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'prores';

export interface RenderOptions {
  output: string;
  quality?: RenderQuality;
  codec?: VideoCodec;
  workers?: number;
  hardwareAcceleration?: boolean;
  resolution?: RenderResolution;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
}

export interface RenderProgress {
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
  elapsedMs: number;
  fps: number;
}

export interface RenderResult {
  output: string;
  duration: number;
  frames: number;
  elapsedMs: number;
  averageFps: number;
  renderId: string;
  width: number;
  height: number;
  quality: RenderQuality;
  codec: VideoCodec;
}

export interface RenderResolution { width: number; height: number }

interface WorkerResult { frame: number; buffer?: ArrayBuffer; error?: string }

export function resolveRenderResolution(project: Pick<GenmotionProject, 'width' | 'height'>, quality: RenderQuality, requested?: RenderResolution): RenderResolution {
  if (requested) {
    if (!Number.isInteger(requested.width) || !Number.isInteger(requested.height) || requested.width < 2 || requested.height < 2 || requested.width % 2 !== 0 || requested.height % 2 !== 0) {
      throw new GenmotionError('INVALID_RENDER_RESOLUTION', 'Output width and height must be even integers greater than one.');
    }
    const projectRatio = project.width / project.height;
    const outputRatio = requested.width / requested.height;
    if (Math.abs(projectRatio - outputRatio) / projectRatio > 0.002) throw new GenmotionError('INVALID_RENDER_ASPECT', 'Output resolution must preserve the project aspect ratio.');
    return requested;
  }
  const minimumLongEdge = quality === 'draft' ? 0 : quality === 'standard' ? 1280 : 1920;
  const currentLongEdge = Math.max(project.width, project.height);
  if (currentLongEdge >= minimumLongEdge) return { width: project.width, height: project.height };
  const scale = minimumLongEdge / currentLongEdge;
  const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2);
  return { width: even(project.width * scale), height: even(project.height * scale) };
}

function ffmpegEncoderArgs(project: GenmotionProject, dimensions: RenderResolution, codec: VideoCodec, quality: RenderQuality, output: string, hardware: boolean): string[] {
  const base = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', `${String(dimensions.width)}x${String(dimensions.height)}`,
    '-framerate', String(project.fps), '-i', 'pipe:0', '-an',
  ];
  const preset = quality === 'draft' ? 'veryfast' : quality === 'standard' ? 'medium' : 'slow';
  const crf = quality === 'draft' ? '26' : quality === 'standard' ? '18' : '14';
  if (codec === 'h264') {
    if (hardware) base.push('-c:v', process.platform === 'darwin' ? 'h264_videotoolbox' : process.platform === 'win32' ? 'h264_nvenc' : 'h264_vaapi', '-b:v', quality === 'high' ? '24M' : '12M');
    else base.push('-c:v', 'libx264', '-preset', preset, '-crf', crf);
    base.push('-pix_fmt', 'yuv420p', '-profile:v', 'high');
  } else if (codec === 'h265') {
    base.push('-c:v', 'libx265', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p10le');
  } else if (codec === 'vp9') {
    base.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-row-mt', '1');
  } else {
    base.push('-c:v', 'prores_ks', '-profile:v', quality === 'high' ? '3' : '2', '-pix_fmt', 'yuv422p10le');
  }
  if (dimensions.width >= 1280 || dimensions.height >= 720) base.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
  base.push('-movflags', '+faststart', output);
  return base;
}

function openEncoder(project: GenmotionProject, dimensions: RenderResolution, options: Required<Pick<RenderOptions, 'quality' | 'codec' | 'hardwareAcceleration'>>, output: string): ChildProcessWithoutNullStreams {
  const child = spawn('ffmpeg', ffmpegEncoderArgs(project, dimensions, options.codec, options.quality, output, options.hardwareAcceleration), {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return child;
}

function workerModuleUrl(): URL {
  return import.meta.url.includes('/src/engine/render.')
    ? new URL('../../dist/engine/worker.js', import.meta.url)
    : new URL('./worker.js', import.meta.url);
}

async function writeFrame(child: ChildProcessWithoutNullStreams, buffer: Buffer): Promise<void> {
  if (!child.stdin.write(buffer)) await once(child.stdin, 'drain');
}

async function closeEncoder(child: ChildProcessWithoutNullStreams): Promise<void> {
  child.stdin.end();
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (data: string) => { stderr += data; });
  const [code] = await once(child, 'close') as [number | null];
  if (code !== 0) throw new GenmotionError('ENCODE_FAILED', `FFmpeg exited with ${String(code)}: ${stderr.trim()}`);
}

export async function renderProject(loaded: LoadedProject, options: RenderOptions): Promise<RenderResult> {
  const started = performance.now();
  const { project, projectDir } = loaded;
  const quality = options.quality ?? 'high';
  const codec = options.codec ?? 'h264';
  const hardwareAcceleration = options.hardwareAcceleration ?? false;
  const workers = Math.max(1, Math.min(options.workers ?? Math.max(1, os.availableParallelism() - 1), 16));
  const dimensions = resolveRenderResolution(project, quality, options.resolution);
  const totalFrames = Math.ceil(projectDuration(project) * project.fps);
  const output = path.resolve(options.output);
  await mkdir(path.dirname(output), { recursive: true });
  await rm(output, { force: true });
  await prepareVideoAssets(project, projectDir);
  const renderId = createHash('sha256').update(JSON.stringify(project)).digest('hex').slice(0, 16);
  const silentVideo = path.join(path.dirname(output), `.${path.basename(output)}.${renderId}.silent${codec === 'vp9' ? '.webm' : codec === 'prores' ? '.mov' : '.mp4'}`);
  const encoder = openEncoder(project, dimensions, { quality, codec, hardwareAcceleration }, silentVideo);

  let nextFrame = 0;
  let expectedFrame = 0;
  let renderedFrames = 0;
  let encodedFrames = 0;
  const ready = new Map<number, Buffer>();
  const pool: Worker[] = [];
  let resolveDone: (() => void) | undefined;
  let rejectDone: ((error: Error) => void) | undefined;
  const done = new Promise<void>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  let writing = false;
  let failed = false;

  const report = (): void => {
    const elapsedMs = performance.now() - started;
    options.onProgress?.({ renderedFrames, encodedFrames, totalFrames, elapsedMs, fps: encodedFrames / Math.max(0.001, elapsedMs / 1000) });
  };

  const flush = async (): Promise<void> => {
    if (writing || failed) return;
    writing = true;
    try {
      while (ready.has(expectedFrame)) {
        const frame = ready.get(expectedFrame);
        if (!frame) break;
        ready.delete(expectedFrame);
        await writeFrame(encoder, frame);
        expectedFrame += 1;
        encodedFrames += 1;
        report();
      }
      if (encodedFrames === totalFrames) resolveDone?.();
    } catch (error) {
      failed = true;
      rejectDone?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      writing = false;
    }
  };

  const assign = (worker: Worker): void => {
    if (nextFrame >= totalFrames) return;
    const frame = nextFrame;
    nextFrame += 1;
    worker.postMessage({ frame });
  };

  try {
    for (let index = 0; index < Math.min(workers, totalFrames); index += 1) {
      const worker = new Worker(workerModuleUrl(), { workerData: { project, projectDir, dimensions } });
      pool.push(worker);
      worker.on('message', (result: WorkerResult) => {
        if (failed) return;
        if (result.error || !result.buffer) {
          failed = true;
          rejectDone?.(new GenmotionError('FRAME_RENDER_FAILED', `Frame ${String(result.frame)} failed: ${result.error ?? 'No pixel buffer returned.'}`));
          return;
        }
        ready.set(result.frame, Buffer.from(result.buffer));
        renderedFrames += 1;
        assign(worker);
        void flush();
      });
      worker.on('error', (error) => { if (!failed) { failed = true; rejectDone?.(error); } });
      assign(worker);
    }

    const abort = (): void => { if (!failed) { failed = true; rejectDone?.(new GenmotionError('RENDER_ABORTED', 'Render was aborted.')); } };
    options.signal?.addEventListener('abort', abort, { once: true });
    await done;
    options.signal?.removeEventListener('abort', abort);
    await Promise.all(pool.map(async (worker) => worker.terminate()));
    await closeEncoder(encoder);
    await mixAudio(project, projectDir, silentVideo, output);
    const probe = await probeVideo(output);
    if (probe.width !== dimensions.width || probe.height !== dimensions.height || Math.abs(probe.frameRate - project.fps) > 0.01 || Math.abs(probe.duration - projectDuration(project)) > Math.max(0.12, 2 / project.fps)) {
      throw new GenmotionError('OUTPUT_VERIFICATION_FAILED', 'Encoded output does not match the render contract.', { expected: { ...dimensions, frameRate: project.fps, duration: projectDuration(project) }, actual: probe });
    }
  } catch (error) {
    encoder.kill('SIGKILL');
    await Promise.all(pool.map(async (worker) => worker.terminate()));
    await rm(silentVideo, { force: true });
    throw error;
  }

  const elapsedMs = performance.now() - started;
  return { output, duration: projectDuration(project), frames: totalFrames, elapsedMs, averageFps: totalFrames / (elapsedMs / 1000), renderId, ...dimensions, quality, codec };
}
