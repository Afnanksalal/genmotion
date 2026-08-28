import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { GlobalFonts, loadImage, type Image } from '@napi-rs/canvas';
import type { GenmotionProject, VideoLayer } from '../ir/schema.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { runProcess } from './process.js';

const imageCache = new Map<string, Promise<Image>>();
const registeredFonts = new Set<string>();

export function registerProjectFonts(project: GenmotionProject, projectDir: string): void {
  const fonts = [...project.brand.fonts];
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === 'text' && layer.fontFile) fonts.push({ family: layer.fontFamily, file: layer.fontFile });
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
  let promise = imageCache.get(file);
  if (!promise) {
    promise = loadImage(file);
    imageCache.set(file, promise);
  }
  return promise;
}

async function fileFingerprint(file: string): Promise<string> {
  const info = await stat(file);
  return createHash('sha256').update(`${file}:${info.size}:${info.mtimeMs}`).digest('hex').slice(0, 20);
}

export function videoCacheRoot(projectDir: string, layerId: string): string {
  return path.join(projectDir, '.genmotion', 'media', layerId);
}

export async function prepareVideoLayer(project: GenmotionProject, projectDir: string, layer: VideoLayer, sceneDuration: number): Promise<void> {
  const input = resolveProjectAsset(projectDir, layer.src);
  const root = videoCacheRoot(projectDir, layer.id);
  await mkdir(root, { recursive: true });
  const fingerprint = await fileFingerprint(input);
  const manifestFile = path.join(root, 'manifest.json');
  const duration = layer.duration ?? sceneDuration - layer.start;
  const expected = JSON.stringify({ fingerprint, fps: project.fps, trimStart: layer.trimStart, duration, playbackRate: layer.playbackRate });
  try {
    if (await readFile(manifestFile, 'utf8') === expected) return;
  } catch {
    // Cache does not exist yet.
  }

  const output = path.join(root, 'frame-%08d.png');
  await runProcess('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(layer.trimStart), '-i', input,
    '-t', String(duration * layer.playbackRate),
    '-vf', `setpts=PTS/${layer.playbackRate},fps=${project.fps}`,
    '-start_number', '0', output,
  ], projectDir);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(manifestFile, expected);
}

export async function prepareVideoAssets(project: GenmotionProject, projectDir: string): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      if (layer.type === 'video') jobs.push(prepareVideoLayer(project, projectDir, layer, scene.duration));
    }
  }
  await Promise.all(jobs);
}

export function videoFramePath(projectDir: string, layer: VideoLayer, localLayerTime: number, fps: number): string {
  const frame = Math.max(0, Math.floor(localLayerTime * fps));
  return path.join(videoCacheRoot(projectDir, layer.id), `frame-${String(frame).padStart(8, '0')}.png`);
}
