import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { loadProjectDocument, type LoadedProject } from '../ir/loader.js';
import { parameterValueSchema } from '../ir/schema.js';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { renderAudio } from './audio.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { projectDuration } from '../ir/schema.js';
import { prepareVideoAssets } from './assets.js';
import { renderFramePng } from './draw.js';
import { validateProject } from '../ir/validate.js';
import { GENMOTION_SYMBOL_SVG, readGenmotionBrandAsset } from '../brand.js';

export interface PreviewOptions { host?: string; port?: number; allowedOrigins?: string[] }
export interface PreviewServer { url: string; close: () => Promise<void>; server: Server }

class FrameCache {
  private readonly values = new Map<string, Buffer>();
  private bytes = 0;
  constructor(private readonly limit: number) {}
  get(key: string): Buffer | undefined {
    const value = this.values.get(key);
    if (value) { this.values.delete(key); this.values.set(key, value); }
    return value;
  }
  set(key: string, value: Buffer): void {
    if (value.length > 64 * 1024 ** 2) return;
    this.bytes -= this.values.get(key)?.length ?? 0;
    this.values.set(key, value);
    this.bytes += value.length;
    while (this.values.size > this.limit || this.bytes > 64 * 1024 ** 2) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.values.get(oldest)!.length; this.values.delete(oldest);
    }
  }
}

function previewHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Genmotion Preview</title><meta name="application-name" content="Genmotion Preview"><meta name="description" content="Preview a native Genmotion composition."><meta name="theme-color" content="#0B0C0E"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico"><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b0c0e;color:#f3f4f6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;background:radial-gradient(circle at 50% -20%,#20252e,#0b0c0e 48%)}header{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid #25282e;background:#0b0c0edd;backdrop-filter:blur(16px)}.brand{display:flex;gap:10px;align-items:center;font-weight:700}.mark{width:26px;height:26px;display:grid;place-items:center;border:1px solid #d4d4d8;border-radius:8px;background:#fafafa;padding:4px}.mark svg{display:block;width:100%;height:100%}.meta{color:#9297a1;font-size:13px}main{min-height:0;display:grid;place-items:center;padding:24px}.stage{position:relative;max-width:min(92vw,1400px);max-height:calc(100vh - 210px);aspect-ratio:16/9;width:100%;overflow:hidden;border:1px solid #30343c;border-radius:14px;background:#000;box-shadow:0 30px 100px #0009}.stage img{display:block;width:100%;height:100%;object-fit:contain}.status{position:absolute;right:12px;top:12px;padding:6px 9px;border-radius:999px;background:#0b0c0ecc;color:#b8bec8;font:12px ui-monospace,monospace;border:1px solid #30343c}footer{padding:14px 22px 18px;border-top:1px solid #25282e;background:#0b0c0e}.controls{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;max-width:1500px;margin:auto}button{width:38px;height:38px;border:0;border-radius:10px;background:#2563eb;color:white;font-size:16px;cursor:pointer}input[type=range]{width:100%;accent-color:#2563eb}.time{font:12px ui-monospace,monospace;color:#b8bec8;min-width:100px;text-align:right}.scenes{position:relative;height:24px;max-width:1500px;margin:8px auto 0}.scene{position:absolute;top:0;height:100%;border-left:2px solid #5b626e;color:#7f8794;font-size:10px;padding-left:5px;overflow:hidden;white-space:nowrap}@media(max-width:700px){header{padding:0 14px}.meta{display:none}main{padding:10px}.controls{grid-template-columns:auto 1fr}.time{display:none}footer{padding:10px}.stage{max-height:calc(100vh - 170px);border-radius:8px}}
</style></head><body><header><div class="brand"><span class="mark">${GENMOTION_SYMBOL_SVG}</span><span>Genmotion</span></div><div class="meta" id="projectTitle"></div></header><main><div class="stage"><img id="frame" alt="Rendered composition frame"><div class="status" id="status">Loading</div></div></main><footer><div class="controls"><button id="play" aria-label="Play">▶</button><input id="scrub" type="range" min="0" value="0" step="1"><div class="time" id="time"></div></div><div class="scenes" id="scenes"></div></footer><script>
const state={meta:null,frame:0,playing:false,last:0,pending:false};const image=document.querySelector('#frame');const scrub=document.querySelector('#scrub');const play=document.querySelector('#play');const time=document.querySelector('#time');const status=document.querySelector('#status');
const fmt=s=>new Date(s*1000).toISOString().slice(14,19);function update(){if(!state.meta)return;scrub.value=String(state.frame);time.textContent=fmt(state.frame/state.meta.fps)+' / '+fmt(state.meta.duration);status.textContent='Frame '+state.frame;state.pending=true;const next=new Image();next.onload=()=>{image.src=next.src;state.pending=false};next.src='/frame/'+state.frame+'.png'}
function tick(now){if(state.playing&&state.meta){if(!state.last)state.last=now;const elapsed=(now-state.last)/1000;const advance=Math.floor(elapsed*state.meta.fps);if(advance>0){state.frame=(state.frame+advance)%state.meta.frames;state.last+=advance/state.meta.fps*1000;if(!state.pending)update()}}requestAnimationFrame(tick)}
play.onclick=()=>{state.playing=!state.playing;state.last=0;play.textContent=state.playing?'❚❚':'▶'};scrub.oninput=()=>{state.playing=false;play.textContent='▶';state.frame=Number(scrub.value);update()};
fetch('/api/project').then(r=>r.json()).then(meta=>{state.meta=meta;document.querySelector('#projectTitle').textContent=meta.title+' · '+meta.width+'×'+meta.height+' · '+meta.fps+' fps';scrub.max=String(meta.frames-1);let cursor=0;for(const scene of meta.scenes){const el=document.createElement('div');el.className='scene';el.textContent=scene.id;el.style.left=(cursor/meta.duration*100)+'%';el.style.width=(scene.duration/meta.duration*100)+'%';document.querySelector('#scenes').appendChild(el);cursor+=scene.duration}update();requestAnimationFrame(tick)});
</script></body></html>`;
}

export async function startPreview(loaded: LoadedProject, options: PreviewOptions = {}): Promise<PreviewServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4178;
  await prepareVideoAssets(loaded.project, loaded.projectDir);
  const app = express();
  app.use((request, response, next) => {
    if (request.headers.origin && options.allowedOrigins?.includes(request.headers.origin)) response.set('Access-Control-Allow-Origin', request.headers.origin).set('Vary', 'Origin');
    next();
  });
  const cache = new FrameCache(90);
  const variants = new Map<string, LoadedProject>();
  const compiling = new Map<string, Promise<LoadedProject>>();
  const pendingFrames = new Map<string, Promise<Buffer>>();
  const audioJobs = new Map<string, Promise<{ file: string; users: number }>>();
  const audioFiles = new Map<string, { file: string; users: number }>();
  const shutdown = new AbortController();
  let audioDirectory: Promise<string> | undefined;
  const selectProject = async (request: express.Request): Promise<{ project: LoadedProject; key: string }> => {
    const raw = request.query.parameters;
    if (raw === undefined) return { project: loaded, key: 'default' };
    if (typeof raw !== 'string' || raw.length > 8192) throw new SyntaxError('Parameters must be a JSON object of at most 8192 characters');
    const parameters = z.record(z.string(), parameterValueSchema).parse(JSON.parse(raw));
    const key = createHash('sha256').update(JSON.stringify(parameters)).digest('hex');
    const existing = variants.get(key);
    if (existing) { variants.delete(key); variants.set(key, existing); return { project: existing, key }; }
    let work = compiling.get(key);
    if (!work) {
      if (compiling.size >= 4) throw new Error('Too many parameter configurations are being prepared');
      work = (async () => {
        const result = await loadProjectDocument(loaded.sourceProject, loaded.projectFile, { ...loaded.project.parameterValues, ...parameters });
        await prepareVideoAssets(result.project, result.projectDir);
        variants.set(key, result); while (variants.size > 8) variants.delete(variants.keys().next().value!);
        return result;
      })();
      compiling.set(key, work);
      void work.finally(() => compiling.delete(key)).catch(() => undefined);
    }
    return { project: await work, key };
  };

  app.get('/', (_request, response) => { response.type('html').send(previewHtml()); });
  app.get('/player.js', async (_request, response, next) => { try { response.type('application/javascript').send(await readFile(new URL('../player.js', import.meta.url), 'utf8').catch(async (error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return await readFile(new URL('../../dist/player.js', import.meta.url), 'utf8'); })); } catch (error) { next(error); } });
  app.get('/embed', (_request, response) => { response.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Genmotion Player</title><style>body{margin:0;background:#111;color:#eee;font:14px system-ui}genmotion-player{display:block}</style><genmotion-player src="./" loop></genmotion-player><script type="module">import {registerGenmotionPlayer} from "./player.js";registerGenmotionPlayer();</script></html>'); });
  app.get('/favicon.svg', (_request, response) => { response.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(GENMOTION_SYMBOL_SVG); });
  app.get('/favicon.ico', (_request, response) => { response.type('image/png').set('Cache-Control', 'public, max-age=86400').send(readGenmotionBrandAsset('favicon-32.png')); });
  app.get('/api/project', async (request, response, next) => {
    try {
      const { project: selected } = await selectProject(request), project = selected.project, duration = projectDuration(project), frames = Math.ceil(duration * project.fps);
      const hasAudio = project.audio.some((track) => !track.muted) || [...project.scenes, ...project.compositions].some((container) => container.layers.some((layer) => layer.type === 'video' && layer.volume > 0));
      response.json({ title: project.title, width: project.width, height: project.height, fps: project.fps, duration, frames, hasAudio, scenes: project.scenes.map(({ id, duration: sceneDuration, purpose }) => ({ id, duration: sceneDuration, purpose })) });
    } catch (error) { next(error); }
  });
  app.get('/api/findings', async (_request, response, next) => {
    try { response.json(await validateProject(loaded)); } catch (error) { next(error); }
  });
  app.get('/api/audio.m4a', async (request, response, next) => {
    try {
      const { project: selected, key } = await selectProject(request);
      let entry = audioFiles.get(key);
      if (!entry) {
        let job = audioJobs.get(key);
        if (!job) {
          if (audioJobs.size >= 2) { response.status(429).json({ error: 'Audio preparation queue is full' }); return; }
          job = (async () => {
            while (audioFiles.size + audioJobs.size >= 8) {
              const oldest = [...audioFiles].find(([, file]) => file.users === 0);
              if (!oldest) throw new Error('Audio preview cache is busy');
              audioFiles.delete(oldest[0]); await rm(oldest[1].file, { force: true });
            }
            audioDirectory ??= mkdtemp(path.join(os.tmpdir(), 'genmotion-player-'));
            const root = await audioDirectory, file = resolveProjectAsset(root, key + '.m4a');
            const result = await renderAudio(selected.project, selected.projectDir, file, { signal: shutdown.signal, timeoutMs: 240000 });
            if (result.bytes > 64 * 1024 ** 2) { await rm(file, { force: true }); throw new Error('Audio preview exceeds its 64 MiB cache budget'); }
            const value = { file, users: 0 }; audioFiles.set(key, value); return value;
          })();
          audioJobs.set(key, job); void job.finally(() => audioJobs.delete(key)).catch(() => undefined);
        }
        entry = await job;
      }
      audioFiles.delete(key); audioFiles.set(key, entry);
      entry.users += 1; const held = entry;
      response.set('Cache-Control', 'no-store').sendFile(entry.file, (error) => { held.users -= 1; if (error && !response.headersSent) next(error); });
    } catch (error) { next(error); }
  });
  app.get('/frame/:frame.png', async (request, response, next) => {
    try {
      const frame = Number(request.params.frame);
      const { project: selected, key } = await selectProject(request), frames = Math.ceil(projectDuration(selected.project) * selected.project.fps), cacheKey = `${key}:${frame}`;
      if (!Number.isFinite(frame) || frame < 0 || frame >= frames) { response.status(400).json({ error: 'Frame is outside the composition.' }); return; }
      let png = cache.get(cacheKey);
      if (!png) {
        let pending = pendingFrames.get(cacheKey);
        if (!pending) {
          if (pendingFrames.size >= 4) { response.status(429).json({ error: 'Native frame queue is full' }); return; }
          pending = renderFramePng(selected.project, selected.projectDir, frame); pendingFrames.set(cacheKey, pending);
          void pending.finally(() => pendingFrames.delete(cacheKey)).catch(() => undefined);
        }
        png = await pending; cache.set(cacheKey, png);
      }
      response.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).send(png);
    } catch (error) { next(error); }
  });
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    void _next;
    response.status(error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500).json({ error: error instanceof Error ? error.message : String(error) });
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.on('error', reject);
  });
  const actualPort = (server.address() as AddressInfo).port;
  return { url: `http://${host}:${String(actualPort)}`, server, close: async () => {
    shutdown.abort();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await Promise.allSettled(audioJobs.values());
    if (audioDirectory) { const root = await audioDirectory; await rm(resolveProjectAsset(path.dirname(root), path.basename(root)), { recursive: true, force: true }); }
  } };
}
