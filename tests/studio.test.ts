import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../src/ir/loader.js';
import { autoLayoutStudioState, ByteLruCache, fileManagerRevealCommand, getStudioRequests, isTransientAgentFailure, reconcileStudioState, requestedOutcomeGaps, resolveStudioRequest, startStudio, type StudioState } from '../src/studio/server.js';
import type { GenmotionProject } from '../src/ir/schema.js';
import type { AgentRuntime } from '../src/agent/runtime.js';

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('bounded Studio frame cache', () => {
  it('evicts least-recently-used frames by bytes and entry count', () => {
    const cache = new ByteLruCache(8, 2);
    cache.set('a', Buffer.alloc(3));
    cache.set('b', Buffer.alloc(3));
    expect(cache.get('a')).toHaveLength(3);
    cache.set('c', Buffer.alloc(3));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(2);
    cache.set('large', Buffer.alloc(8));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();
    expect(cache.byteLength).toBe(8);
  });
});

describe('file manager reveal commands', () => {
  it('uses a visible Explorer selection command on Windows', () => {
    expect(fileManagerRevealCommand('win32', 'C:\\renders\\launch.mp4')).toEqual({
      command: 'explorer.exe',
      args: ['/select,C:\\renders\\launch.mp4'],
      windowsHide: false,
    });
  });

  it('uses native reveal commands on macOS and Linux', () => {
    expect(fileManagerRevealCommand('darwin', '/renders/launch.mp4')).toEqual({ command: 'open', args: ['-R', '/renders/launch.mp4'], windowsHide: true });
    expect(fileManagerRevealCommand('linux', '/renders/launch.mp4')).toEqual({ command: 'xdg-open', args: ['/renders'], windowsHide: true });
  });
});

describe('Studio workflow reconciliation', () => {
  it('rebuilds the project sequence, preserves valid custom nodes, and removes stale generated nodes', async () => {
    const directory = await fixture();
    const project = (await loadProject(directory)).sourceProject;
    const source = project.scenes[0];
    if (!source) throw new Error('Fixture needs one scene.');
    const expanded = {
      ...project,
      scenes: ['opening', 'reveal', 'details', 'lockup'].map((id, index) => ({
        ...structuredClone(source), id, purpose: `${id} purpose`,
        layers: source.layers.map((layer) => ({ ...structuredClone(layer), id: `${id}-${layer.id}` })),
        transitionIn: index === 0 ? source.transitionIn : { ...source.transitionIn, type: 'crossfade' as const, duration: 0.1 },
      })),
    } satisfies GenmotionProject;
    const state: StudioState = {
      version: 1,
      nodes: [
        { id: 'brief', kind: 'brief', x: 10, y: 20, label: 'Old brief', note: '', color: '#111111' },
        { id: 'scene:canvas', kind: 'scene', sceneId: 'canvas', x: 40, y: 50, label: 'canvas', note: '', color: '#222222' },
        { id: 'layer:canvas:artboard', kind: 'layer', sceneId: 'canvas', layerId: 'artboard', x: 60, y: 70, label: 'artboard', note: '', color: '#333333' },
        { id: 'note:direction', kind: 'note', x: 80, y: 90, label: 'Direction', note: 'Keep this.', color: '#444444' },
        { id: 'output', kind: 'output', x: 100, y: 110, label: 'Old output', note: '', color: '#555555' },
      ],
      edges: [
        { id: 'old-sequence', from: 'brief', to: 'scene:canvas', label: 'direction' },
        { id: 'old-output', from: 'scene:canvas', to: 'output', label: 'render' },
        { id: 'custom-direction', from: 'note:direction', to: 'brief', label: 'informs' },
      ],
      references: [], updatedAt: new Date().toISOString(),
    };

    const result = reconcileStudioState(expanded, state);
    expect(result.nodes.map((node) => node.id)).toEqual([
      'brief', 'scene:opening', 'scene:reveal', 'scene:details', 'scene:lockup', 'note:direction', 'output',
    ]);
    expect(result.nodes.find((node) => node.id === 'brief')).toMatchObject({ x: 10, y: 20, color: '#111111' });
    expect(result.nodes.find((node) => node.id === 'output')).toMatchObject({ x: 1660, y: 170, color: '#555555' });
    expect(result.edges).toEqual([
      { id: 'custom-direction', from: 'note:direction', to: 'brief', label: 'informs' },
      { id: 'edge:sequence:opening', from: 'brief', to: 'scene:opening', label: 'direction' },
      { id: 'edge:sequence:reveal', from: 'scene:opening', to: 'scene:reveal', label: 'then' },
      { id: 'edge:sequence:details', from: 'scene:reveal', to: 'scene:details', label: 'then' },
      { id: 'edge:sequence:lockup', from: 'scene:details', to: 'scene:lockup', label: 'then' },
      { id: 'edge:output:sequence', from: 'scene:lockup', to: 'output', label: 'render' },
    ]);
    const laidOut = autoLayoutStudioState(expanded, result);
    expect(laidOut.nodes.filter((node) => node.kind === 'layer')).toHaveLength(expanded.scenes.reduce((sum, scene) => sum + scene.layers.length, 0));
    expect(laidOut.nodes.find((node) => node.id === 'scene:opening')).toMatchObject({ x: 360, y: 100 });
    expect(laidOut.nodes.find((node) => node.id === 'scene:lockup')?.x).toBeGreaterThan(360);
    expect(laidOut.nodes.find((node) => node.id === 'output')?.x).toBeGreaterThan(laidOut.nodes.find((node) => node.id === 'scene:lockup')?.x ?? 0);
  });
});

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-studio-'));
  cleanup.push(directory);
  await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
  return directory;
}

