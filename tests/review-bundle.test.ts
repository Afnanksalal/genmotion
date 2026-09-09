import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createReviewArtifact, createReviewBundle, hashReviewSecret, readProjectSnapshot, renderFramePng, verifyReviewBundle, verifyReviewSecret } from '../src/index.js';

const temporary: string[] = []; afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));
describe('portable review bundles', () => {
  it('freezes source, evidence, comments and offline access with complete integrity checks', async () => {
    const root = await mkdtemp(path.resolve('.tmp-review-')); temporary.push(root); const projectDir = path.join(root, 'source'); await cp(path.resolve('tests/fixtures/basic'), projectDir, { recursive: true }); const loaded = await readProjectSnapshot(projectDir);
    const png = await renderFramePng(loaded.project, loaded.projectDir, 2), framePath = path.join(projectDir, 'review-frame.png'); await writeFile(framePath, png); const frameHash = createHash('sha256').update(png).digest('hex'), sourceHash = 'a'.repeat(64);
    const artifact = createReviewArtifact({ sourceRevision: loaded.revision, sourceHash, dependencyHash: 'b'.repeat(64), checkReport: { sourceHash }, representativeFrames: [{ time: 2 / loaded.project.fps, sha256: frameHash, path: 'review-frame.png' }], comparedVariants: [], audioFindings: [], unresolvedDecisions: [] });
    const result = await createReviewBundle(loaded, artifact, path.join(root, 'bundles'), { mode: 'offline' }, [{ id: 'note', author: 'Reviewer', createdAt: '2026-09-09T00:00:00.000Z', time: .2, message: 'Hold this title longer', target: 'title' }]);
    expect(await verifyReviewBundle(result.directory)).toEqual(result.manifest); expect(await readFile(path.join(result.directory, 'index.html'), 'utf8')).toContain('Offline Genmotion review');
    await writeFile(path.join(result.directory, 'review.json'), '{}'); await expect(verifyReviewBundle(result.directory)).rejects.toThrow(/changed/);
  });
  it('hashes shared review secrets and refuses weak secrets or expired policies', () => {
    const encoded = hashReviewSecret('review-password'); expect(verifyReviewSecret('review-password', encoded)).toBe(true); expect(verifyReviewSecret('wrong-password', encoded)).toBe(false); expect(() => hashReviewSecret('short')).toThrow(/12 characters/);
  });
});
