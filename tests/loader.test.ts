import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveProjectAsset } from '../src/ir/loader.js';

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe('project asset confinement', () => {
  it('rejects lexical parent-directory escapes', () => {
    expect(() => resolveProjectAsset(path.resolve('project'), '../secret.png')).toThrow(/inside the project/i);
  });

  it('rejects existing symlink and junction escapes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'genmotion-assets-'));
    const project = path.join(root, 'project');
    const outside = path.join(root, 'outside');
    cleanup.push(root);
    await Promise.all([mkdir(path.join(project, 'assets'), { recursive: true }), mkdir(outside, { recursive: true })]);
    await writeFile(path.join(outside, 'secret.png'), 'not an image');
    await symlink(outside, path.join(project, 'assets', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => resolveProjectAsset(project, 'assets/linked/secret.png')).toThrow(/symlink|junction/i);
  });
});
