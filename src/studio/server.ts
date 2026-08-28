import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type { LoadedProject } from '../ir/loader.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { projectDuration, projectSchema, type GenmotionProject } from '../ir/schema.js';
import { compileProjectMotions } from '../engine/motion.js';
import { renderFramePng } from '../engine/draw.js';
import { renderProject } from '../engine/render.js';
import { validateProject } from '../ir/validate.js';
import { motionRecipes } from '../catalog/motions.js';
import { tasteReferences } from '../catalog/references.js';
import { sceneBlueprints } from '../catalog/blueprints.js';
import { studioHtml } from './ui.js';
import { GenmotionError } from '../errors.js';

const nodeSchema = z.object({
  id: z.string().min(1), kind: z.enum(['brief', 'scene', 'layer', 'reference', 'note', 'output']),
  x: z.number().finite(), y: z.number().finite(), label: z.string().min(1),
  sceneId: z.string().optional(), layerId: z.string().optional(), referenceId: z.string().optional(),
  note: z.string().default(''), color: z.string().default('#8b5cf6'),
});
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
});
const renderRequestSchema = z.object({
  filename: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(mp4|mov|webm)$/),
  quality: z.enum(['draft', 'standard', 'high']).default('high'),
  codec: z.enum(['h264', 'h265', 'vp9', 'prores']).default('h264'),
});

interface StudioRequestRecord {
  id: string; prompt: string; selection: { sceneId?: string; layerId?: string; frame?: number };
  status: 'pending' | 'resolved'; createdAt: string; resolvedAt?: string; response?: string;
}
interface RenderJob { id: string; status: 'queued' | 'rendering' | 'complete' | 'failed'; progress: number; output?: string; error?: string }
export interface StudioOptions { host?: string; port?: number }
export interface StudioServer { url: string; close: () => Promise<void>; server: Server }

const mediaExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.mp4', '.mov', '.webm', '.mkv', '.m4v', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.woff', '.woff2', '.ttf', '.otf']);
const referenceExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

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

function revision(project: GenmotionProject): string {
  return createHash('sha256').update(JSON.stringify(project)).digest('hex').slice(0, 16);
}

async function atomicWrite(file: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, file);
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

