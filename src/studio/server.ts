import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { loadProject, resolveProjectAsset, type LoadedProject } from '../ir/loader.js';
import { projectDuration, projectSchema, type GenmotionProject } from '../ir/schema.js';
import { compileProjectMotions } from '../engine/motion.js';
import { renderFramePng } from '../engine/draw.js';
import { evaluateLayerTracks } from '../engine/animation.js';
import { layerIsActive, locateScene } from '../engine/timeline.js';
import { makeContactSheet, probeVideo } from '../engine/probe.js';
import { renderProject, resolveRenderResolution } from '../engine/render.js';
import { validateProject } from '../ir/validate.js';
import { compileCustomLibrary, loadMotionLibraries, saveMotionLibrary } from '../catalog/custom.js';
import { tasteReferences } from '../catalog/references.js';
import { sceneBlueprints } from '../catalog/blueprints.js';
import { studioHtml } from './ui.js';
import { GenmotionError } from '../errors.js';
import { isNonExecutionResponse, LocalAgentRuntime, requestRequiresProjectChange, type AgentHostId, type AgentRuntime, type AgentSelection } from '../agent/runtime.js';
import { initializeProject, type InitOptions } from '../commands/init.js';
import { isGenmotionBrandAsset, readGenmotionBrandAsset } from '../brand.js';

const nodeSchema = z.object({
  id: z.string().min(1), kind: z.enum(['brief', 'scene', 'layer', 'reference', 'note', 'output']),
  x: z.number().finite(), y: z.number().finite(), label: z.string().min(1),
  sceneId: z.string().optional(), layerId: z.string().optional(), referenceId: z.string().optional(),
  note: z.string().default(''), color: z.string().default('#8b5cf6'),
});

const countWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function requestedOutcomeGaps(prompt: string, project: GenmotionProject): string[] {
  const gaps: string[] = [];
  const layers = project.scenes.flatMap((scene) => scene.layers);
  const tracks = layers.flatMap((layer) => layer.tracks);
  const durationMatch = prompt.match(/\b(\d+(?:\.\d+)?)\s*[- ]?second\s+(?:\d+:\d+\s+)?(?:launch\s+)?(?:film|video|animation|composition|spot|promo)\b/i);
  if (durationMatch) {
    const requested = Number(durationMatch[1]);
    const actual = projectDuration(project);
    if (Math.abs(actual - requested) > 1 / project.fps) gaps.push(`requested duration ${requested}s, actual duration ${actual}s`);
  }
  const sceneMatch = prompt.match(/\b(?:build|create|make)\s+(?:exactly\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:\w+\s+){0,2}scenes?\b/i);
  const requestedSceneCount = sceneMatch?.[1];
  if (requestedSceneCount) {
    const requested = countWords[requestedSceneCount.toLowerCase()] ?? Number(requestedSceneCount);
    if (Number.isFinite(requested) && project.scenes.length !== requested) gaps.push(`requested ${requested} scenes, actual ${project.scenes.length}`);
  }
  if (/\bdirect animation tracks?\b/i.test(prompt) && tracks.length < project.scenes.length) gaps.push(`requested direct animation tracks across the scene system, actual track count ${tracks.length}`);
  if (/\bcustom easing\b/i.test(prompt) && !tracks.some((track) => track.keyframes.some((keyframe) => typeof keyframe.ease === 'object' || keyframe.ease !== 'linear'))) gaps.push('requested custom easing, but no non-linear or custom-eased keyframe exists');
  if (/\bvector paths?\b/i.test(prompt) && !layers.some((layer) => layer.type === 'shape' && layer.shape === 'path')) gaps.push('requested vector paths, but no path shape exists');
  if (/\b(?:clipping|masked reveal|mask wipes?)\b/i.test(prompt) && !layers.some((layer) => layer.clip !== undefined)) gaps.push('requested clipping or masking, but no layer clip exists');
  if (/\bshadows?\b/i.test(prompt) && !layers.some((layer) => 'shadow' in layer && layer.shadow !== undefined)) gaps.push('requested shadows, but no layer shadow exists');
  if (/\bblend modes?\b/i.test(prompt) && !layers.some((layer) => layer.blendMode !== 'source-over')) gaps.push('requested blend modes, but every layer uses source-over');
  if (/\b(?:camera movements?|camera pushes?|parallax|layered transforms?)\b/i.test(prompt) && !tracks.some((track) => track.target.startsWith('transform.'))) gaps.push('requested camera or layered transform motion, but no transform track exists');
  return gaps;
}
const studioStateSchema = z.object({
  version: z.literal(1),
  nodes: z.array(nodeSchema),
  edges: z.array(z.object({ id: z.string().min(1), from: z.string().min(1), to: z.string().min(1), label: z.string().default('') })),
  references: z.array(z.object({
    id: z.string().min(1), path: z.string().min(1), title: z.string().min(1), notes: z.string().default(''),
    tags: z.array(z.string()).default([]), createdAt: z.string().datetime(),
  })),
  updatedAt: z.string().datetime(),
});
export type StudioState = z.infer<typeof studioStateSchema>;

const requestSchema = z.object({
  prompt: z.string().min(3).max(20_000),
  selection: z.object({ sceneId: z.string().optional(), layerId: z.string().optional(), frame: z.number().int().nonnegative().optional() }).default({}),
  host: z.enum(['codex', 'claude', 'hermes']).optional(),
});
const renderRequestSchema = z.object({
  filename: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(mp4|mov|webm)$/),
  quality: z.enum(['draft', 'standard', 'high']).default('high'),
  codec: z.enum(['h264', 'h265', 'vp9', 'prores']).default('h264'),
  overwrite: z.boolean().default(false),
  resolution: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
});
const revealExportSchema = z.object({
  filename: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(mp4|mov|webm)$/),
});
const contactSheetSchema = z.object({
  count: z.number().int().min(4).max(40).default(12), columns: z.number().int().min(2).max(8).default(4),
}).strict();
const connectReferenceSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{16}$/), referenceId: z.string().min(1), sceneId: z.string().min(1), studio: studioStateSchema,
}).strict();
const createProjectSchema = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1).max(120),
  mode: z.enum(['walkthrough', 'launch', 'pitch', 'explainer']),
  audience: z.string().min(2).max(300),
  promise: z.string().min(2).max(500),
  proof: z.string().min(2).max(500),
  desiredAction: z.string().min(2).max(300),
  duration: z.number().min(3).max(600),
  width: z.number().int().min(64).max(8192).default(1920),
  height: z.number().int().min(64).max(8192).default(1080),
});
const openProjectSchema = z.object({ id: z.string().regex(/^[a-f0-9]{16}$/) });

export interface StudioRequestRecord {
  id: string; prompt: string; selection: AgentSelection;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'resolved' | 'failed' | 'interrupted';
  createdAt: string; updatedAt?: string; startedAt?: string; completedAt?: string; resolvedAt?: string;
  host?: AgentHostId; activity?: string; response?: string; error?: string; sessionId?: string;
  beforeRevision?: string; afterRevision?: string;
}

