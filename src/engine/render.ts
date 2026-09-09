import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
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
import { projectForRenderComposition } from './render-projection.js';
import { resolveRenderView } from './render-view.js';
import { resolveAlphaOutput, flattenRgbaInPlace, type AlphaMode, type AlphaOutput } from './alpha-output.js';
import { resolveOutputCompatibility, validateCompatibilityContainer } from './output-compatibility.js';
import { assertReferenceExportAllowed, deliveryPurposeSchema, verifyFrozenReferenceSources } from '../ir/reference-rights.js';
import { attestRenderOutput, createRenderInputAttestation, type RenderInputAttestation, type RenderOutputAttestation } from '../ir/render-attestation.js';
import { assertReferenceAdaptation } from '../ir/reference-adaptation.js';

export type RenderQuality = 'draft' | 'standard' | 'high';
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'prores';

export function temporalSamplesForQuality(samples: number, quality: RenderQuality): number {
  const limit = quality === 'draft' ? 2 : quality === 'standard' ? 4 : 8;
  return Math.max(1, Math.min(samples, limit));
}

export function defaultVideoExtension(codec: VideoCodec): string {
  return codec === 'vp9' ? '.webm' : codec === 'prores' ? '.mov' : '.mp4';
}

export function validateOutputContainer(output: string, codec: VideoCodec): void {
  validateCompatibilityContainer(output, codec);
}

export interface RenderOptions {
  output?: string | undefined;
  quality?: RenderQuality;
  codec?: VideoCodec;
  workers?: number | undefined;
  hardwareAcceleration?: boolean;
  resolution?: RenderResolution;
  range?: { startFrame: number; endFrame: number } | undefined;
  sceneId?: string | undefined;
  compositionId?: string | undefined;
  group?: { sceneId: string; layerId: string } | undefined;
  alphaMode?: AlphaMode | undefined;
  alphaBackground?: string | undefined;
  signal?: AbortSignal;
  timeoutMs?: number | undefined;
  maxBufferedFrames?: number | undefined;
  maxBufferedBytes?: number | undefined;
  onProgress?: (progress: RenderProgress) => void;
  deliveryPurpose?: 'internal-review' | 'reference-comparison' | 'editorial' | 'commercial' | 'public';
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
  sourceRange: { startFrame: number; endFrame: number };
  sourceCompositionId?: string;
  sourceGroup?: { sceneId: string; layerId: string };
  alphaOutput: AlphaOutput;
  manifest: { version: 1; inputSha256: string; artifactSha256: string; inputs: RenderInputAttestation; output: RenderOutputAttestation; adaptation: ReturnType<typeof assertReferenceAdaptation> };
}

async function fileSha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function resolveRenderRange(project: GenmotionProject, options: Pick<RenderOptions, 'range' | 'sceneId' | 'group'>): { startFrame: number; endFrame: number } {
  if (options.range && options.sceneId !== undefined) throw new GenmotionError('RENDER_SELECTION_CONFLICT', 'Choose a scene or a frame range, not both.');
  if (options.group && options.sceneId !== undefined) throw new GenmotionError('RENDER_SELECTION_CONFLICT', 'A group already identifies its scene.');
  // Decimal scene sums can land a few ULPs above an exact frame boundary.
  const frameCeiling = (time: number): number => { const frame = time * project.fps; return Math.ceil(frame - Number.EPSILON * Math.max(1, Math.abs(frame)) * 16); };
  const frames = frameCeiling(projectDuration(project));
  let range = options.range ?? { startFrame: 0, endFrame: frames };
  const sceneId = options.sceneId ?? options.group?.sceneId;
  if (sceneId !== undefined) {
    const matches = project.scenes.filter(scene => scene.id === sceneId);
    if (matches.length !== 1) throw new GenmotionError('RENDER_SCENE_MISSING', 'Render selection requires one unambiguous scene.');
    let start = 0;
    for (const scene of project.scenes) {
      if (scene.id === sceneId) {
        const sceneRange = { startFrame: frameCeiling(start), endFrame: frameCeiling(start + scene.duration) };
        if (options.group && options.range) {
          if (range.startFrame < sceneRange.startFrame || range.endFrame > sceneRange.endFrame) throw new GenmotionError('INVALID_RENDER_RANGE', 'Group frame range must remain inside its scene.');
        } else range = sceneRange;
        break;
      }
      start += scene.duration;
    }
  }
  if (!Number.isSafeInteger(range.startFrame) || !Number.isSafeInteger(range.endFrame) || range.startFrame < 0 || range.startFrame >= range.endFrame || range.endFrame > frames) throw new GenmotionError('INVALID_RENDER_RANGE', 'Render range requires integer frames, an exclusive end and at least one frame inside the project.');
  return { ...range };
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
  const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2);
  if (currentLongEdge >= minimumLongEdge) return { width: even(project.width), height: even(project.height) };
  const scale = minimumLongEdge / currentLongEdge;
  return { width: even(project.width * scale), height: even(project.height * scale) };
}