async function waitForRequest(
  directory: string,
  requestId: string,
  terminal: ReadonlySet<string> = new Set(['completed', 'failed']),
  timeoutMs = 10_000,
): Promise<{ status: string; response?: string; error?: string; afterRevision?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = (await getStudioRequests(directory)).find((candidate) => candidate.id === requestId);
    if (record && terminal.has(record.status)) return record;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const record = (await getStudioRequests(directory)).find((candidate) => candidate.id === requestId);
  throw new Error(`Request ${requestId} did not reach ${[...terminal].join(' or ')} within ${timeoutMs}ms; last status was ${record?.status ?? 'missing'}.`);
}

function fakeAgent(edit: false | 'valid' | 'invalid' | 'transient' = false): AgentRuntime {
  let attempts = 0;
  return {
    hosts: () => Promise.resolve([{ id: 'codex', label: 'Codex', installed: true, authenticated: true, detail: 'Test session' }]),
    run: async (input, onProgress) => {
      attempts += 1;
      if (edit === 'transient' && attempts < 3) throw new Error('Provider returned HTTP 429: temporarily rate limited');
      await onProgress({ activity: 'Applying changes', message: 'Working', sessionId: 'test-thread' });
      if (edit && edit !== 'transient') {
        const project = JSON.parse(await readFile(input.projectFile, 'utf8')) as { title: string };
        project.title = edit === 'valid' ? 'Changed by local agent' : '';
        await writeFile(input.projectFile, `${JSON.stringify(project, null, 2)}\n`);
      }
      return { response: 'Applied and validated the requested change.', sessionId: 'test-thread' };
    },
    close: () => Promise.resolve(),
  };
}