export function isTransientAgentFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:\b429\b|rate.?limit|too many requests|\b50[234]\b|service unavailable|gateway timeout|connection (?:reset|closed|refused)|socket hang up|timed? ?out|temporar(?:y|ily)|provider overloaded)/i.test(message);
}
interface RenderJob { id: string; status: 'queued' | 'rendering' | 'complete' | 'failed' | 'cancelled'; progress: number; output?: string; error?: string; width?: number; height?: number; quality?: 'draft' | 'standard' | 'high' }
interface ExportRecord { filename: string; output: string; size: number; modifiedAt: string }
interface AssetRecord { path: string; size: number; modifiedAt: string; kind: 'image' | 'video' | 'audio' | 'font' | 'asset'; uses: number }
interface StudioWorkspace { root: string; servers: Map<string, StudioServer> }
interface StudioProjectSummary { id: string; title: string; directory: string; width: number; height: number; modifiedAt: string; active: boolean }
export interface StudioOptions { host?: string; port?: number; agentRuntime?: AgentRuntime; agentRuntimeFactory?: (projectDir: string) => AgentRuntime; revealFile?: (file: string) => Promise<void>; workspaceRoot?: string; workspace?: StudioWorkspace }
export interface StudioServer { url: string; close: () => Promise<void>; server: Server }

const mediaExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.mp4', '.mov', '.webm', '.mkv', '.m4v', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.woff', '.woff2', '.ttf', '.otf']);
const referenceExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

export class ByteLruCache {
  private readonly entries = new Map<string, Buffer>();
  private bytes = 0;
  constructor(private readonly maxBytes: number, private readonly maxEntries: number) {}
  get(key: string): Buffer | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }
  set(key: string, value: Buffer): void {
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.byteLength;
    this.entries.delete(key);
    this.entries.set(key, value);
    this.bytes += value.byteLength;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.bytes -= oldest[1].byteLength;
    }
  }
  clear(): void { this.entries.clear(); this.bytes = 0; }
  get size(): number { return this.entries.size; }
  get byteLength(): number { return this.bytes; }
}

function hasExpectedSignature(extension: string, body: Buffer): boolean {
  const ascii = (start: number, end: number): string => body.subarray(start, end).toString('ascii');
  if (extension === '.png') return body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg' || extension === '.jpeg') return body[0] === 0xff && body[1] === 0xd8 && body.at(-2) === 0xff && body.at(-1) === 0xd9;
  if (extension === '.gif') return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
  if (extension === '.webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (extension === '.avif') return ascii(4, 8) === 'ftyp' && ascii(8, 16).includes('avif');
  if (['.mp4', '.mov', '.m4v', '.m4a'].includes(extension)) return ascii(4, 8) === 'ftyp';
  if (extension === '.webm' || extension === '.mkv') return body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (extension === '.mp3') return ascii(0, 3) === 'ID3' || (body[0] === 0xff && (body[1] ?? 0) >= 0xe0);
  if (extension === '.wav') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
  if (extension === '.ogg') return ascii(0, 4) === 'OggS';
  if (extension === '.aac') return body[0] === 0xff && ((body[1] ?? 0) & 0xf6) === 0xf0;
  if (extension === '.woff') return ascii(0, 4) === 'wOFF';
  if (extension === '.woff2') return ascii(0, 4) === 'wOF2';
  if (extension === '.otf') return ascii(0, 4) === 'OTTO';
  if (extension === '.ttf') return body.subarray(0, 4).equals(Buffer.from([0x00, 0x01, 0x00, 0x00]));
  return false;
}

function assetKind(file: string): AssetRecord['kind'] {
  const extension = path.extname(file).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'].includes(extension)) return 'image';
  if (['.mp4', '.mov', '.webm', '.mkv', '.m4v'].includes(extension)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(extension)) return 'audio';
  if (['.woff', '.woff2', '.ttf', '.otf'].includes(extension)) return 'font';
  return 'asset';
}

async function listProjectAssets(projectDir: string, project: GenmotionProject, studio: StudioState): Promise<AssetRecord[]> {
  const usage = new Map<string, number>();
  const use = (file: string | undefined): void => { if (file) usage.set(file, (usage.get(file) ?? 0) + 1); };
  for (const scene of project.scenes) for (const layer of scene.layers) { if ('src' in layer) use(layer.src); if (layer.type === 'text') use(layer.fontFile); }
  for (const track of project.audio) use(track.src);
  for (const font of project.brand.fonts) use(font.file);
  for (const reference of studio.references) use(reference.path);

  const files = new Set(usage.keys());
  const assetsRoot = path.join(projectDir, 'assets');
  const pending = [assetsRoot];
  while (pending.length > 0 && files.size < 10_000) {
    const directory = pending.pop();
    if (!directory) break;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) files.add(path.relative(projectDir, absolute).replaceAll('\\', '/'));
    }
  }
  const records = await Promise.all([...files].map(async (file): Promise<AssetRecord | undefined> => {
    try {
      const info = await stat(resolveProjectAsset(projectDir, file));
      if (!info.isFile()) return undefined;
      return { path: file, size: info.size, modifiedAt: info.mtime.toISOString(), kind: assetKind(file), uses: usage.get(file) ?? 0 };
    } catch { return undefined; }
  }));
  return records.filter((record): record is AssetRecord => record !== undefined).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function revision(project: GenmotionProject): string {
  return createHash('sha256').update(JSON.stringify(project)).digest('hex').slice(0, 16);
}

async function atomicWrite(file: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, file);
}

export function fileManagerRevealCommand(platform: NodeJS.Platform, file: string): { command: string; args: string[]; windowsHide: boolean } {
  if (platform === 'win32') return { command: 'explorer.exe', args: [`/select,${file}`], windowsHide: false };
  if (platform === 'darwin') return { command: 'open', args: ['-R', file], windowsHide: true };
  return { command: 'xdg-open', args: [path.dirname(file)], windowsHide: true };
}

async function revealInFileManager(file: string): Promise<void> {
  const { command, args, windowsHide } = fileManagerRevealCommand(process.platform, file);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide });
    child.once('spawn', () => { child.unref(); resolve(); });
    child.once('error', reject);
  });
}

function initialStudioState(project: GenmotionProject): StudioState {
  const nodes: StudioState['nodes'] = [{ id: 'brief', kind: 'brief', x: 40, y: 160, label: 'Creative brief', note: project.metadata.audience ?? '', color: '#22c55e' }];
  const edges: StudioState['edges'] = [];
  project.scenes.forEach((scene, index) => {
    const id = `scene:${scene.id}`;
    nodes.push({ id, kind: 'scene', sceneId: scene.id, x: 360 + index * 310, y: 130 + (index % 2) * 170, label: scene.id, note: scene.purpose, color: '#8b5cf6' });
    edges.push({ id: `edge:${index}`, from: index === 0 ? 'brief' : `scene:${project.scenes[index - 1]?.id ?? ''}`, to: id, label: index === 0 ? 'direction' : 'then' });
  });
  nodes.push({ id: 'output', kind: 'output', x: 420 + project.scenes.length * 310, y: 170, label: 'Master export', note: `${project.width}×${project.height}`, color: '#f59e0b' });
  const last = project.scenes.at(-1);
  if (last) edges.push({ id: 'edge:output', from: `scene:${last.id}`, to: 'output', label: 'render' });
  return { version: 1, nodes, edges, references: [], updatedAt: new Date().toISOString() };
}

