import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GlobalFonts, loadImage, type Image } from '@napi-rs/canvas';
import type { GenmotionProject, VideoLayer } from '../ir/schema.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { runProcess, throwIfAborted, type ProcessOptions } from './process.js';
import { GenmotionError } from '../errors.js';

interface ImageEntry { promise: Promise<Image>; bytes: number }
export class NativeImageCache {
  private readonly entries = new Map<string, ImageEntry>();
  private bytes = 0;
  constructor(private readonly maxBytes = 128 * 1024 * 1024, private readonly maxEntries = 64) {
    if (![maxBytes, maxEntries].every((value) => Number.isSafeInteger(value) && value > 0)) throw new GenmotionError('INVALID_IMAGE_CACHE_LIMIT', 'Image cache limits must be positive safe integers.');
  }
  get byteLength(): number { return this.bytes; }
  get size(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); this.bytes = 0; }
  private evict(key: string): void {
    const entry = this.entries.get(key);
    if (entry) { this.bytes -= entry.bytes; this.entries.delete(key); }
  }
  private trim(): void {
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const key = this.entries.keys().next().value;
      if (key === undefined) break;
      this.evict(key);
    }
  }
  async load(file: string): Promise<Image> {
    const info = await stat(file);
    const key = `${path.resolve(file)}:${String(info.size)}:${String(info.mtimeMs)}:${String(info.ctimeMs)}`;
    const cached = this.entries.get(key);
    if (cached) { this.entries.delete(key); this.entries.set(key, cached); return cached.promise; }
    const entry: ImageEntry = { promise: Promise.resolve().then(() => loadImage(file)), bytes: 0 };
    this.entries.set(key, entry); this.trim();
    try {
      const image = await entry.promise;
      if (this.entries.get(key) === entry) {
        const bytes = image.width * image.height * 4;
        if (bytes > this.maxBytes) this.evict(key);
        else { entry.bytes = bytes; this.bytes += bytes; this.trim(); }
      }
      return image;
    } catch (error) { if (this.entries.get(key) === entry) this.evict(key); throw error; }
  }
}
const imageCache = new NativeImageCache();
const registeredFonts = new Set<string>();

export function registerProjectFonts(project: GenmotionProject, projectDir: string): void {
  const fonts = [...project.brand.fonts];
  for (const scene of [...project.scenes, ...project.compositions]) {
    for (const layer of scene.layers) {
      if ((layer.type === 'text' || layer.type === 'caption') && layer.fontFile) fonts.push({ family: layer.fontFamily, file: layer.fontFile });
    }
  }
  for (const font of fonts) {
    const file = resolveProjectAsset(projectDir, font.file);
    if (registeredFonts.has(file)) continue;
    const loaded = GlobalFonts.registerFromPath(file, font.family);
    if (!loaded) throw new Error(`Could not register font ${font.family} from ${font.file}`);
    registeredFonts.add(file);
  }
}

export function loadCachedImage(file: string): Promise<Image> {
  return imageCache.load(file);
}

async function fileFingerprint(file: string): Promise<string> {
  const info = await stat(file);
  return createHash('sha256').update(`${file}:${info.size}:${info.mtimeMs}`).digest('hex').slice(0, 20);
}

export function videoCacheRoot(projectDir: string, layerId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(layerId)) throw new GenmotionError('INVALID_VIDEO_CACHE_ID', 'Video cache identity must be a native layer ID.');
  return resolveProjectAsset(projectDir, path.join('.genmotion', 'media', layerId));
}

function videoVariantRoot(projectDir: string, layer: VideoLayer, fps: number, duration: number): string {
  const variant = createHash('sha256').update(JSON.stringify({ src: layer.src, trimStart: layer.trimStart, playbackRate: layer.playbackRate, loop: layer.loop, fps, duration })).digest('hex').slice(0, 20);
  return resolveProjectAsset(projectDir, path.join(videoCacheRoot(projectDir, layer.id), variant));
}

