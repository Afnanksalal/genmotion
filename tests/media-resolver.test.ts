import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { MediaResolver } from '../src/ir/media-resolver.js';

describe('provider-neutral media resolution', () => {
  it('searches and freezes generated media with complete provenance', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-resolver-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true }); const generated = path.join(directory, 'provider-output.bin'); await writeFile(generated, 'pixels'); const loaded = await loadProject(directory), resolver = new MediaResolver();
      resolver.register({ id: 'fixture', operations: ['search', 'generate'], search: () => Promise.resolve([{ id: 'one', title: 'Candidate', source: 'fixture:one', license: { status: 'documented', evidence: 'license.txt' }, score: .9 }]), deliver: () => Promise.resolve({ localFile: generated, source: 'fixture:job-1', sourceVerified: true, model: 'fixture-v1', tool: 'fixture-tool', license: { status: 'documented', identifier: 'CC0', evidence: 'license.txt' } }) });
      expect((await resolver.execute(loaded, { operation: 'search', provider: 'fixture', kind: 'image', intent: 'hero image' })).candidates).toHaveLength(1);
      const result = await resolver.execute(loaded, { operation: 'generate', provider: 'fixture', kind: 'image', intent: 'hero image', prompt: 'abstract green field', destination: 'assets/hero.bin', settings: { seed: 4 } });
      expect(result).toMatchObject({ state: 'complete', record: { path: 'assets/hero.bin', metadata: { origin: 'generated', source: { provider: 'fixture', model: 'fixture-v1', prompt: 'abstract green field', settings: { seed: 4 } } } } });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('refuses unverifiable logos and exposes unavailable provider failures', async () => {
    const loaded = await loadProject('tests/fixtures/basic'), resolver = new MediaResolver(); resolver.register({ id: 'fixture', operations: ['resolve'], deliver: () => Promise.resolve({ localFile: loaded.projectFile, source: 'https://example.test/logo.svg', sourceVerified: false, license: { status: 'unknown' } }) });
    expect(await resolver.execute(loaded, { operation: 'resolve', provider: 'fixture', kind: 'logo', intent: 'official logo', destination: 'assets/logo.svg' })).toMatchObject({ state: 'failed', error: expect.stringContaining('verified source') });
    expect(await resolver.execute(loaded, { operation: 'search', provider: 'missing', kind: 'sfx', intent: 'impact' })).toMatchObject({ state: 'failed', error: expect.stringContaining('unavailable') });
  });
});
