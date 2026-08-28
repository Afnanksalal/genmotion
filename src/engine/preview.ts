import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LoadedProject } from '../ir/loader.js';
import { projectDuration } from '../ir/schema.js';
import { prepareVideoAssets } from './assets.js';
import { renderFramePng } from './draw.js';
import { validateProject } from '../ir/validate.js';

export interface PreviewOptions { host?: string; port?: number }
export interface PreviewServer { url: string; close: () => Promise<void>; server: Server }

class FrameCache {
  private readonly values = new Map<number, Buffer>();
  constructor(private readonly limit: number) {}
  get(key: number): Buffer | undefined {
    const value = this.values.get(key);
    if (value) { this.values.delete(key); this.values.set(key, value); }
    return value;
  }
  set(key: number, value: Buffer): void {
    this.values.set(key, value);
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }
}

function previewHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Genmotion Preview</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b0c0e;color:#f3f4f6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;background:radial-gradient(circle at 50% -20%,#20252e,#0b0c0e 48%)}header{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid #25282e;background:#0b0c0edd;backdrop-filter:blur(16px)}.brand{display:flex;gap:10px;align-items:center;font-weight:700}.mark{width:24px;height:24px;border-radius:7px;background:#73f2b6;box-shadow:0 0 22px #73f2b655}.meta{color:#9297a1;font-size:13px}main{min-height:0;display:grid;place-items:center;padding:24px}.stage{position:relative;max-width:min(92vw,1400px);max-height:calc(100vh - 210px);aspect-ratio:16/9;width:100%;overflow:hidden;border:1px solid #30343c;border-radius:14px;background:#000;box-shadow:0 30px 100px #0009}.stage img{display:block;width:100%;height:100%;object-fit:contain}.status{position:absolute;right:12px;top:12px;padding:6px 9px;border-radius:999px;background:#0b0c0ecc;color:#b8bec8;font:12px ui-monospace,monospace;border:1px solid #30343c}footer{padding:14px 22px 18px;border-top:1px solid #25282e;background:#0b0c0e}.controls{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;max-width:1500px;margin:auto}button{width:38px;height:38px;border:0;border-radius:10px;background:#73f2b6;color:#07130e;font-size:16px;cursor:pointer}input[type=range]{width:100%;accent-color:#73f2b6}.time{font:12px ui-monospace,monospace;color:#b8bec8;min-width:100px;text-align:right}.scenes{position:relative;height:24px;max-width:1500px;margin:8px auto 0}.scene{position:absolute;top:0;height:100%;border-left:2px solid #5b626e;color:#7f8794;font-size:10px;padding-left:5px;overflow:hidden;white-space:nowrap}@media(max-width:700px){header{padding:0 14px}.meta{display:none}main{padding:10px}.controls{grid-template-columns:auto 1fr}.time{display:none}footer{padding:10px}.stage{max-height:calc(100vh - 170px);border-radius:8px}}
</style></head><body><header><div class="brand"><span class="mark"></span><span>Genmotion</span></div><div class="meta" id="projectTitle"></div></header><main><div class="stage"><img id="frame" alt="Rendered composition frame"><div class="status" id="status">Loading</div></div></main><footer><div class="controls"><button id="play" aria-label="Play">▶</button><input id="scrub" type="range" min="0" value="0" step="1"><div class="time" id="time"></div></div><div class="scenes" id="scenes"></div></footer><script>
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
  const cache = new FrameCache(90);
  const duration = projectDuration(loaded.project);
  const frames = Math.ceil(duration * loaded.project.fps);

  app.get('/', (_request, response) => { response.type('html').send(previewHtml()); });
  app.get('/api/project', (_request, response) => {
    response.json({ title: loaded.project.title, width: loaded.project.width, height: loaded.project.height, fps: loaded.project.fps, duration, frames, scenes: loaded.project.scenes.map(({ id, duration: sceneDuration, purpose }) => ({ id, duration: sceneDuration, purpose })) });
  });
  app.get('/api/findings', async (_request, response, next) => {
    try { response.json(await validateProject(loaded)); } catch (error) { next(error); }
  });
  app.get('/frame/:frame.png', async (request, response, next) => {
    try {
      const frame = Number.parseInt(request.params.frame ?? '', 10);
      if (!Number.isInteger(frame) || frame < 0 || frame >= frames) { response.status(400).json({ error: 'Frame is outside the composition.' }); return; }
      let png = cache.get(frame);
      if (!png) { png = await renderFramePng(loaded.project, loaded.projectDir, frame); cache.set(frame, png); }
      response.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable' }).send(png);
    } catch (error) { next(error); }
  });
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    void _next;
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.on('error', reject);
  });
  const actualPort = (server.address() as AddressInfo).port;
  return { url: `http://${host}:${String(actualPort)}`, server, close: async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}
