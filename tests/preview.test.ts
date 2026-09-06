import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { loadProject } from '../src/ir/loader.js';
import { startPreview } from '../src/engine/preview.js';

describe('preview server', () => {
  it('closes incomplete client requests without waiting for the HTTP timeout', async () => {
    const preview = await startPreview(await loadProject(path.resolve('tests/fixtures/basic')), { port: 0 });
    const url = new URL(preview.url);
    const socket = createConnection({ host: url.hostname, port: Number(url.port) });
    try {
      await once(socket, 'connect');
      socket.write('GET /api/project HTTP/1.1\r\nHost: localhost\r\n');
      let connectionError: NodeJS.ErrnoException | undefined;
      socket.on('error', (error: NodeJS.ErrnoException) => { connectionError = error; });
      const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
      await preview.close();
      await closed;
      expect(socket.destroyed).toBe(true);
      expect([undefined, 'ECONNRESET']).toContain(connectionError?.code);
    } finally { socket.destroy(); if (preview.server.listening) await preview.close(); }
  }, 5000);

  it('serves project metadata and native rendered frames', async () => {
    const loaded = await loadProject(path.resolve('tests/fixtures/basic'));
    const preview = await startPreview(loaded, { port: 0 });
    try {
      const html = await fetch(preview.url).then((response) => response.text());
      expect(html).toContain('diamond-shaped keyframe');
      const playerScript = await fetch(`${preview.url}/player.js`);
      expect(playerScript.status).toBe(200);
      expect(await playerScript.text()).toContain('class GenmotionPlayer');
      expect(await fetch(`${preview.url}/embed`).then(response => response.text())).toContain('genmotion-player');
      expect((await fetch(`${preview.url}/api/project?parameters=%5B%5D`)).status).toBe(400);
      const configured = await fetch(`${preview.url}/api/project?parameters=%7B%7D`);
      expect(configured.status).toBe(200);
      const favicon = await fetch(`${preview.url}/favicon.svg`);
      expect(favicon.headers.get('content-type')).toContain('image/svg+xml');
      expect(await favicon.text()).toContain('diamond-shaped keyframe');
      const metadata = await fetch(`${preview.url}/api/project`).then((response) => response.json()) as { frames: number; title: string };
      expect(metadata).toMatchObject({ frames: 30, title: 'Agent-authored render' });
      const frame = await fetch(`${preview.url}/frame/10.png`);
      expect(frame.status).toBe(200);
      expect(frame.headers.get('content-type')).toBe('image/png');
      expect((await frame.arrayBuffer()).byteLength).toBeGreaterThan(1000);
      const fractional = await fetch(`${preview.url}/frame/10.5.png`);
      expect(fractional.status).toBe(200);
      expect(Buffer.from(await fractional.arrayBuffer()).equals(await (await import('../src/engine/draw.js')).renderFramePng(loaded.project, loaded.projectDir, 10.5))).toBe(true);
      expect((await fetch(`${preview.url}/frame/10garbage.png`)).status).toBe(400);
    } finally { await preview.close(); }
  });
});