describe('Genmotion Studio', () => {
  it('bounds retained terminal agent requests while preserving recent history', async () => {
    const directory = await fixture();
    const requestsDir = path.join(directory, '.genmotion', 'requests');
    await mkdir(requestsDir, { recursive: true });
    for (let index = 0; index < 501; index += 1) {
      const id = index.toString(16).padStart(16, '0');
      await writeFile(path.join(requestsDir, `${id}.json`), JSON.stringify({ id, prompt: 'Archived request', selection: {}, status: 'completed', createdAt: new Date(index * 1_000).toISOString() }));
    }
    await resolveStudioRequest(directory, (500).toString(16).padStart(16, '0'), 'Retained response');
    const requests = await getStudioRequests(directory);
    expect(requests).toHaveLength(500);
    expect(requests[0]).toMatchObject({ status: 'resolved', response: 'Retained response' });
    expect(requests.some((request) => request.id === '0000000000000000')).toBe(false);
  });

  it('classifies only bounded provider failures as transient', () => {
    expect(isTransientAgentFailure(new Error('HTTP 429 too many requests'))).toBe(true);
    expect(isTransientAgentFailure(new Error('gateway timeout from provider'))).toBe(true);
    expect(isTransientAgentFailure(new Error('Creative IR schema validation failed'))).toBe(false);
  });

  it('retries transient provider failures without replaying a changed project', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent('transient') });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const queued = await fetch(`${studio.url}/api/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-genmotion-token': token },
        body: JSON.stringify({ prompt: 'Explain the current composition.', host: 'codex', selection: { frame: 0 } }),
      });
      const request = await queued.json() as { id: string };
      expect(await waitForRequest(directory, request.id, new Set(['completed', 'failed']), 15_000)).toMatchObject({ status: 'completed' });
    } finally { await studio.close(); }
  }, 20_000);

  it('detects omitted motion and visual techniques in an otherwise valid static scene system', async () => {
    const directory = await fixture();
    const project = (await loadProject(directory)).sourceProject;
    const baseScene = project.scenes[0];
    if (!baseScene) throw new Error('Fixture needs one scene.');
    const staticProject = {
      ...project,
      scenes: [4, 4, 4, 3].map((duration, index) => ({
        ...baseScene, id: `scene-${index.toString()}`, duration,
        layers: baseScene.layers.map((layer, layerIndex) => ({ ...layer, id: `layer-${index.toString()}-${layerIndex.toString()}`, motion: [], tracks: [] })),
      })),
    } as GenmotionProject;
    const gaps = requestedOutcomeGaps('Create a 15-second film. Build four scenes with direct animation tracks, custom easing, vector paths, clipping, shadows, blend modes, and camera movements.', staticProject);
    expect(gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('direct animation tracks'), expect.stringContaining('custom easing'), expect.stringContaining('vector paths'),
      expect.stringContaining('clipping'), expect.stringContaining('shadows'), expect.stringContaining('blend modes'), expect.stringContaining('transform motion'),
    ]));
  });

  it('creates, discovers, and reopens projects inside the configured workspace', async () => {
    const directory = await fixture();
    const workspaceRoot = path.join(directory, 'workspace');
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent(), agentRuntimeFactory: () => fakeAgent(), workspaceRoot });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const headers = { 'content-type': 'application/json', 'x-genmotion-token': token };
      const created = await fetch(`${studio.url}/api/projects`, {
        method: 'POST', headers, body: JSON.stringify({
          slug: 'launch-film', title: 'Launch film', mode: 'launch', duration: 24,
          audience: 'Product teams', promise: 'Show the product clearly', proof: 'Real captured product evidence', desiredAction: 'Start a project',
          width: 1080, height: 1920,
        }),
      });
      expect(created.status).toBe(201);
      const createdBody = await created.json() as { url: string; project: { id: string; title: string } };
      expect(createdBody.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(createdBody.project).toMatchObject({ title: 'Launch film' });
      expect((await stat(path.join(workspaceRoot, 'launch-film', 'genmotion.json'))).isFile()).toBe(true);
      expect(JSON.parse(await readFile(path.join(workspaceRoot, 'launch-film', 'genmotion.json'), 'utf8'))).toMatchObject({ width: 1080, height: 1920, scenes: [{ layers: [{ width: 1080, height: 1920 }] }] });
      const listing = await fetch(`${studio.url}/api/projects`).then((response) => response.json()) as { projects: Array<{ id: string; title: string }> };
      expect(listing.projects).toContainEqual(expect.objectContaining({ id: createdBody.project.id, title: 'Launch film' }));
      const reopened = await fetch(`${studio.url}/api/projects/open`, { method: 'POST', headers, body: JSON.stringify({ id: createdBody.project.id }) });
      expect(reopened.status).toBe(200);
      expect((await reopened.json() as { url: string }).url).toBe(createdBody.url);
    } finally { await studio.close(); }
  }, 30_000);

  it('persists validated edits, reference assets, workflow state, requests, history, and exports', async () => {
    const directory = await fixture();
    const revealed: string[] = [];
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent(), revealFile: (file) => { revealed.push(file); return Promise.resolve(); } });
    try {
      const html = await fetch(studio.url);
      const htmlBody = await html.text();
      expect(htmlBody).toContain('Genmotion Studio');
      expect(htmlBody).toContain('/brand/genmotion-social.png');
      expect(htmlBody).toContain('/brand/genmotion-symbol.svg');
      const policy = html.headers.get('content-security-policy') ?? '';
      expect(policy).toContain("default-src 'self'");
      expect(policy).toMatch(/script-src 'self' 'nonce-[^']+'/);
      expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
      const nonce = policy.match(/script-src 'self' 'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy();
      expect(htmlBody).toContain(`<script nonce="${nonce}">`);
      expect(html.headers.get('permissions-policy')).toContain('camera=()');
      const favicon = await fetch(`${studio.url}/favicon.ico`);
      expect(favicon.headers.get('content-type')).toContain('image/png');
      expect((await favicon.arrayBuffer()).byteLength).toBeGreaterThan(100);
      const symbol = await fetch(`${studio.url}/brand/genmotion-symbol.svg`);
      expect(symbol.headers.get('content-type')).toContain('image/svg+xml');
      expect(await symbol.text()).toContain('diamond-shaped keyframe');
      expect((await fetch(`${studio.url}/brand/not-an-asset.svg`)).status).toBe(404);

      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const headers = { 'content-type': 'application/json', 'x-genmotion-token': token };
      const bootstrap = await fetch(`${studio.url}/api/bootstrap`).then((response) => response.json()) as {
        project: Record<string, unknown>; studio: Record<string, unknown>; revision: string; catalog: { motions: unknown[]; references: unknown[] };
      };
      expect(bootstrap.catalog.motions.length).toBe(25);
      expect(bootstrap.catalog.references.length).toBe(16);

      const project = structuredClone(bootstrap.project) as { title: string };
      project.title = 'Edited in Studio';
      const saved = await fetch(`${studio.url}/api/project`, { method: 'PUT', headers, body: JSON.stringify({ revision: bootstrap.revision, project }) });
      expect(saved.status).toBe(200);
      const savedBody = await saved.json() as { revision: string };
      expect(JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8'))).toMatchObject({ title: 'Edited in Studio' });

      const conflict = await fetch(`${studio.url}/api/project`, { method: 'PUT', headers, body: JSON.stringify({ revision: bootstrap.revision, project }) });
      expect(conflict.status).toBe(409);

      const studioState = { ...bootstrap.studio, updatedAt: new Date().toISOString() };
      const stateSave = await fetch(`${studio.url}/api/studio`, { method: 'PUT', headers, body: JSON.stringify(studioState) });
      expect(stateSave.status).toBe(200);

      const upload = await fetch(`${studio.url}/api/assets?purpose=reference&filename=reference.png`, {
        method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-genmotion-token': token }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
      });
      expect(upload.status).toBe(200);
      const asset = await upload.json() as { path: string };
      expect((await stat(path.join(directory, ...asset.path.split('/')))).size).toBeGreaterThan(0);
      const servedAsset = await fetch(`${studio.url}/asset/${asset.path}`);
      expect(servedAsset.status).toBe(200);
      expect((await servedAsset.arrayBuffer()).byteLength).toBeGreaterThan(0);
      expect((await fetch(`${studio.url}/asset/../genmotion.json`)).status).toBeGreaterThanOrEqual(400);

      const frame = await fetch(`${studio.url}/frame/0.png`);
      expect(frame.status).toBe(200);
      expect(frame.headers.get('content-type')).toContain('image/png');
      expect((await frame.arrayBuffer()).byteLength).toBeGreaterThan(100);
      expect((await fetch(`${studio.url}/frame/999999.png`)).status).toBe(400);

      const agents = await fetch(`${studio.url}/api/agents`).then((response) => response.json()) as Array<{ id: string }>;
      expect(agents).toContainEqual(expect.objectContaining({ id: 'codex' }));
      const refreshedAgents = await fetch(`${studio.url}/api/agents/refresh`, { method: 'POST', headers });
      expect(refreshedAgents.status).toBe(200);
      expect(await refreshedAgents.json()).toContainEqual(expect.objectContaining({ id: 'codex' }));
      expect(await fetch(`${studio.url}/api/motion-libraries`).then((response) => response.json())).toEqual([]);

      const queued = await fetch(`${studio.url}/api/requests`, {
        method: 'POST', headers, body: JSON.stringify({ prompt: 'Increase the final proof hold by half a second.', selection: { sceneId: 'scene-1', frame: 12 } }),
      });
      expect(queued.status).toBe(201);
      const request = await queued.json() as { id: string };
      expect((await getStudioRequests(directory))[0]).toMatchObject({ id: request.id, status: 'pending' });
      expect(await resolveStudioRequest(directory, request.id, 'Extended the hold and revalidated the timeline.')).toMatchObject({ status: 'resolved' });
      expect(await fetch(`${studio.url}/api/requests`).then((response) => response.json())).toContainEqual(expect.objectContaining({ id: request.id, status: 'resolved' }));

      const history = await fetch(`${studio.url}/api/history`).then((response) => response.json()) as Array<{ revision: string }>;
      expect(history.length).toBeGreaterThan(0);
      const restored = await fetch(`${studio.url}/api/history/${history[0]?.revision ?? ''}/restore`, { method: 'POST', headers });
      expect(restored.status).toBe(200);
      expect(await restored.json()).toMatchObject({ ok: true, project: { title: 'Agent-authored render' } });

      const render = await fetch(`${studio.url}/api/render`, {
        method: 'POST', headers, body: JSON.stringify({ filename: 'studio-test.mp4', quality: 'draft', codec: 'h264' }),
      });
      expect(render.status).toBe(202);
      const duplicateRender = await fetch(`${studio.url}/api/render`, {
        method: 'POST', headers, body: JSON.stringify({ filename: 'studio-test.mp4', quality: 'draft', codec: 'h264' }),
      });
      expect(duplicateRender.status).toBe(409);
      const job = await render.json() as { id: string };
      let status = 'queued';
      for (let attempt = 0; attempt < 80 && status !== 'complete' && status !== 'failed'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const jobs = await fetch(`${studio.url}/api/jobs`).then((response) => response.json()) as Array<{ id: string; status: string }>;
        status = jobs.find((candidate) => candidate.id === job.id)?.status ?? status;
      }
      expect(status).toBe('complete');
      expect((await stat(path.join(directory, 'renders', 'studio-test.mp4'))).size).toBeGreaterThan(1000);
      const existingRender = await fetch(`${studio.url}/api/render`, {
        method: 'POST', headers, body: JSON.stringify({ filename: 'studio-test.mp4', quality: 'draft', codec: 'h264' }),
      });
      expect(existingRender.status).toBe(409);
      expect(await existingRender.json()).toMatchObject({ code: 'OUTPUT_EXISTS' });
      const exports = await fetch(`${studio.url}/api/exports`).then((response) => response.json()) as Array<{ filename: string; output: string; size: number }>;
      expect(exports).toContainEqual(expect.objectContaining({ filename: 'studio-test.mp4', output: 'renders/studio-test.mp4' }));
      const download = await fetch(`${studio.url}/api/exports/studio-test.mp4/download`);
      expect(download.status).toBe(200);
      expect(download.headers.get('content-disposition')).toContain('attachment; filename="studio-test.mp4"');
      expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(1000);
      expect((await fetch(`${studio.url}/api/exports/not-a-video.txt/download`)).status).toBe(400);
      const reveal = await fetch(`${studio.url}/api/exports/reveal`, {
        method: 'POST', headers, body: JSON.stringify({ filename: 'studio-test.mp4' }),
      });
      expect(reveal.status).toBe(200);
      expect(revealed).toEqual([await realpath(path.resolve(directory, 'renders', 'studio-test.mp4'))]);
      const invalidReveal = await fetch(`${studio.url}/api/exports/reveal`, {
        method: 'POST', headers, body: JSON.stringify({ filename: '../genmotion.json' }),
      });
      expect(invalidReveal.status).toBe(400);
      expect(savedBody.revision).not.toBe(bootstrap.revision);
    } finally { await studio.close(); }
  }, 30_000);

  it('rejects every state-changing endpoint without the Studio session token', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent() });
    try {
      const mutations = [
        { method: 'PUT', path: '/api/project', body: {} },
        { method: 'PUT', path: '/api/studio', body: {} },
        { method: 'POST', path: '/api/studio/auto-layout', body: {} },
        { method: 'POST', path: '/api/history/0000000000000000/restore', body: {} },
        { method: 'POST', path: '/api/assets?purpose=asset&filename=test.png', body: {} },
        { method: 'DELETE', path: '/api/assets', body: { path: 'assets/studio/test.png' } },
        { method: 'POST', path: '/api/motion-libraries', body: {} },
        { method: 'POST', path: '/api/references/connect', body: {} },
        { method: 'POST', path: '/api/requests', body: { prompt: 'This must not be accepted.' } },
        { method: 'POST', path: '/api/agents/refresh', body: {} },
        { method: 'POST', path: '/api/requests/00000000-0000-0000-0000-000000000000/cancel', body: {} },
        { method: 'POST', path: '/api/render', body: {} },
        { method: 'POST', path: '/api/jobs/00000000-0000-0000-0000-000000000000/cancel', body: {} },
        { method: 'POST', path: '/api/projects/open', body: {} },
        { method: 'POST', path: '/api/projects', body: {} },
        { method: 'POST', path: '/api/exports/reveal', body: {} },
      ];
      for (const mutation of mutations) {
        const response = await fetch(`${studio.url}${mutation.path}`, { method: mutation.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(mutation.body) });
        expect(response.status, `${mutation.method} ${mutation.path}`).toBe(403);
      }
    } finally { await studio.close(); }
  });

  it('cancels an export without retaining a partial master', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent() });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const headers = { 'content-type': 'application/json', 'x-genmotion-token': token };
      const started = await fetch(`${studio.url}/api/render`, {
        method: 'POST', headers, body: JSON.stringify({ filename: 'cancelled.mp4', quality: 'high', codec: 'h264' }),
      });
      expect(started.status).toBe(202);
      const job = await started.json() as { id: string };
      const cancelled = await fetch(`${studio.url}/api/jobs/${job.id}/cancel`, { method: 'POST', headers });
      expect(cancelled.status).toBe(202);
      expect(await cancelled.json()).toMatchObject({ id: job.id, status: 'cancelled' });
      await expect.poll(async () => {
        const jobs = await fetch(`${studio.url}/api/jobs`).then((response) => response.json()) as Array<{ id: string; status: string }>;
        return jobs.find((candidate) => candidate.id === job.id)?.status;
      }).toBe('cancelled');
      await expect(stat(path.join(directory, 'renders', 'cancelled.mp4'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await studio.close(); }
  }, 20_000);

  it('rejects cross-site browser requests before exposing Studio state', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent() });
    try {
      const fetchSite = await fetch(`${studio.url}/api/session`, { headers: { 'sec-fetch-site': 'cross-site' } });
      expect(fetchSite.status).toBe(403);
      const origin = await fetch(`${studio.url}/api/session`, { headers: { origin: 'https://attacker.invalid' } });
      expect(origin.status).toBe(403);
    } finally { await studio.close(); }
  });

  it('runs an authenticated local agent turn, reloads its validated edit, and persists the conversation', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent('valid') });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const queued = await fetch(`${studio.url}/api/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-genmotion-token': token },
        body: JSON.stringify({ prompt: 'Rename this composition.', host: 'codex', selection: { frame: 0 } }),
      });
      expect(queued.status).toBe(201);
      const request = await queued.json() as { id: string };
      const record = await waitForRequest(directory, request.id);
      expect(record).toMatchObject({ status: 'completed', response: 'Applied and validated the requested change.' });
      expect(record?.afterRevision).toBeTruthy();
      const bootstrap = await fetch(`${studio.url}/api/bootstrap`).then((response) => response.json()) as { project: { title: string } };
      expect(bootstrap.project.title).toBe('Changed by local agent');
    } finally { await studio.close(); }
  });

  it('does not report a requested edit as complete when the agent changed nothing', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent() });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const queued = await fetch(`${studio.url}/api/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-genmotion-token': token },
        body: JSON.stringify({ prompt: 'Create a complete four-scene launch film.', host: 'codex' }),
      });
      const request = await queued.json() as { id: string };
      const record = await waitForRequest(directory, request.id, new Set(['failed']));
      expect(record).toMatchObject({ status: 'failed' });
      expect(record.error).toContain('without applying the requested project change');
    } finally { await studio.close(); }
  });

  it('rejects an agent result that misses explicit duration and scene-count acceptance criteria', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent('valid') });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const queued = await fetch(`${studio.url}/api/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-genmotion-token': token },
        body: JSON.stringify({ prompt: 'Create a 15-second launch film. Build four connected scenes.', host: 'codex' }),
      });
      const request = await queued.json() as { id: string };
      const record = await waitForRequest(directory, request.id, new Set(['failed']));
      expect(record).toMatchObject({ status: 'failed' });
      expect(record.error).toContain('without satisfying the requested production contract');
    } finally { await studio.close(); }
  });

  it('preserves an invalid agent edit for diagnosis and restores the last valid project', async () => {
    const directory = await fixture();
    const original = await readFile(path.join(directory, 'genmotion.json'), 'utf8');
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent('invalid') });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const queued = await fetch(`${studio.url}/api/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-genmotion-token': token },
        body: JSON.stringify({ prompt: 'Make an invalid change.', host: 'codex' }),
      });
      const request = await queued.json() as { id: string };
      const record = await waitForRequest(directory, request.id, new Set(['failed']));
      expect(record.status).toBe('failed');
      expect(await readFile(path.join(directory, 'genmotion.json'), 'utf8')).toBe(original);
      expect((await stat(path.join(directory, '.genmotion', 'failed-agent-edits', `${request.id}.json`))).size).toBeGreaterThan(0);
    } finally { await studio.close(); }
  });

  it('cancels a running local agent turn without leaving the project locked', async () => {
    const directory = await fixture();
    const blockingAgent: AgentRuntime = {
      hosts: () => Promise.resolve([{ id: 'codex', label: 'Codex', installed: true, authenticated: true, detail: 'Test session' }]),
      run: (input) => new Promise((_resolve, reject) => {
        const stop = (): void => reject(new Error('Agent turn cancelled.'));
        if (input.signal?.aborted) stop();
        else input.signal?.addEventListener('abort', stop, { once: true });
      }),
      close: () => Promise.resolve(),
    };
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: blockingAgent });
    try {
      const token = (await fetch(`${studio.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const headers = { 'content-type': 'application/json', 'x-genmotion-token': token };
      const queued = await fetch(`${studio.url}/api/requests`, { method: 'POST', headers, body: JSON.stringify({ prompt: 'Wait for cancellation.', host: 'codex' }) });
      const request = await queued.json() as { id: string };
      await expect.poll(async () => (await getStudioRequests(directory)).find((candidate) => candidate.id === request.id)?.status).toBe('running');
      const cancelled = await fetch(`${studio.url}/api/requests/${request.id}/cancel`, { method: 'POST', headers });
      expect(cancelled.status).toBe(202);
      await expect.poll(async () => (await getStudioRequests(directory)).find((candidate) => candidate.id === request.id)?.status).toBe('interrupted');
      const bootstrap = await fetch(`${studio.url}/api/bootstrap`);
      expect(bootstrap.status).toBe(200);
    } finally { await studio.close(); }
  });
});