export async function prepareVideoLayer(project: GenmotionProject, projectDir: string, layer: VideoLayer, sceneDuration: number, options: ProcessOptions = {}): Promise<void> {
  throwIfAborted(options.signal);
  const input = resolveProjectAsset(projectDir, layer.src);
  const duration = layer.duration ?? sceneDuration - layer.start;
  const root = videoVariantRoot(projectDir, layer, project.fps, duration);
  await mkdir(root, { recursive: true });
  const fingerprint = await fileFingerprint(input);
  const manifestFile = path.join(root, 'manifest.json');
  const expected = { version: 1, fingerprint, fps: project.fps, trimStart: layer.trimStart, duration, playbackRate: layer.playbackRate, loop: layer.loop };
  try {
    const cached = JSON.parse(await readFile(manifestFile, 'utf8')) as typeof expected & { generation: string };
    if (cached.version === 1 && cached.fingerprint === fingerprint && cached.fps === project.fps && cached.trimStart === layer.trimStart && cached.playbackRate === layer.playbackRate && cached.loop === layer.loop && cached.duration >= duration && /^[a-f0-9]{20}$/.test(cached.generation) && (await stat(path.join(root, cached.generation))).isDirectory()) return;
  } catch {
    // Cache does not exist yet.
  }

  const staging = await mkdtemp(path.join(root, 'pending-'));
  const marker = path.join(root, 'manifest-' + randomUUID() + '.tmp');
  try {
    await runProcess('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      ...(layer.loop ? ['-stream_loop', '-1'] : []),
      '-ss', String(layer.trimStart), '-i', input,
      '-t', String(duration),
      '-vf', `setpts=PTS/${layer.playbackRate},fps=${project.fps}`,
      '-start_number', '0', path.join(staging, 'frame-%08d.png'),
    ], projectDir, options);
    throwIfAborted(options.signal);
    const frames = (await readdir(staging)).filter((file) => /^frame-\d{8}\.png$/.test(file)).length;
    const required = Math.ceil(duration * project.fps);
    if (frames < required) throw new GenmotionError('VIDEO_SOURCE_TOO_SHORT', 'The source cannot supply the requested clip duration at its playback rate.', { layerId: layer.id, requiredFrames: required, availableFrames: frames });
    if (await fileFingerprint(input) !== fingerprint) throw new GenmotionError('VIDEO_SOURCE_CHANGED', 'Video source changed during preparation. Retry with a stable local source.');
    const generation = createHash('sha256').update(JSON.stringify(expected)).digest('hex').slice(0, 20);
    const destination = path.join(root, generation);
    try { await rename(staging, destination); }
    catch (error) { if (!(await stat(destination).catch(() => undefined))?.isDirectory()) throw error; }
    await writeFile(marker, JSON.stringify({ ...expected, generation }), { flag: 'wx' });
    throwIfAborted(options.signal);
    await rename(marker, manifestFile);
  } finally { await Promise.all([rm(staging, { recursive: true, force: true }), rm(marker, { force: true })]); }
}

export async function prepareVideoAssets(project: GenmotionProject, projectDir: string, options: ProcessOptions = {}): Promise<void> {
  // Preparation is deliberately serial: each decoder already has its own native
  // threads, and a rejected job must not leave sibling FFmpeg processes running.
  throwIfAborted(options.signal);
  for (const scene of [...project.scenes, ...project.compositions]) {
    for (const layer of scene.layers) {
      if (layer.type === 'video') await prepareVideoLayer(project, projectDir, layer, scene.duration, options);
    }
  }
}

export function videoFramePath(projectDir: string, layer: VideoLayer, localLayerTime: number, fps: number, containerDuration?: number): string {
  const frame = Math.max(0, Math.floor(localLayerTime * fps));
  const duration = layer.duration ?? (containerDuration === undefined ? undefined : containerDuration - layer.start);
  if (duration === undefined) throw new GenmotionError('VIDEO_DURATION_REQUIRED', 'Supply the container duration when resolving an untrimmed video layer.');
  const root = videoVariantRoot(projectDir, layer, fps, duration);
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')) as { generation?: unknown };
  if (typeof manifest.generation !== 'string' || !/^[a-f0-9]{20}$/.test(manifest.generation)) throw new GenmotionError('VIDEO_CACHE_INVALID', 'Video preparation manifest is missing a valid generation.');
  return resolveProjectAsset(projectDir, path.join(root, manifest.generation, `frame-${String(frame).padStart(8, '0')}.png`));
}