function ffmpegEncoderArgs(project: GenmotionProject, dimensions: RenderResolution, codec: VideoCodec, quality: RenderQuality, output: string, hardware: boolean, alpha: AlphaOutput): string[] {
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
    // Do not let newer FFmpeg builds select experimental planar RGB+alpha.
    base.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-row-mt', '1', '-pix_fmt', alpha.mode === 'preserve' ? 'yuva420p' : 'yuv420p');
  } else {
    if (alpha.mode === 'preserve') base.push('-c:v', 'prores_ks', '-profile:v', quality === 'high' ? '4444xq' : '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16');
    else base.push('-c:v', 'prores_ks', '-profile:v', quality === 'high' ? '3' : '2', '-pix_fmt', 'yuv422p10le');
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
  const { projectDir } = loaded;
  if (options.compositionId !== undefined && (options.sceneId !== undefined || options.group)) throw new GenmotionError('RENDER_SELECTION_CONFLICT', 'Choose a scene, group or standalone composition.');
  let project = projectForRenderComposition(loaded.project, options.compositionId);
  const quality = options.quality ?? 'high';
  const codec = options.codec ?? 'h264';
  assertReferenceExportAllowed(project, deliveryPurposeSchema.parse(options.deliveryPurpose ?? 'internal-review'));
  await verifyFrozenReferenceSources(project, projectDir);
  const adaptation = assertReferenceAdaptation(project);
  if (!['draft', 'standard', 'high'].includes(quality) || !['h264', 'h265', 'vp9', 'prores'].includes(codec)) throw new GenmotionError('INVALID_RENDER_OPTIONS', 'Unknown output quality or codec.');
  if (options.hardwareAcceleration && codec !== 'h264') throw new GenmotionError('HARDWARE_CODEC_UNSUPPORTED', `Hardware acceleration is unavailable for ${codec}; choose software explicitly.`);
  if (project.motionBlur) project = { ...project, motionBlur: { ...project.motionBlur, samples: temporalSamplesForQuality(project.motionBlur.samples, quality) } };
  const view = resolveRenderView(project, options.group);
  const alphaOutput = resolveAlphaOutput(codec, options.alphaMode, options.alphaBackground);
  const dimensions = resolveRenderResolution(project, quality, options.resolution);
  const limits = resolveRenderLimits(dimensions, options);
  const sourceRange = resolveRenderRange(project, options);
  const totalFrames = sourceRange.endFrame - sourceRange.startFrame;
  const selected = options.range !== undefined || options.sceneId !== undefined || options.group !== undefined;
  const duration = selected ? totalFrames / project.fps : projectDuration(project);
  if (!Number.isSafeInteger(totalFrames) || totalFrames < 1) throw new GenmotionError('INVALID_RENDER_DURATION', 'A render must contain a finite positive frame count.');
  const selectionSuffix = (options.compositionId !== undefined ? `-composition-${options.compositionId}` : '') + (options.group ? `-group-${options.group.sceneId}-${options.group.layerId}` : '') + (options.sceneId !== undefined ? `-scene-${options.sceneId}` : options.range ? `-frames-${sourceRange.startFrame}-${sourceRange.endFrame}` : '');
  const output = path.resolve(options.output ?? path.join(projectDir, 'renders', `${project.outputName ?? project.id}${selectionSuffix}${defaultVideoExtension(codec)}`));
  const inputAttestation = await createRenderInputAttestation(loaded, [output]);
  resolveOutputCompatibility({ codec, filename: output, alphaMode: options.alphaMode ?? 'auto', alphaBackground: options.alphaBackground, width: dimensions.width, height: dimensions.height, hardwareAcceleration: options.hardwareAcceleration ?? false });
  const outputKey = process.platform === 'win32' ? output.toLowerCase() : output;
  if (activeOutputs.has(outputKey)) throw new GenmotionError('OUTPUT_BUSY', 'An active render already owns this output path.');
  activeOutputs.add(outputKey);
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const deadline = options.timeoutMs === undefined ? undefined : setTimeout(() => {
    controller.abort(new GenmotionError('RENDER_TIMEOUT', 'Render exceeded its deadline.', { timeoutMs: options.timeoutMs }));
  }, options.timeoutMs);
  deadline?.unref();
  const inputSha256 = createHash('sha256').update(JSON.stringify({ project, dimensions, quality, codec, alphaOutput, ...(selected ? { sourceRange } : {}), ...(view ? { view } : {}) })).digest('hex');
  const renderId = inputSha256.slice(0, 16);
  let stage: RenderStage = 'preparing';
  let peakBufferedBytes = 0;
  let state: FrameStreamState = { renderedFrames: 0, encodedFrames: 0, inFlightFrames: 0, bufferedFrames: 0, bufferedBytes: 0, maxBufferedFrames: Math.min(limits.capacity, totalFrames), maxBufferedBytes: Math.min(limits.capacity, totalFrames) * limits.frameBytes };
  let staging: string | undefined;
  let encoder: ManagedProcess | undefined;
  let pool: NativeFramePool | undefined;
  let acceptedProbe: VideoProbe;
  let outputAttestation: RenderOutputAttestation;
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
    encoder = startProcess('ffmpeg', ffmpegEncoderArgs(project, dimensions, codec, quality, silentVideo, options.hardwareAcceleration ?? false, alphaOutput), projectDir, { signal });
    const encoding = encoder;
    pool = await NativeFramePool.create(project, projectDir, dimensions, Math.min(limits.workers, totalFrames), view);
    const framePool = pool;
    await Promise.race([
      streamOrderedFrames({
        totalFrames, frameBytes: limits.frameBytes, capacity: Math.min(limits.capacity, totalFrames), signal,
        render: async (frame) => framePool.render(sourceRange.startFrame + frame),
        write: async (buffer) => {
          throwIfAborted(signal);
          if (alphaOutput.mode === 'flatten') flattenRgbaInPlace(buffer, alphaOutput.background);
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
    await mixAudio(project, projectDir, silentVideo, candidate, { signal, view, ...(selected ? { range: { start: sourceRange.startFrame / project.fps, duration } } : {}) });
    enter('verifying');
    const probe = await probeVideo(candidate, { signal });
    acceptedProbe = probe;
    if (alphaOutput.mode === 'preserve' && !probe.alphaSignaled) throw new GenmotionError('OUTPUT_ALPHA_MISSING', 'The encoded output does not signal an alpha plane.');
    if (probe.width !== dimensions.width || probe.height !== dimensions.height || !Number.isFinite(probe.frameRate) || Math.abs(probe.frameRate - project.fps) > 0.01 || !Number.isFinite(probe.duration) || Math.abs(probe.duration - duration) > Math.max(0.12, 2 / project.fps)) {
      throw new GenmotionError('OUTPUT_VERIFICATION_FAILED', 'Encoded output does not match the render contract.', { expected: { ...dimensions, frameRate: project.fps, duration }, actual: probe });
    }
    outputAttestation = await attestRenderOutput(candidate, Boolean(probe.audioCodec), { signal, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) });
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
  const artifactSha256 = await fileSha256(output);
  return { output, duration, frames: totalFrames, elapsedMs, averageFps: totalFrames / (elapsedMs / 1000), renderId, ...dimensions, quality, codec, alphaOutput, sourceRange, ...(options.compositionId !== undefined ? { sourceCompositionId: options.compositionId } : {}), ...(view ? { sourceGroup: { sceneId: view.sceneId, layerId: view.layerIds[0]! } } : {}), peakBufferedBytes, workers: Math.min(limits.workers, totalFrames), probe: acceptedProbe, manifest: { version: 1, inputSha256, artifactSha256, inputs: inputAttestation, output: outputAttestation, adaptation } };
}