export function reconcileStudioState(project: GenmotionProject, state: StudioState): StudioState {
  const defaults = initialStudioState(project);
  const existing = new Map(state.nodes.map((node) => [node.id, node]));
  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  const layerIds = new Set(project.scenes.flatMap((scene) => scene.layers.map((layer) => `layer:${scene.id}:${layer.id}`)));
  const referenceIds = new Set(state.references.map((reference) => `reference:${reference.id}`));
  const existingSceneIds = state.nodes.filter((node) => node.kind === 'scene').map((node) => node.sceneId).filter((id): id is string => id !== undefined);
  const topologyMatches = existingSceneIds.length === project.scenes.length && existingSceneIds.every((id, index) => id === project.scenes[index]?.id);
  const rightmostSceneX = Math.max(...state.nodes.filter((node) => node.kind === 'scene' && sceneIds.has(node.sceneId ?? '')).map((node) => node.x), Number.NEGATIVE_INFINITY);
  const core = defaults.nodes.map((fallback) => {
    const current = existing.get(fallback.id);
    const preservePosition = current && (
      fallback.kind === 'brief'
      || (fallback.kind === 'scene' && topologyMatches)
      || (fallback.kind === 'output' && topologyMatches && current.x > rightmostSceneX)
    );
    return current ? { ...fallback, x: preservePosition ? current.x : fallback.x, y: preservePosition ? current.y : fallback.y, color: current.color } : fallback;
  });
  const custom = state.nodes.filter((node) => {
    if (node.kind === 'brief' || node.kind === 'scene' || node.kind === 'output') return false;
    if (node.kind === 'layer') return layerIds.has(node.id) && node.sceneId !== undefined && sceneIds.has(node.sceneId);
    if (node.kind === 'reference') return referenceIds.has(node.id);
    return true;
  });
  const nodes = [...core.slice(0, -1), ...custom, ...core.slice(-1)];
  const nodeKinds = new Map(nodes.map((node) => [node.id, node.kind]));
  const isSequenceEdge = (edge: StudioState['edges'][number]): boolean => {
    const from = nodeKinds.get(edge.from);
    const to = nodeKinds.get(edge.to);
    return (from === 'brief' || from === 'scene') && (to === 'scene' || to === 'output');
  };
  const edges = state.edges.filter((edge) => nodeKinds.has(edge.from) && nodeKinds.has(edge.to) && !isSequenceEdge(edge));
  project.scenes.forEach((scene, index) => {
    edges.push({
      id: `edge:sequence:${scene.id}`,
      from: index === 0 ? 'brief' : `scene:${project.scenes[index - 1]?.id ?? ''}`,
      to: `scene:${scene.id}`,
      label: index === 0 ? 'direction' : 'then',
    });
  });
  const last = project.scenes.at(-1);
  if (last) edges.push({ id: 'edge:output:sequence', from: `scene:${last.id}`, to: 'output', label: 'render' });
  return studioStateSchema.parse({ ...state, nodes, edges });
}

export function autoLayoutStudioState(project: GenmotionProject, state: StudioState): StudioState {
  const reconciled = reconcileStudioState(project, state);
  const nodes = new Map(reconciled.nodes.map((node) => [node.id, { ...node }]));
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(project.scenes.length))));
  const columnWidth = 330;
  const rowHeights: number[] = [];
  project.scenes.forEach((scene, index) => {
    const row = Math.floor(index / columns);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, 190 + scene.layers.length * 58);
  });
  const rowOffsets = rowHeights.map((_, row) => 100 + rowHeights.slice(0, row).reduce((sum, height) => sum + height + 90, 0));
  const brief = nodes.get('brief');
  if (brief) Object.assign(brief, { x: 40, y: 100 });
  project.scenes.forEach((scene, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = 360 + column * columnWidth;
    const y = rowOffsets[row] ?? 100;
    const sceneNode = nodes.get(`scene:${scene.id}`);
    if (sceneNode) Object.assign(sceneNode, { x, y });
    scene.layers.forEach((layer, layerIndex) => {
      const id = `layer:${scene.id}:${layer.id}`;
      const current = nodes.get(id);
      nodes.set(id, {
        id, kind: 'layer', sceneId: scene.id, layerId: layer.id, x: x + 32, y: y + 118 + layerIndex * 58,
        label: layer.id, note: '', color: current?.color ?? '#38bdf8',
      });
    });
  });
  const lastIndex = Math.max(0, project.scenes.length - 1);
  const lastRow = Math.floor(lastIndex / columns);
  const lastColumn = lastIndex % columns;
  const output = nodes.get('output');
  if (output) Object.assign(output, { x: 360 + (lastColumn + 1) * columnWidth, y: rowOffsets[lastRow] ?? 100 });
  const generated = new Set(['brief', 'output', ...project.scenes.map((scene) => `scene:${scene.id}`), ...project.scenes.flatMap((scene) => scene.layers.map((layer) => `layer:${scene.id}:${layer.id}`))]);
  const custom = [...nodes.values()].filter((node) => !generated.has(node.id));
  const customY = (rowOffsets.at(-1) ?? 100) + (rowHeights.at(-1) ?? 0) + 110;
  custom.forEach((node, index) => Object.assign(node, { x: 40 + (index % columns) * columnWidth, y: customY + Math.floor(index / columns) * 130 }));
  return studioStateSchema.parse({ ...reconciled, nodes: [...nodes.values()], updatedAt: new Date().toISOString() });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return fallback; }
}

async function writeProjectFile(file: string, project: GenmotionProject): Promise<void> {
  const body = path.extname(file).toLowerCase() === '.json' ? `${JSON.stringify(project, null, 2)}\n` : YAML.stringify(project);
  await atomicWrite(file, body);
}

function safeAssetName(filename: string): string {
  return path.basename(filename).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'asset';
}

