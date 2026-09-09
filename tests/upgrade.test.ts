import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { inspectProjectCompatibility, rollbackProjectUpgrade, upgradeProject } from '../src/ir/upgrade.js';

describe('version-safe project upgrades', () => {
  it('migrates with preserved pins, native frame validation, visible change report and exact rollback', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-upgrade-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true }); const file = path.join(directory, 'genmotion.json'), legacy = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>; legacy.schemaVersion = 0; await writeFile(file, JSON.stringify(legacy));
      expect(await inspectProjectCompatibility(directory)).toMatchObject({ before: { schemaVersion: 0 }, after: { schemaVersion: 1 }, compatible: true, migrations: [expect.stringContaining('0->1')] });
      const dry = await upgradeProject(directory, { actor: 'qa', dryRun: true }); expect(dry).toMatchObject({ changed: false, dryRun: true, backup: null }); expect(dry.representativeFrames).toHaveLength(3); expect((JSON.parse(await readFile(file, 'utf8')) as { schemaVersion: number }).schemaVersion).toBe(0);
      const applied = await upgradeProject(directory, { actor: 'qa' }); expect(applied).toMatchObject({ changed: true, actor: 'qa', after: { schemaVersion: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } }); expect(applied.backup).toContain('.genmotion'); expect((await loadProject(directory)).project.schemaVersion).toBe(1);
      const rollback = await rollbackProjectUpgrade(directory, applied.backup!, 'qa'); expect(rollback.restoredSha256).toBe(applied.before.sha256); expect((JSON.parse(await readFile(file, 'utf8')) as { schemaVersion: number }).schemaVersion).toBe(0); expect((await loadProject(directory)).project.schemaVersion).toBe(1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
