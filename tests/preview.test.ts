import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadProject } from '../src/ir/loader.js';
import { startPreview } from '../src/engine/preview.js';

describe('preview server', () => {
  it('serves project metadata and native rendered frames', async () => {
    const loaded = await loadProject(path.resolve('tests/fixtures/basic'));
    const preview = await startPreview(loaded, { port: 0 });
    try {
      const metadata = await fetch(`${preview.url}/api/project`).then((response) => response.json()) as { frames: number; title: string };
      expect(metadata).toMatchObject({ frames: 30, title: 'Deterministic render' });
      const frame = await fetch(`${preview.url}/frame/10.png`);
      expect(frame.status).toBe(200);
      expect(frame.headers.get('content-type')).toBe('image/png');
      expect((await frame.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    } finally { await preview.close(); }
  });
});
