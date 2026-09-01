import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isEntrypoint } from '../src/entrypoint.js';

describe('command entrypoint detection', () => {
  it('recognizes a CLI reached through a package-manager directory link', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-entrypoint-'));
    try {
      const repository = path.resolve('.');
      const linked = path.join(directory, 'linked-package');
      await symlink(repository, linked, process.platform === 'win32' ? 'junction' : 'dir');
      const realEntry = path.join(repository, 'dist', 'cli.js');
      const linkedEntry = path.join(linked, 'dist', 'cli.js');
      expect(isEntrypoint(pathToFileURL(realEntry).href, linkedEntry)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
