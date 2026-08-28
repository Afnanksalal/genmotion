import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../src/ir/loader.js';
import { getStudioRequests, resolveStudioRequest, startStudio } from '../src/studio/server.js';

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-studio-'));
  cleanup.push(directory);
  await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
  return directory;
}

describe('Genmotion Studio', () => {
  it('persists validated edits, reference assets, workflow state, requests, history, and exports', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0 });
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
      const job = await render.json() as { id: string };
      let status = 'queued';
      for (let attempt = 0; attempt < 80 && status !== 'complete' && status !== 'failed'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const jobs = await fetch(`${studio.url}/api/jobs`).then((response) => response.json()) as Array<{ id: string; status: string }>;
        status = jobs.find((candidate) => candidate.id === job.id)?.status ?? status;
      }
      expect(status).toBe('complete');
      expect((await stat(path.join(directory, 'renders', 'studio-test.mp4'))).size).toBeGreaterThan(1000);
      expect(savedBody.revision).not.toBe(bootstrap.revision);
    } finally { await studio.close(); }
  }, 30_000);

  it('rejects state-changing requests without the Studio session token', async () => {
    const directory = await fixture();
    const studio = await startStudio(await loadProject(directory), { port: 0 });
    try {
      const response = await fetch(`${studio.url}/api/requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'This must not be accepted.' }) });
      expect(response.status).toBe(403);
    } finally { await studio.close(); }
  });
});
