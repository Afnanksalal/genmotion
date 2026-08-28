import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../src/ir/loader.js';
import { getStudioRequests, resolveStudioRequest, startStudio } from '../src/studio/server.js';
import type { AgentRuntime } from '../src/agent/runtime.js';

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-studio-'));
  cleanup.push(directory);
  await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
  return directory;
}

function fakeAgent(edit: false | 'valid' | 'invalid' = false): AgentRuntime {
  return {
    hosts: () => Promise.resolve([{ id: 'codex', label: 'Codex', installed: true, authenticated: true, detail: 'Test session' }]),
    run: async (input, onProgress) => {
      await onProgress({ activity: 'Applying changes', message: 'Working', sessionId: 'test-thread' });
      if (edit) {
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
        }),
      });
      expect(created.status).toBe(201);
      const createdBody = await created.json() as { url: string; project: { id: string; title: string } };
      expect(createdBody.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(createdBody.project).toMatchObject({ title: 'Launch film' });
      expect((await stat(path.join(workspaceRoot, 'launch-film', 'genmotion.json'))).isFile()).toBe(true);
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
      expect(await html.text()).toContain('Genmotion Studio');
      expect(html.headers.get('content-security-policy')).toContain("default-src 'self'");

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

      const queued = await fetch(`${studio.url}/api/requests`, {
        method: 'POST', headers, body: JSON.stringify({ prompt: 'Increase the final proof hold by half a second.', selection: { sceneId: 'scene-1', frame: 12 } }),
      });
      expect(queued.status).toBe(201);
      const request = await queued.json() as { id: string };
      expect((await getStudioRequests(directory))[0]).toMatchObject({ id: request.id, status: 'pending' });
      expect(await resolveStudioRequest(directory, request.id, 'Extended the hold and revalidated the timeline.')).toMatchObject({ status: 'resolved' });

      const history = await fetch(`${studio.url}/api/history`).then((response) => response.json()) as unknown[];
      expect(history.length).toBeGreaterThan(0);

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
      const reveal = await fetch(`${studio.url}/api/exports/reveal`, {
        method: 'POST', headers, body: JSON.stringify({ filename: 'studio-test.mp4' }),
      });
      expect(reveal.status).toBe(200);
      expect(revealed).toEqual([path.resolve(directory, 'renders', 'studio-test.mp4')]);
      const invalidReveal = await fetch(`${studio.url}/api/exports/reveal`, {
        method: 'POST', headers, body: JSON.stringify({ filename: '../genmotion.json' }),
      });
      expect(invalidReveal.status).toBe(400);
      expect(savedBody.revision).not.toBe(bootstrap.revision);
    } finally { await studio.close(); }
  }, 30_000);

  it('rejects state-changing requests without the Studio session token', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime: fakeAgent() });
    try {
      const response = await fetch(`${studio.url}/api/requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'This must not be accepted.' }) });
      expect(response.status).toBe(403);
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
      let record: { status: string; response?: string; afterRevision?: string } | undefined;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        record = (await getStudioRequests(directory)).find((candidate) => candidate.id === request.id);
        if (record?.status === 'completed' || record?.status === 'failed') break;
      }
      expect(record).toMatchObject({ status: 'completed', response: 'Applied and validated the requested change.' });
      expect(record?.afterRevision).toBeTruthy();
      const bootstrap = await fetch(`${studio.url}/api/bootstrap`).then((response) => response.json()) as { project: { title: string } };
      expect(bootstrap.project.title).toBe('Changed by local agent');
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
      let status = '';
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        status = (await getStudioRequests(directory)).find((candidate) => candidate.id === request.id)?.status ?? '';
        if (status === 'failed') break;
      }
      expect(status).toBe('failed');
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
