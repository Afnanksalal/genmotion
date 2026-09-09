import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ContentStore } from '../src/ir/content-store.js';
import { loadProject } from '../src/ir/loader.js';

describe('shared content-addressed dependency store', () => {
  it('deduplicates, verifies, enforces quotas and deterministically resolves projects', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-content-'));
    try {
      const source = path.join(directory, 'source.bin'); await writeFile(source, 'shared bytes'); const store = new ContentStore(path.join(directory, 'store'), { maxBytes: 1024 * 1024, maxEntries: 10 }); const first = await store.put(source), second = await store.put(source); expect(first.reused).toBe(false); expect(second).toMatchObject({ hash: first.hash, reused: true }); const output = path.join(directory, 'resolved.bin'); await store.materialize(first.hash, output); expect(await readFile(output, 'utf8')).toBe('shared bytes');
      const tiny = new ContentStore(path.join(directory, 'tiny'), { maxBytes: 1, maxEntries: 1 }); await expect(tiny.put(source)).rejects.toThrow(/quota/);
      const projectDirectory = path.join(directory, 'project'); await cp(path.resolve('tests/fixtures/basic'), projectDirectory, { recursive: true }); const project = await store.putProject(await loadProject(projectDirectory)); expect(project.dependencyIdentity).toMatch(/^[a-f0-9]{64}$/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
