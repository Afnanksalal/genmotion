import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { replaceFile } from '../ir/atomic.js';
import { NativeFramePool } from './frame-pool.js';
import { streamOrderedFrames, type FrameStreamState } from './frame-stream.js';
import { startProcess, throwIfAborted, type ManagedProcess } from './process.js';
import type { GenmotionProject } from '../ir/schema.js';
import { projectDuration } from '../ir/schema.js';
import type { LoadedProject } from '../ir/loader.js';
import { GenmotionError } from '../errors.js';
import { prepareVideoAssets } from './assets.js';
import { mixAudio } from './audio.js';
import { probeVideo, type VideoProbe } from './probe.js';

export type RenderQuality = 'draft' | 'standard' | 'high';
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'prores';

export function defaultVideoExtension(codec: VideoCodec): string {
  return codec === 'vp9' ? '.webm' : codec === 'prores' ? '.mov' : '.mp4';
}

export function validateOutputContainer(output: string, codec: VideoCodec): void {
  const extension = path.extname(output).toLowerCase();
  const supported = codec === 'vp9' ? ['.webm'] : codec === 'prores' ? ['.mov'] : ['.mp4', '.mov'];
  if (!supported.includes(extension)) throw new GenmotionError('INVALID_OUTPUT_CONTAINER', `${codec} output requires ${supported.join(' or ')}.`, { output, codec });
}

export interface RenderOptions {
  output: string;
  quality?: RenderQuality;
  codec?: VideoCodec;
  workers?: number | undefined;
  hardwareAcceleration?: boolean;
  resolution?: RenderResolution;
  signal?: AbortSignal;
  timeoutMs?: number | undefined;
  maxBufferedFrames?: number | undefined;
  maxBufferedBytes?: number | undefined;
  onProgress?: (progress: RenderProgress) => void;
}

export type RenderStage = 'preparing' | 'rendering' | 'encoding' | 'mixing' | 'verifying' | 'complete';

export interface RenderProgress extends FrameStreamState {
  stage: RenderStage;
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
  elapsedMs: number;
  fps: number;
}

export interface RenderResult {
  probe: VideoProbe;
  output: string;
  duration: number;
  frames: number;
  elapsedMs: number;
  averageFps: number;
  renderId: string;
  peakBufferedBytes: number;
  workers: number;
  width: number;
  height: number;
  quality: RenderQuality;
  codec: VideoCodec;
}

export interface RenderResolution { width: number; height: number }


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
  if (codec !== 'vp9') base.push('-movflags', '+faststart');
  base.push(output);
  return base;
}


const activeOutputs = new Set<string>();