export async function resolveStudioRequest(projectDir: string, id: string, response: string): Promise<StudioRequestRecord> {
  if (!/^[a-f0-9-]{16,64}$/i.test(id)) throw new Error('Invalid request id.');
  const file = path.join(projectDir, '.genmotion', 'requests', `${id}.json`);
  const record = await readJson<StudioRequestRecord | null>(file, null);
  if (!record) throw new Error(`Studio request not found: ${id}`);
  const resolved = { ...record, status: 'resolved' as const, response, resolvedAt: new Date().toISOString() };
  await atomicWrite(file, `${JSON.stringify(resolved, null, 2)}\n`);
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
  await Promise.all([mkdir(historyDir, { recursive: true }), mkdir(requestsDir, { recursive: true }), mkdir(rendersDir, { recursive: true })]);

  let sourceProject = loaded.sourceProject;
  let compiledProject = compileProjectMotions(sourceProject);
  let studioState = studioStateSchema.parse(await readJson(stateFile, initialStudioState(sourceProject)));
  const jobs = new Map<string, RenderJob>();
  const frameCache = new Map<string, Buffer>();
  const app = express();
  app.disable('x-powered-by');

  app.use((request, response, next) => {
    response.set({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store',
    });
    if (!request.path.startsWith('/api/') || request.method === 'GET') { next(); return; }
    if (request.header('x-genmotion-token') !== token) { response.status(403).json({ error: 'Invalid Studio session token.' }); return; }
    next();
  });
  app.use('/api', express.json({ limit: '10mb', type: ['application/json', 'application/*+json'] }));
  app.use('/api/assets', express.raw({ limit: '100mb', type: 'application/octet-stream' }));

  app.get('/', (_request, response) => { response.type('html').send(studioHtml()); });
  app.get('/favicon.ico', (_request, response) => { response.status(204).end(); });
  app.get('/api/session', (_request, response) => { response.json({ token }); });
  app.get('/api/bootstrap', async (_request, response, next) => {
    try {
      const currentLoaded = { ...loaded, project: compiledProject, sourceProject };
      response.json({
        project: sourceProject, studio: studioState, revision: revision(sourceProject),
        findings: await validateProject(currentLoaded), duration: projectDuration(sourceProject),
        catalog: { motions: motionRecipes, references: tasteReferences, blueprints: sceneBlueprints },
        requests: await listRequests(requestsDir), jobs: [...jobs.values()], projectFile: path.basename(loaded.projectFile),
      });
    } catch (error) { next(error); }
  });
  app.put('/api/project', async (request, response, next) => {
    try {
      const body = z.object({ revision: z.string(), project: projectSchema }).parse(request.body);
      const currentRevision = revision(sourceProject);
      if (body.revision !== currentRevision) { response.status(409).json({ error: 'Project changed since this Studio loaded it.', revision: currentRevision, project: sourceProject }); return; }
      const nextRevision = revision(body.project);
      const nextCompiled = compileProjectMotions(body.project);
      await atomicWrite(path.join(historyDir, `${currentRevision}.json`), `${JSON.stringify(sourceProject, null, 2)}\n`);
      await writeProjectFile(loaded.projectFile, body.project);
      sourceProject = body.project;
      compiledProject = nextCompiled;
      frameCache.clear();
      response.json({ ok: true, revision: nextRevision, project: sourceProject, findings: await validateProject({ ...loaded, project: compiledProject, sourceProject }) });
    } catch (error) { next(error); }
  });
  app.put('/api/studio', async (request, response, next) => {
    try {
      studioState = studioStateSchema.parse({ ...request.body, updatedAt: new Date().toISOString() });
      await atomicWrite(stateFile, `${JSON.stringify(studioState, null, 2)}\n`);
      response.json({ ok: true, studio: studioState });
    } catch (error) { next(error); }
  });
  app.get('/api/history', async (_request, response) => {
    const files = (await readdir(historyDir)).filter((file) => file.endsWith('.json')).sort().reverse();
    response.json(await Promise.all(files.slice(0, 50).map(async (file) => ({ revision: path.basename(file, '.json'), modifiedAt: (await stat(path.join(historyDir, file))).mtime.toISOString() }))));
  });
  app.post('/api/history/:revision/restore', async (request, response, next) => {
    try {
      const requested = request.params.revision ?? '';
      if (!/^[a-f0-9]{16}$/.test(requested)) { response.status(400).json({ error: 'Invalid revision.' }); return; }
      const restored = projectSchema.parse(JSON.parse(await readFile(path.join(historyDir, `${requested}.json`), 'utf8')));
      const restoredCompiled = compileProjectMotions(restored);
      const currentRevision = revision(sourceProject);
      await atomicWrite(path.join(historyDir, `${currentRevision}.json`), `${JSON.stringify(sourceProject, null, 2)}\n`);
      await writeProjectFile(loaded.projectFile, restored);
      sourceProject = restored; compiledProject = restoredCompiled; frameCache.clear();
      response.json({ ok: true, revision: revision(restored), project: restored });
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
        if (frameCache.size > 120) frameCache.delete(frameCache.keys().next().value ?? '');
      }
      response.type('png').set('Cache-Control', 'private, max-age=31536000, immutable').send(png);
    } catch (error) { next(error); }
  });
  app.post('/api/requests', async (request, response, next) => {
    try {
      const body = requestSchema.parse(request.body);
      const selection: StudioRequestRecord['selection'] = {};
      if (body.selection.sceneId !== undefined) selection.sceneId = body.selection.sceneId;
      if (body.selection.layerId !== undefined) selection.layerId = body.selection.layerId;
      if (body.selection.frame !== undefined) selection.frame = body.selection.frame;
      const record: StudioRequestRecord = { id: randomUUID(), prompt: body.prompt, selection, status: 'pending', createdAt: new Date().toISOString() };
      await atomicWrite(path.join(requestsDir, `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
      response.status(201).json(record);
    } catch (error) { next(error); }
  });
  app.get('/api/requests', async (_request, response) => { response.json(await listRequests(requestsDir)); });
  app.post('/api/render', (request, response, next) => {
    try {
      const body = renderRequestSchema.parse(request.body);
      const id = randomUUID();
      const output = path.join(rendersDir, body.filename);
      const job: RenderJob = { id, status: 'queued', progress: 0, output: path.relative(loaded.projectDir, output).replaceAll('\\', '/') };
      jobs.set(id, job); response.status(202).json(job);
      void (async () => {
        try {
          job.status = 'rendering';
          await renderProject({ ...loaded, project: compiledProject, sourceProject }, {
            output, quality: body.quality, codec: body.codec,
            onProgress: (progress) => { job.progress = progress.totalFrames === 0 ? 0 : progress.encodedFrames / progress.totalFrames; },
          });
          job.status = 'complete'; job.progress = 1;
        } catch (error) { job.status = 'failed'; job.error = error instanceof Error ? error.message : String(error); }
      })();
    } catch (error) { next(error); }
  });
  app.get('/api/jobs', (_request, response) => { response.json([...jobs.values()]); });
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    void _next;
    const message = error instanceof Error ? error.message : String(error);
    response.status(error instanceof z.ZodError || error instanceof GenmotionError ? 400 : 500).json({ error: message, details: error instanceof z.ZodError ? error.issues : error instanceof GenmotionError ? error.details : undefined });
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.on('error', reject);
  });
  const actualPort = (server.address() as AddressInfo).port;
  return { url: `http://${host}:${String(actualPort)}`, server, close: async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}