async function listRequests(directory: string): Promise<StudioRequestRecord[]> {
  try {
    const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
    const records = await Promise.all(files.map(async (file) => readJson<StudioRequestRecord | null>(path.join(directory, file), null)));
    return records.filter((record): record is StudioRequestRecord => record !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}

async function listExports(rendersDir: string, projectDir: string): Promise<ExportRecord[]> {
  const entries = await readdir(rendersDir, { withFileTypes: true });
  const exports = await Promise.all(entries.filter((entry) => entry.isFile() && /\.(mp4|mov|webm)$/i.test(entry.name)).map(async (entry) => {
    const file = path.join(rendersDir, entry.name);
    const metadata = await stat(file);
    return { filename: entry.name, output: path.relative(projectDir, file).replaceAll('\\', '/'), size: metadata.size, modifiedAt: metadata.mtime.toISOString() };
  }));
  return exports.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function projectId(directory: string): string {
  return createHash('sha256').update(path.resolve(directory).toLowerCase()).digest('hex').slice(0, 16);
}

async function discoverProjects(workspace: StudioWorkspace, currentProjectDir: string): Promise<StudioProjectSummary[]> {
  await mkdir(workspace.root, { recursive: true });
  const candidates = new Set<string>([path.resolve(currentProjectDir), ...workspace.servers.keys()]);
  for (const entry of await readdir(workspace.root, { withFileTypes: true })) if (entry.isDirectory()) candidates.add(path.join(workspace.root, entry.name));
  const projects = await Promise.all([...candidates].map(async (directory): Promise<StudioProjectSummary | undefined> => {
    try {
      const loaded = await loadProject(directory);
      const metadata = await stat(loaded.projectFile);
      return { id: projectId(loaded.projectDir), title: loaded.sourceProject.title, directory: loaded.projectDir, width: loaded.sourceProject.width, height: loaded.sourceProject.height, modifiedAt: metadata.mtime.toISOString(), active: workspace.servers.has(path.resolve(loaded.projectDir)) };
    } catch { return undefined; }
  }));
  return projects.filter((project): project is StudioProjectSummary => project !== undefined).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

async function writeRequest(directory: string, record: StudioRequestRecord): Promise<void> {
  await atomicWrite(path.join(directory, `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  if (['completed', 'resolved', 'failed', 'interrupted'].includes(record.status)) await pruneTerminalRequests(directory);
}

const requestRetentionLimit = 500;
async function pruneTerminalRequests(directory: string): Promise<void> {
  const records = await listRequests(directory);
  const terminal = records.filter((candidate) => ['completed', 'resolved', 'failed', 'interrupted'].includes(candidate.status));
  await Promise.all(terminal.slice(requestRetentionLimit).map((candidate) => rm(path.join(directory, `${candidate.id}.json`), { force: true })));
}

export async function resolveStudioRequest(projectDir: string, id: string, response: string): Promise<StudioRequestRecord> {
  if (!/^[a-f0-9-]{16,64}$/i.test(id)) throw new Error('Invalid request id.');
  const file = path.join(projectDir, '.genmotion', 'requests', `${id}.json`);
  const record = await readJson<StudioRequestRecord | null>(file, null);
  if (!record) throw new Error(`Studio request not found: ${id}`);
  const resolved = { ...record, status: 'resolved' as const, response, resolvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await writeRequest(path.dirname(file), resolved);
  return resolved;
}

export async function getStudioRequests(projectDir: string): Promise<StudioRequestRecord[]> {
  return listRequests(path.join(projectDir, '.genmotion', 'requests'));
}

export async function startStudio(loaded: LoadedProject, options: StudioOptions = {}): Promise<StudioServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4180;
  const token = randomBytes(24).toString('base64url');
  const studioDir = path.join(loaded.projectDir, '.genmotion');
  const stateFile = path.join(studioDir, 'studio.json');
  const historyDir = path.join(studioDir, 'history');
  const requestsDir = path.join(studioDir, 'requests');
  const rendersDir = path.join(loaded.projectDir, 'renders');
  const ownsWorkspace = options.workspace === undefined;
  const workspace = options.workspace ?? { root: path.resolve(options.workspaceRoot ?? path.join(os.homedir(), 'Genmotion Projects')), servers: new Map<string, StudioServer>() };
  await Promise.all([mkdir(historyDir, { recursive: true }), mkdir(requestsDir, { recursive: true }), mkdir(rendersDir, { recursive: true })]);

  let motionCatalog = await loadMotionLibraries(loaded.projectDir);
  let sourceProject = loaded.sourceProject;
  let compiledProject = compileProjectMotions(sourceProject, motionCatalog.motions);
  const storedStudioState = studioStateSchema.parse(await readJson(stateFile, initialStudioState(sourceProject)));
  let studioState = reconcileStudioState(sourceProject, storedStudioState);
  if (JSON.stringify(studioState) !== JSON.stringify(storedStudioState)) {
    studioState = { ...studioState, updatedAt: new Date().toISOString() };
    await atomicWrite(stateFile, `${JSON.stringify(studioState, null, 2)}\n`);
  }
  const reconcileAndPersistStudio = async (project: GenmotionProject): Promise<void> => {
    const reconciled = reconcileStudioState(project, studioState);
    if (JSON.stringify(reconciled) === JSON.stringify(studioState)) return;
    studioState = { ...reconciled, updatedAt: new Date().toISOString() };
    await atomicWrite(stateFile, `${JSON.stringify(studioState, null, 2)}\n`);
  };
  const jobs = new Map<string, RenderJob>();
  const renderControllers = new Map<string, AbortController>();
  const frameCache = new ByteLruCache(128 * 1024 * 1024, 120);
  let renderQueue = Promise.resolve();
  const agentRuntime = options.agentRuntime ?? options.agentRuntimeFactory?.(loaded.projectDir) ?? new LocalAgentRuntime(loaded.projectDir);
  const revealFile = options.revealFile ?? revealInFileManager;
  let agentHosts = await agentRuntime.hosts();
  let agentBusy = false;
  let agentQueue = Promise.resolve();
  let currentAgent: { id: string; controller: AbortController } | undefined;
  const writeHistory = async (projectRevision: string, project: GenmotionProject): Promise<void> => {
    await atomicWrite(path.join(historyDir, `${projectRevision}.json`), `${JSON.stringify(project, null, 2)}\n`);
    const files = await readdir(historyDir);
    const histories = await Promise.all(files.filter((file) => /^[a-f0-9]{16}\.json$/.test(file)).map(async (file) => ({ file, modified: (await stat(path.join(historyDir, file))).mtimeMs })));
    await Promise.all(histories.sort((a, b) => b.modified - a.modified).slice(100).map((entry) => rm(path.join(historyDir, entry.file), { force: true })));
  };
  const app = express();
  app.disable('x-powered-by');

  app.use((request, response, next) => {
    const scriptNonce = randomBytes(18).toString('base64');
    response.locals.scriptNonce = scriptNonce;
    response.set({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Content-Security-Policy': `default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${scriptNonce}'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      'Cache-Control': 'no-store',
    });
    const fetchSite = request.header('sec-fetch-site');
    if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) { response.status(403).json({ error: 'Cross-site Studio requests are not allowed.' }); return; }
    const origin = request.header('origin');
    if (origin) {
      try { if (new URL(origin).host !== request.header('host')) { response.status(403).json({ error: 'Studio request origin does not match this host.' }); return; } } catch { response.status(403).json({ error: 'Studio request origin is invalid.' }); return; }
    }
    if (!request.path.startsWith('/api/') || request.method === 'GET') { next(); return; }
    if (request.header('x-genmotion-token') !== token) { response.status(403).json({ error: 'Invalid Studio session token.' }); return; }
    next();
  });
  app.use('/api', express.json({ limit: '10mb', type: ['application/json', 'application/*+json'] }));
  app.use('/api/assets', express.raw({ limit: '100mb', type: 'application/octet-stream' }));

  for (const record of await listRequests(requestsDir)) {
    if (record.status === 'running' || record.status === 'queued') {
      const interruptedAt = new Date().toISOString();
      await writeRequest(requestsDir, { ...record, status: 'interrupted', activity: 'Interrupted', error: 'Studio stopped before this agent turn finished. Submit the request again if it is still needed.', completedAt: interruptedAt, updatedAt: interruptedAt });
    }
  }

  app.get('/', (_request, response) => { response.type('html').send(studioHtml(String(response.locals.scriptNonce ?? ''))); });
  app.get('/favicon.ico', (_request, response) => { response.type('image/png').set('Cache-Control', 'public, max-age=86400').send(readGenmotionBrandAsset('favicon-32.png')); });
  app.get('/brand/:name', (request, response) => {
    const name = request.params.name ?? '';
    if (!isGenmotionBrandAsset(name)) { response.status(404).end(); return; }
    response.type(path.extname(name)).set('Cache-Control', 'public, max-age=86400').send(readGenmotionBrandAsset(name));
  });
  app.get('/api/session', (_request, response) => { response.json({ token }); });
  app.get('/api/bootstrap', async (_request, response, next) => {
    try {
      if (!agentBusy) {
        const refreshed = await loadProject(loaded.projectFile);
        motionCatalog = await loadMotionLibraries(loaded.projectDir);
        if (revision(refreshed.sourceProject) !== revision(sourceProject)) {
          sourceProject = refreshed.sourceProject;
          compiledProject = refreshed.project;
          frameCache.clear();
          await reconcileAndPersistStudio(sourceProject);
        }
      }
      const currentLoaded = { ...loaded, project: compiledProject, sourceProject };
      response.json({
        project: sourceProject, studio: studioState, revision: revision(sourceProject),
        findings: await validateProject(currentLoaded), duration: projectDuration(sourceProject),
        catalog: { motions: motionCatalog.motions, motionLibraries: motionCatalog.libraries, references: tasteReferences, blueprints: sceneBlueprints },
        requests: await listRequests(requestsDir), jobs: [...jobs.values()], exports: await listExports(rendersDir, loaded.projectDir), assets: await listProjectAssets(loaded.projectDir, sourceProject, studioState), projects: await discoverProjects(workspace, loaded.projectDir), workspaceRoot: workspace.root, currentProjectId: projectId(loaded.projectDir), agents: agentHosts, projectFile: path.basename(loaded.projectFile),
      });
    } catch (error) { next(error); }
  });
  app.put('/api/project', async (request, response, next) => {
    try {
      if (agentBusy) { response.status(423).json({ error: 'The agent is applying a project change. Editing unlocks when the turn finishes.' }); return; }
      const body = z.object({ revision: z.string(), project: projectSchema }).parse(request.body);
      const currentRevision = revision(sourceProject);
      if (body.revision !== currentRevision) { response.status(409).json({ error: 'Project changed since this Studio loaded it.', revision: currentRevision, project: sourceProject }); return; }
      const nextRevision = revision(body.project);
      const nextCompiled = compileProjectMotions(body.project, motionCatalog.motions);
      await writeHistory(currentRevision, sourceProject);
      await writeProjectFile(loaded.projectFile, body.project);
      sourceProject = body.project;
      compiledProject = nextCompiled;
      frameCache.clear();
      await reconcileAndPersistStudio(sourceProject);
      response.json({ ok: true, revision: nextRevision, project: sourceProject, studio: studioState, findings: await validateProject({ ...loaded, project: compiledProject, sourceProject }) });
    } catch (error) { next(error); }
  });
  app.put('/api/studio', async (request, response, next) => {
    try {
      const submitted = studioStateSchema.parse({ ...request.body, updatedAt: new Date().toISOString() });
      studioState = reconcileStudioState(sourceProject, submitted);
      await atomicWrite(stateFile, `${JSON.stringify(studioState, null, 2)}\n`);
      response.json({ ok: true, studio: studioState });
    } catch (error) { next(error); }
  });
  app.post('/api/studio/auto-layout', async (request, response, next) => {
    try {
      studioState = autoLayoutStudioState(sourceProject, studioState);
      await atomicWrite(stateFile, `${JSON.stringify(studioState, null, 2)}\n`);
      response.json({ ok: true, studio: studioState });
    } catch (error) { next(error); }
  });
  app.post('/api/references/connect', async (request, response, next) => {
    try {
      if (agentBusy) { response.status(423).json({ error: 'The agent is applying a project change. Editing unlocks when the turn finishes.' }); return; }
      const body = connectReferenceSchema.parse(request.body);
      const currentRevision = revision(sourceProject);
      if (body.revision !== currentRevision) { response.status(409).json({ error: 'Project changed since this Studio loaded it.', revision: currentRevision, project: sourceProject, studio: studioState }); return; }
      const nextStudio = reconcileStudioState(sourceProject, studioStateSchema.parse({ ...body.studio, updatedAt: new Date().toISOString() }));
      const reference = nextStudio.references.find((item) => item.id === body.referenceId);
      const nextProject = structuredClone(sourceProject);
      const scene = nextProject.scenes.find((item) => item.id === body.sceneId);
      if (!reference || !scene) { response.status(404).json({ error: 'Reference or scene no longer exists.' }); return; }
      const edgeExists = nextStudio.edges.some((edge) => edge.from === `reference:${reference.id}` && edge.to === `scene:${scene.id}`);
      if (!edgeExists) nextStudio.edges.push({ id: `refedge:${randomUUID()}`, from: `reference:${reference.id}`, to: `scene:${scene.id}`, label: 'informs' });
      const decision = `Studio reference ${reference.title}: ${reference.notes || reference.tags.join(', ')}`;
      if (!scene.notes.includes(decision)) scene.notes.push(decision);
      const nextCompiled = compileProjectMotions(nextProject, motionCatalog.motions);
      const findings = await validateProject({ ...loaded, project: nextCompiled, sourceProject: nextProject });
      const nextRevision = revision(nextProject);
      await Promise.all([
        writeHistory(currentRevision, sourceProject),
        writeProjectFile(loaded.projectFile, nextProject),
        atomicWrite(stateFile, `${JSON.stringify(nextStudio, null, 2)}\n`),
      ]);
      sourceProject = nextProject; compiledProject = nextCompiled; studioState = nextStudio; frameCache.clear();
      response.json({ ok: true, revision: nextRevision, project: sourceProject, studio: studioState, findings });
    } catch (error) { next(error); }
  });
  app.get('/api/history', async (_request, response) => {
    const files = (await readdir(historyDir)).filter((file) => file.endsWith('.json'));
    const entries = await Promise.all(files.map(async (file) => ({ revision: path.basename(file, '.json'), modifiedAt: (await stat(path.join(historyDir, file))).mtime.toISOString() })));
    response.json(entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 50));
  });
  app.post('/api/history/:revision/restore', async (request, response, next) => {
    try {
      const requested = request.params.revision ?? '';
      if (!/^[a-f0-9]{16}$/.test(requested)) { response.status(400).json({ error: 'Invalid revision.' }); return; }
      const restored = projectSchema.parse(JSON.parse(await readFile(path.join(historyDir, `${requested}.json`), 'utf8')));
      const restoredCompiled = compileProjectMotions(restored, motionCatalog.motions);
      const currentRevision = revision(sourceProject);
      await writeHistory(currentRevision, sourceProject);
      await writeProjectFile(loaded.projectFile, restored);
      sourceProject = restored; compiledProject = restoredCompiled; frameCache.clear();
      await reconcileAndPersistStudio(sourceProject);
      response.json({ ok: true, revision: revision(restored), project: restored, studio: studioState });
    } catch (error) { next(error); }
  });
  app.post('/api/assets', async (request, response, next) => {
    try {
      const filename = safeAssetName(typeof request.query.filename === 'string' ? request.query.filename : '');
      const purpose = request.query.purpose === 'reference' ? 'reference' : 'asset';
      const extension = path.extname(filename).toLowerCase();
      const allowed = purpose === 'reference' ? referenceExtensions : mediaExtensions;
      if (!allowed.has(extension)) { response.status(415).json({ error: `Unsupported ${purpose} file type.` }); return; }
      const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      if (body.length === 0) { response.status(400).json({ error: 'Asset is empty.' }); return; }
      if (!hasExpectedSignature(extension, body)) { response.status(415).json({ error: `File content does not match ${extension}.` }); return; }
      const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
      const relative = path.posix.join('assets', 'studio', `${hash}-${filename}`);
      await atomicWrite(path.join(loaded.projectDir, ...relative.split('/')), body);
      response.json({ path: relative, size: body.length, hash });
    } catch (error) { next(error); }
  });
  app.get('/api/assets', async (_request, response, next) => {
    try { response.json(await listProjectAssets(loaded.projectDir, sourceProject, studioState)); } catch (error) { next(error); }
  });
  app.delete('/api/assets', async (request, response, next) => {
    try {
      const body = z.object({ path: z.string().min(1) }).strict().parse(request.body);
      if (!body.path.replaceAll('\\', '/').startsWith('assets/studio/')) { response.status(403).json({ error: 'Only Studio-imported assets can be deleted here.' }); return; }
      const inventory = await listProjectAssets(loaded.projectDir, sourceProject, studioState);
      const asset = inventory.find((record) => record.path === body.path);
      if (!asset) { response.status(404).json({ error: 'Asset not found.' }); return; }
      if (asset.uses > 0) { response.status(409).json({ error: `Asset is still used ${String(asset.uses)} time${asset.uses === 1 ? '' : 's'}. Remove or replace those uses first.` }); return; }
      await rm(resolveProjectAsset(loaded.projectDir, asset.path), { force: true });
      response.json({ ok: true, assets: await listProjectAssets(loaded.projectDir, sourceProject, studioState) });
    } catch (error) { next(error); }
  });
  app.get('/api/motion-libraries', (_request, response) => { response.json(motionCatalog.libraries); });
  app.post('/api/motion-libraries', async (request, response, next) => {
    try {
      if (agentBusy) { response.status(423).json({ error: 'Wait for the active agent turn to finish before importing a motion library.' }); return; }
      const parsed = compileCustomLibrary(request.body);
      const prospective = [...motionCatalog.motions.filter((recipe) => recipe.libraryId !== parsed.library.id), ...parsed.recipes];
      const nextCompiled = compileProjectMotions(sourceProject, prospective);
      const summary = await saveMotionLibrary(loaded.projectDir, request.body);
      const nextCatalog = await loadMotionLibraries(loaded.projectDir);
      motionCatalog = nextCatalog;
      compiledProject = nextCompiled;
      frameCache.clear();
      response.status(201).json({ library: summary, catalog: { motions: motionCatalog.motions, motionLibraries: motionCatalog.libraries } });
    } catch (error) { next(error); }
  });
  app.get('/asset/*path', (request, response, next) => {
    try {
      const assetPath = Array.isArray(request.params.path) ? request.params.path.join('/') : request.params.path ?? '';
      response.sendFile(resolveProjectAsset(loaded.projectDir, assetPath));
    } catch (error) { next(error); }
  });
  app.get('/frame/:frame.png', async (request, response, next) => {
    try {
      const frame = Number.parseInt(request.params.frame ?? '', 10);
      const frames = Math.ceil(projectDuration(compiledProject) * compiledProject.fps);
      if (!Number.isInteger(frame) || frame < 0 || frame >= frames) { response.status(400).json({ error: 'Frame is outside the composition.' }); return; }
      const key = `${revision(sourceProject)}:${String(frame)}`;
      let png = frameCache.get(key);
      if (!png) {
        png = await renderFramePng(compiledProject, loaded.projectDir, frame);
        frameCache.set(key, png);
      }
      response.type('png').set('Cache-Control', 'private, max-age=31536000, immutable').send(png);
    } catch (error) { next(error); }
  });
  app.post('/api/requests', async (request, response, next) => {
    try {
      const activeRequests = (await listRequests(requestsDir)).filter((record) => record.status === 'queued' || record.status === 'running');
      if (activeRequests.length >= 20) { response.status(429).json({ error: 'The agent queue is full. Wait for an active turn to finish or cancel queued work.' }); return; }
      const body = requestSchema.parse(request.body);
      const selection: StudioRequestRecord['selection'] = {};
      if (body.selection.sceneId !== undefined) selection.sceneId = body.selection.sceneId;
      if (body.selection.layerId !== undefined) selection.layerId = body.selection.layerId;
      if (body.selection.frame !== undefined) selection.frame = body.selection.frame;
      const host = body.host;
      if (host) {
        const available = agentHosts.find((candidate) => candidate.id === host);
        if (!available?.installed || !available.authenticated) {
          const label = host === 'codex' ? 'Codex' : host === 'claude' ? 'Claude' : 'Hermes ACP';
          response.status(409).json({ error: `${label} is not available on this machine.` });
          return;
        }
      }
      const record: StudioRequestRecord = {
        id: randomUUID(), prompt: body.prompt, selection, status: host ? 'queued' : 'pending', createdAt: new Date().toISOString(),
        ...(host ? { host, activity: 'Queued', beforeRevision: revision(sourceProject) } : {}),
      };
      await writeRequest(requestsDir, record);
      response.status(201).json(record);
      if (host) {
        agentQueue = agentQueue.then(async () => {
          const latest = await readJson<StudioRequestRecord | null>(path.join(requestsDir, `${record.id}.json`), null);
          if (!latest || latest.status === 'interrupted') return;
          agentBusy = true;
          const controller = new AbortController();
          currentAgent = { id: record.id, controller };
          const startedAt = new Date().toISOString();
          const running: StudioRequestRecord = { ...record, status: 'running', activity: 'Starting agent', startedAt, updatedAt: startedAt };
          await writeRequest(requestsDir, running);
          const beforeProjectFile = await readFile(loaded.projectFile, 'utf8');
          let lastPersisted = 0;
          try {
            const reportProgress = async (progress: { message?: string; activity?: string; sessionId?: string }): Promise<void> => {
              if (progress.message !== undefined) running.response = progress.message;
              if (progress.activity !== undefined) running.activity = progress.activity;
              if (progress.sessionId !== undefined) running.sessionId = progress.sessionId;
              const now = Date.now();
              if (now - lastPersisted >= 300) {
                lastPersisted = now;
                running.updatedAt = new Date(now).toISOString();
                await writeRequest(requestsDir, running);
              }
            };
            let result: Awaited<ReturnType<AgentRuntime['run']>> | undefined;
            let refreshed: LoadedProject | undefined;
            let outcomeGaps: string[] = [];
            for (let attempt = 0; attempt < 3; attempt += 1) {
              const prompt = attempt === 0 ? record.prompt : [
                'Continue and finish the original request. The persisted project failed the production acceptance check:',
                ...outcomeGaps.map((gap) => `- ${gap}`),
                'Use the live schema and project tools to repair every listed gap, validate, inspect native frames, and reread the final project. Do not defer any requested work to a later turn.',
                `Original request: ${record.prompt}`,
              ].join('\n');
              if (attempt > 0) {
                running.activity = `Repairing production gaps (${attempt.toString()}/2)`;
                running.updatedAt = new Date().toISOString();
                await writeRequest(requestsDir, running);
              }
              const revisionBeforeCall = revision((await loadProject(loaded.projectFile)).sourceProject);
              for (let providerAttempt = 0; providerAttempt < 3; providerAttempt += 1) {
                try {
                  result = await agentRuntime.run({
                    host, prompt, selection: record.selection, projectDir: loaded.projectDir,
                    projectFile: loaded.projectFile, projectTitle: sourceProject.title,
                    signal: controller.signal,
                  }, reportProgress);
                  break;
                } catch (error) {
                  const current = await loadProject(loaded.projectFile);
                  const safeToRetry = revision(current.sourceProject) === revisionBeforeCall;
                  if (providerAttempt >= 2 || !safeToRetry || !isTransientAgentFailure(error) || controller.signal.aborted) throw error;
                  running.activity = `Provider unavailable; retrying (${(providerAttempt + 1).toString()}/2)`;
                  running.error = error instanceof Error ? error.message : String(error);
                  running.updatedAt = new Date().toISOString();
                  await writeRequest(requestsDir, running);
                  await new Promise((resolve) => setTimeout(resolve, 750 * (providerAttempt + 1)));
                }
              }
              if (!result) throw new GenmotionError('AGENT_PROVIDER_UNAVAILABLE', 'The selected agent provider did not return a result after bounded retries.');
              delete running.error;
              refreshed = await loadProject(loaded.projectFile);
              const attemptFindings = await validateProject(refreshed);
              const attemptErrors = attemptFindings.filter((finding) => finding.severity === 'error');
              if (attemptErrors.length > 0) throw new GenmotionError('AGENT_PROJECT_INVALID', 'The agent left validation errors in the project.', attemptErrors);
              outcomeGaps = requestedOutcomeGaps(record.prompt, refreshed.sourceProject);
              if (isNonExecutionResponse(result.response)) outcomeGaps.push('agent response admitted refusal or partial completion');
              if (outcomeGaps.length === 0) break;
            }
            if (!result || !refreshed) throw new GenmotionError('AGENT_REQUEST_INCOMPLETE', 'The agent did not return a project result.');
            motionCatalog = await loadMotionLibraries(loaded.projectDir);
            const findings = await validateProject(refreshed);
            const errors = findings.filter((finding) => finding.severity === 'error');
            if (errors.length > 0) throw new GenmotionError('AGENT_PROJECT_INVALID', 'The agent left validation errors in the project.', errors);
            if (outcomeGaps.length > 0) {
              throw new GenmotionError('AGENT_REQUEST_INCOMPLETE', 'The agent ended the turn without satisfying the requested production contract.', outcomeGaps);
            }
            const afterRevision = revision(refreshed.sourceProject);
            if (afterRevision === running.beforeRevision && requestRequiresProjectChange(record.prompt)) {
              throw new GenmotionError('AGENT_NO_PROJECT_CHANGE', 'The agent ended the turn without applying the requested project change. Retry the turn or choose another agent runtime.');
            }
            if (afterRevision !== running.beforeRevision) {
              await writeHistory(running.beforeRevision ?? revision(sourceProject), sourceProject);
              sourceProject = refreshed.sourceProject;
              compiledProject = refreshed.project;
              frameCache.clear();
              await reconcileAndPersistStudio(sourceProject);
            }
            const completedAt = new Date().toISOString();
            await writeRequest(requestsDir, {
              ...running, status: 'completed', activity: 'Complete', response: result.response,
              sessionId: result.sessionId, afterRevision, completedAt, updatedAt: completedAt,
            });
          } catch (error) {
            if (host === 'claude' && error instanceof Error && /authentication failed/i.test(error.message)) {
              agentHosts = agentHosts.map((candidate) => candidate.id === 'claude' ? { ...candidate, authenticated: false, detail: 'Run claude auth login' } : candidate);
            }
            if (host === 'hermes' && error instanceof Error && /(?:auth|credential|provider|ACP exited)/i.test(error.message)) {
              agentHosts = agentHosts.map((candidate) => candidate.id === 'hermes' ? { ...candidate, authenticated: false, detail: 'Check the Hermes provider and ACP runtime' } : candidate);
            }
            try {
              const candidate = await loadProject(loaded.projectFile);
              motionCatalog = await loadMotionLibraries(loaded.projectDir);
              const candidateFindings = await validateProject(candidate);
              if (candidateFindings.some((finding) => finding.severity === 'error')) throw new Error('invalid agent edit');
              const candidateRevision = revision(candidate.sourceProject);
              if (candidateRevision !== revision(sourceProject)) {
                await writeHistory(revision(sourceProject), sourceProject);
                sourceProject = candidate.sourceProject;
                compiledProject = candidate.project;
                frameCache.clear();
                await reconcileAndPersistStudio(sourceProject);
                running.afterRevision = candidateRevision;
              }
            } catch {
              const failedEdit = await readFile(loaded.projectFile, 'utf8').catch(() => '');
              if (failedEdit) await atomicWrite(path.join(studioDir, 'failed-agent-edits', `${record.id}${path.extname(loaded.projectFile) || '.json'}`), failedEdit);
              await atomicWrite(loaded.projectFile, beforeProjectFile);
              motionCatalog = await loadMotionLibraries(loaded.projectDir);
              compiledProject = compileProjectMotions(sourceProject, motionCatalog.motions);
              frameCache.clear();
            }
            const failedAt = new Date().toISOString();
            await writeRequest(requestsDir, {
              ...running, status: controller.signal.aborted ? 'interrupted' : 'failed', activity: controller.signal.aborted ? 'Cancelled' : 'Failed', error: error instanceof Error ? error.message : String(error),
              completedAt: failedAt, updatedAt: failedAt,
            });
          } finally { agentBusy = false; currentAgent = undefined; }
        }).catch(() => undefined);
      }
    } catch (error) { next(error); }
  });
  app.get('/api/agents', (_request, response) => { response.json(agentHosts); });
  app.post('/api/agents/refresh', async (_request, response, next) => {
    try { agentHosts = await agentRuntime.hosts(); response.json(agentHosts); } catch (error) { next(error); }
  });
  app.post('/api/requests/:id/cancel', async (request, response, next) => {
    try {
      const id = request.params.id ?? '';
      if (!/^[a-f0-9-]{16,64}$/i.test(id)) { response.status(400).json({ error: 'Invalid request id.' }); return; }
      const file = path.join(requestsDir, `${id}.json`);
      const record = await readJson<StudioRequestRecord | null>(file, null);
      if (!record) { response.status(404).json({ error: 'Agent request not found.' }); return; }
      if (!['queued', 'running'].includes(record.status)) { response.status(409).json({ error: 'Only queued or running agent turns can be cancelled.' }); return; }
      if (currentAgent?.id === id) currentAgent.controller.abort();
      const cancelledAt = new Date().toISOString();
      const cancelled: StudioRequestRecord = { ...record, status: 'interrupted', activity: 'Cancelling', error: 'Cancelled by the Studio user.', completedAt: cancelledAt, updatedAt: cancelledAt };
      await writeRequest(requestsDir, cancelled);
      response.status(202).json(cancelled);
    } catch (error) { next(error); }
  });
  app.get('/api/requests', async (_request, response) => { response.json(await listRequests(requestsDir)); });
  app.post('/api/render', async (request, response, next) => {
    try {
      if ([...jobs.values()].filter((job) => job.status === 'queued' || job.status === 'rendering').length >= 8) { response.status(429).json({ error: 'The render queue is full. Wait for an export to finish.' }); return; }
      const body = renderRequestSchema.parse(request.body);
      const id = randomUUID();
      const output = path.join(rendersDir, body.filename);
      const relativeOutput = path.relative(loaded.projectDir, output).replaceAll('\\', '/');
      if ([...jobs.values()].some((candidate) => candidate.output === relativeOutput && (candidate.status === 'queued' || candidate.status === 'rendering'))) {
        response.status(409).json({ error: 'An export for this filename is already running.' });
        return;
      }
      if (!body.overwrite) {
        try { if ((await stat(output)).isFile()) { response.status(409).json({ error: 'An export with this filename already exists.', code: 'OUTPUT_EXISTS' }); return; } } catch { /* The filename is available. */ }
      }
      const dimensions = resolveRenderResolution(compiledProject, body.quality, body.resolution);
      const job: RenderJob = { id, status: 'queued', progress: 0, output: relativeOutput, ...dimensions, quality: body.quality };
      const controller = new AbortController();
      jobs.set(id, job);
      renderControllers.set(id, controller);
      if (jobs.size > 100) {
        const removable = [...jobs.entries()].find(([, candidate]) => ['complete', 'failed', 'cancelled'].includes(candidate.status));
        if (removable) jobs.delete(removable[0]);
      }
      response.status(202).json(job);
      renderQueue = renderQueue.then(async () => {
        try {
          if (controller.signal.aborted) return;
          job.status = 'rendering';
          await renderProject({ ...loaded, project: compiledProject, sourceProject }, {
            output, quality: body.quality, codec: body.codec, ...(body.resolution ? { resolution: body.resolution } : {}),
            signal: controller.signal,
            onProgress: (progress) => { job.progress = progress.totalFrames === 0 ? 0 : progress.encodedFrames / progress.totalFrames; },
          });
          if (controller.signal.aborted) return;
          job.status = 'complete'; job.progress = 1;
        } catch (error) {
          if (controller.signal.aborted) { job.status = 'cancelled'; job.error = 'Export cancelled.'; }
          else { job.status = 'failed'; job.error = error instanceof Error ? error.message : String(error); }
        } finally { renderControllers.delete(id); }
      });
    } catch (error) { next(error); }
  });
  app.get('/api/jobs', (_request, response) => { response.json([...jobs.values()]); });
  app.post('/api/jobs/:id/cancel', (request, response) => {
    const id = request.params.id ?? '';
    if (!/^[a-f0-9-]{16,64}$/i.test(id)) { response.status(400).json({ error: 'Invalid render job id.' }); return; }
    const job = jobs.get(id);
    if (!job) { response.status(404).json({ error: 'Render job not found.' }); return; }
    if (!['queued', 'rendering'].includes(job.status)) { response.status(409).json({ error: 'Only queued or rendering exports can be cancelled.' }); return; }
    job.status = 'cancelled'; job.error = 'Export cancelled.';
    renderControllers.get(id)?.abort();
    response.status(202).json(job);
  });
  app.get('/api/timeline', (request, response, next) => {
    try {
      const { at } = z.object({ at: z.coerce.number().nonnegative() }).parse(request.query);
      const active = locateScene(compiledProject, at);
      const layers = active.scene.layers
        .filter((layer) => layer.visible && layerIsActive(layer.start, layer.duration, active.scene.duration, active.localTime))
        .map((layer) => ({ ...evaluateLayerTracks(layer, active.localTime - layer.start), localTime: active.localTime - layer.start }));
      response.json({ at, scene: { id: active.scene.id, purpose: active.scene.purpose, localTime: active.localTime, globalStart: active.globalStart }, layers });
    } catch (error) { next(error); }
  });
  app.get('/api/exports/:filename/probe', async (request, response, next) => {
    try {
      const { filename } = revealExportSchema.parse(request.params);
      response.json(await probeVideo(path.join(rendersDir, filename)));
    } catch (error) { next(error); }
  });
  app.get('/api/exports/:filename/download', async (request, response, next) => {
    try {
      const { filename } = revealExportSchema.parse(request.params);
      const file = path.join(rendersDir, filename);
      const info = await stat(file);
      if (!info.isFile()) { response.status(404).json({ error: 'Export not found.' }); return; }
      response.download(file, filename);
    } catch (error) { next(error); }
  });
  app.post('/api/exports/:filename/contact-sheet', async (request, response, next) => {
    try {
      const { filename } = revealExportSchema.parse(request.params);
      const body = contactSheetSchema.parse(request.body);
      const basename = `${path.parse(filename).name}-contact-sheet.png`;
      await makeContactSheet(path.join(rendersDir, filename), path.join(rendersDir, basename), body.count, body.columns);
      response.json({ filename: basename, source: filename, count: body.count, columns: body.columns, url: `/api/contact-sheets/${encodeURIComponent(basename)}` });
    } catch (error) { next(error); }
  });
  app.get('/api/contact-sheets/:filename', async (request, response, next) => {
    try {
      const filename = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*-contact-sheet\.png$/).parse(request.params.filename);
      const [realRendersDir, realOutput] = await Promise.all([realpath(rendersDir), realpath(path.join(rendersDir, filename))]);
      const relative = path.relative(realRendersDir, realOutput);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { response.status(400).json({ error: 'Contact sheet path is outside the project render directory.' }); return; }
      response.sendFile(realOutput);
    } catch (error) { next(error); }
  });
  app.get('/api/projects', async (_request, response, next) => {
    try { response.json({ projects: await discoverProjects(workspace, loaded.projectDir), workspaceRoot: workspace.root, currentProjectId: projectId(loaded.projectDir) }); } catch (error) { next(error); }
  });
  const launchProject = async (directory: string): Promise<StudioServer> => {
    const resolved = path.resolve(directory);
    const existing = workspace.servers.get(resolved);
    if (existing) return existing;
    return startStudio(await loadProject(resolved), { host, port: 0, workspace, ...(options.agentRuntimeFactory ? { agentRuntimeFactory: options.agentRuntimeFactory } : {}), ...(options.revealFile ? { revealFile: options.revealFile } : {}) });
  };
  app.post('/api/projects/open', async (request, response, next) => {
    try {
      const body = openProjectSchema.parse(request.body);
      const project = (await discoverProjects(workspace, loaded.projectDir)).find((candidate) => candidate.id === body.id);
      if (!project) { response.status(404).json({ error: 'Project not found in this local workspace.' }); return; }
      const studio = await launchProject(project.directory);
      response.json({ url: studio.url, project });
    } catch (error) { next(error); }
  });
  app.post('/api/projects', async (request, response, next) => {
    try {
      const body = createProjectSchema.parse(request.body);
      const directory = path.join(workspace.root, body.slug);
      const relative = path.relative(workspace.root, directory);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { response.status(400).json({ error: 'Project directory is outside the local workspace.' }); return; }
      const exists = await stat(directory).then(() => true).catch(() => false);
      if (exists) { response.status(409).json({ error: 'A project directory with that name already exists.' }); return; }
      const init: InitOptions = { title: body.title, promise: body.promise, proof: body.proof, desiredAction: body.desiredAction, audience: body.audience, mode: body.mode, duration: body.duration, width: body.width, height: body.height };
      await initializeProject(directory, init);
      const studio = await launchProject(directory);
      const project = (await discoverProjects(workspace, directory)).find((candidate) => path.resolve(candidate.directory) === path.resolve(directory));
      response.status(201).json({ url: studio.url, project });
    } catch (error) { next(error); }
  });
  app.get('/api/exports', async (_request, response, next) => {
    try { response.json(await listExports(rendersDir, loaded.projectDir)); } catch (error) { next(error); }
  });
  app.post('/api/exports/reveal', async (request, response, next) => {
    try {
      const body = revealExportSchema.parse(request.body);
      const output = path.join(rendersDir, body.filename);
      const [realRendersDir, realOutput] = await Promise.all([realpath(rendersDir), realpath(output)]);
      const relative = path.relative(realRendersDir, realOutput);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { response.status(400).json({ error: 'Export path is outside the project render directory.' }); return; }
      const outputStat = await stat(realOutput);
      if (!outputStat.isFile()) { response.status(404).json({ error: 'Export file no longer exists.' }); return; }
      await revealFile(realOutput);
      response.json({ ok: true, output: path.relative(loaded.projectDir, realOutput).replaceAll('\\', '/') });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { response.status(404).json({ error: 'Export file no longer exists.' }); return; }
      next(error);
    }
  });
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    void _next;
    const message = error instanceof z.ZodError ? error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join(' ') : error instanceof Error ? error.message : String(error);
    response.status(error instanceof z.ZodError || error instanceof GenmotionError ? 400 : 500).json({ error: message, details: error instanceof z.ZodError ? error.issues : error instanceof GenmotionError ? error.details : undefined });
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.on('error', reject);
  });
  const actualPort = (server.address() as AddressInfo).port;
  let closed = false;
  const studioServer: StudioServer = { url: `http://${host}:${String(actualPort)}`, server, close: async () => {
    if (closed) return;
    closed = true;
    if (ownsWorkspace) for (const child of [...workspace.servers.values()]) if (child !== studioServer) await child.close();
    workspace.servers.delete(path.resolve(loaded.projectDir));
    for (const [id, controller] of renderControllers) {
      const job = jobs.get(id);
      if (job && ['queued', 'rendering'].includes(job.status)) { job.status = 'cancelled'; job.error = 'Studio closed before the export completed.'; }
      controller.abort();
    }
    await renderQueue;
    await agentRuntime.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  } };
  workspace.servers.set(path.resolve(loaded.projectDir), studioServer);
  return studioServer;
}