export function resolveRenderLimits(dimensions: RenderResolution, options: Pick<RenderOptions, 'workers' | 'maxBufferedFrames' | 'maxBufferedBytes' | 'timeoutMs'>): { workers: number; frameBytes: number; capacity: number } {
  const workers = options.workers ?? Math.min(4, Math.max(1, os.availableParallelism() - 1));
  const maxFrames = options.maxBufferedFrames ?? workers;
  const frameBytes = dimensions.width * dimensions.height * 4;
  const maxBytes = options.maxBufferedBytes ?? Math.max(256 * 1024 * 1024, frameBytes);
  for (const [name, value] of Object.entries({ workers, maxBufferedFrames: maxFrames, maxBufferedBytes: maxBytes, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new GenmotionError('INVALID_RENDER_LIMIT', name + ' must be a positive safe integer.');
  }
  if (workers > 16) throw new GenmotionError('INVALID_RENDER_LIMIT', 'At most 16 native workers may be requested.');
  if (options.timeoutMs !== undefined && options.timeoutMs > 2_147_483_647) throw new GenmotionError('INVALID_RENDER_LIMIT', 'Render deadline must not exceed 2147483647 milliseconds.');
  if (maxBytes < frameBytes) throw new GenmotionError('INVALID_RENDER_LIMIT', 'The frame memory budget cannot hold one output frame.', { frameBytes, maxBytes });
  const capacity = Math.min(workers, maxFrames, Math.floor(maxBytes / frameBytes));
  return { workers: capacity, frameBytes, capacity };
}

export async function renderProject(loaded: LoadedProject, options: RenderOptions): Promise<RenderResult> {
  if (options.signal?.aborted) throw new GenmotionError('RENDER_ABORTED', 'Render was aborted before it started.');
  const started = performance.now();
  const { project, projectDir } = loaded;
  const quality = options.quality ?? 'high';
  const codec = options.codec ?? 'h264';
  if (!['draft', 'standard', 'high'].includes(quality) || !['h264', 'h265', 'vp9', 'prores'].includes(codec)) throw new GenmotionError('INVALID_RENDER_OPTIONS', 'Unknown output quality or codec.');
  const dimensions = resolveRenderResolution(project, quality, options.resolution);
  const limits = resolveRenderLimits(dimensions, options);
  const totalFrames = Math.ceil(projectDuration(project) * project.fps);
  if (!Number.isSafeInteger(totalFrames) || totalFrames < 1) throw new GenmotionError('INVALID_RENDER_DURATION', 'A render must contain a finite positive frame count.');
  const output = path.resolve(options.output);
  validateOutputContainer(output, codec);
  const outputKey = process.platform === 'win32' ? output.toLowerCase() : output;
  if (activeOutputs.has(outputKey)) throw new GenmotionError('OUTPUT_BUSY', 'An active render already owns this output path.');
  activeOutputs.add(outputKey);
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const deadline = options.timeoutMs === undefined ? undefined : setTimeout(() => {
    controller.abort(new GenmotionError('RENDER_TIMEOUT', 'Render exceeded its deadline.', { timeoutMs: options.timeoutMs }));
  }, options.timeoutMs);
  deadline?.unref();
  const renderId = createHash('sha256').update(JSON.stringify({ project, dimensions, quality, codec })).digest('hex').slice(0, 16);
  let stage: RenderStage = 'preparing';
  let peakBufferedBytes = 0;
  let state: FrameStreamState = { renderedFrames: 0, encodedFrames: 0, inFlightFrames: 0, bufferedFrames: 0, bufferedBytes: 0, maxBufferedFrames: Math.min(limits.capacity, totalFrames), maxBufferedBytes: Math.min(limits.capacity, totalFrames) * limits.frameBytes };
  let staging: string | undefined;
  let encoder: ManagedProcess | undefined;
  let pool: NativeFramePool | undefined;
  let acceptedProbe: VideoProbe;
  const report = (): void => {
    const elapsedMs = performance.now() - started;
    peakBufferedBytes = Math.max(peakBufferedBytes, state.bufferedBytes);
    options.onProgress?.({ ...state, stage, totalFrames, elapsedMs, fps: state.encodedFrames / Math.max(0.001, elapsedMs / 1000) });
  };
  const enter = (next: RenderStage): void => { stage = next; report(); throwIfAborted(signal); };
  try {
    enter('preparing');
    await mkdir(path.dirname(output), { recursive: true });
    staging = await mkdtemp(path.join(path.dirname(output), '.genmotion-render-'));
    await prepareVideoAssets(project, projectDir, { signal });
    throwIfAborted(signal);
    const silentVideo = path.join(staging, 'silent' + (codec === 'vp9' ? '.webm' : codec === 'prores' ? '.mov' : '.mp4'));
    const candidate = path.join(staging, 'master' + (path.extname(output) || '.mp4'));
    enter('rendering');
    encoder = startProcess('ffmpeg', ffmpegEncoderArgs(project, dimensions, codec, quality, silentVideo, options.hardwareAcceleration ?? false), projectDir, { signal });
    const encoding = encoder;
    pool = await NativeFramePool.create(project, projectDir, dimensions, Math.min(limits.workers, totalFrames));
    const framePool = pool;
    await Promise.race([
      streamOrderedFrames({
        totalFrames, frameBytes: limits.frameBytes, capacity: Math.min(limits.capacity, totalFrames), signal,
        render: async (frame) => framePool.render(frame),
        write: async (buffer) => {
          throwIfAborted(signal);
          // Wait for ownership of every chunk to leave Node's writable queue,
          // including small frames below the stream's high-water mark.
          await new Promise<void>((resolve, reject) => {
            encoding.child.stdin.write(buffer, (error) => error ? reject(error) : resolve());
          });
        },
        onProgress: (progress) => { state = progress; report(); },
      }),
      encoding.completed.then(() => { throw new GenmotionError('ENCODER_EARLY_EXIT', 'Encoder exited before all frames were delivered.'); }),
    ]);
    await framePool.close();
    pool = undefined;
    enter('encoding');
    encoding.child.stdin.end();
    await encoding.completed;
    enter('mixing');
    await mixAudio(project, projectDir, silentVideo, candidate, { signal });
    enter('verifying');
    const probe = await probeVideo(candidate, { signal });
    acceptedProbe = probe;
    if (probe.width !== dimensions.width || probe.height !== dimensions.height || !Number.isFinite(probe.frameRate) || Math.abs(probe.frameRate - project.fps) > 0.01 || !Number.isFinite(probe.duration) || Math.abs(probe.duration - projectDuration(project)) > Math.max(0.12, 2 / project.fps)) {
      throw new GenmotionError('OUTPUT_VERIFICATION_FAILED', 'Encoded output does not match the render contract.', { expected: { ...dimensions, frameRate: project.fps, duration: projectDuration(project) }, actual: probe });
    }
    throwIfAborted(signal);
    // The only write to the destination happens after a successful verification.
    await replaceFile(candidate, output, { signal });
    stage = 'complete';
  } catch (error) {
    if (signal.aborted) {
      if (signal.reason instanceof GenmotionError && signal.reason.code === 'RENDER_TIMEOUT') throw signal.reason;
      throw new GenmotionError('RENDER_ABORTED', 'Render was aborted.', error);
    }
    throw error;
  } finally {
    if (deadline) clearTimeout(deadline);
    try {
      await Promise.all([pool?.close(), encoder?.terminate()]);
      if (staging) await rm(staging, { recursive: true, force: true });
    } finally { activeOutputs.delete(outputKey); }
  }
  const elapsedMs = performance.now() - started;
  return { output, duration: projectDuration(project), frames: totalFrames, elapsedMs, averageFps: totalFrames / (elapsedMs / 1000), renderId, ...dimensions, quality, codec, peakBufferedBytes, workers: Math.min(limits.workers, totalFrames), probe: acceptedProbe };
}
