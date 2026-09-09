import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { LoadedProject } from './loader.js';
import { createProjectBundle, verifyProjectBundle } from './bundle.js';
import { reviewArtifactSchema, type ReviewArtifact } from './review-artifact.js';

const sha = z.string().regex(/^[a-f0-9]{64}$/), file = z.object({ path: z.string().min(1), sha256: sha, bytes: z.number().int().nonnegative() }).strict();
export const reviewAccessSchema = z.discriminatedUnion('mode', [z.object({ mode: z.literal('offline') }).strict(), z.object({ mode: z.literal('shared'), secretHash: z.string().regex(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/), expiresAt: z.string().datetime().optional(), allowedOrigins: z.array(z.string().url()).max(32).default([]) }).strict()]);
export const reviewCommentSchema = z.object({ id: z.string().min(1), author: z.string().min(1).max(200), createdAt: z.string().datetime(), time: z.number().finite().nonnegative(), message: z.string().min(1).max(20_000), target: z.string().min(1).optional(), resolved: z.boolean().default(false) }).strict();
export const reviewBundleManifestSchema = z.object({ version: z.literal(1), id: sha, sourceRevision: z.string().min(1), sourceHash: sha, projectBundleId: sha, access: reviewAccessSchema, comments: z.array(reviewCommentSchema).max(100_000), files: z.array(file).min(3).max(20_000) }).strict();
export type ReviewBundleManifest = z.infer<typeof reviewBundleManifestSchema>;

export function hashReviewSecret(secret: string, salt = randomBytes(16).toString('hex')): string { if (secret.length < 12 || secret.length > 4096 || !/^[a-f0-9]{32}$/.test(salt)) throw new Error('Review secrets require at least 12 characters and a 16-byte hexadecimal salt'); return `scrypt$${salt}$${scryptSync(secret, Buffer.from(salt, 'hex'), 32).toString('hex')}`; }
export function verifyReviewSecret(secret: string, encoded: string): boolean { const [, salt] = encoded.split('$'); return Boolean(salt && hashReviewSecret(secret, salt) === encoded); }
const digest = async (filePath: string) => { const data = await readFile(filePath); return { sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length }; };
const safeName = (value: string, index: number): string => `${String(index).padStart(4, '0')}-${path.basename(value).replace(/[^a-zA-Z0-9._-]/g, '_')}`;

/** Freeze a revision-bound review, its project dependencies and visual evidence into one offline directory. */
export async function createReviewBundle(loaded: LoadedProject, artifactInput: ReviewArtifact, outputRoot: string, accessInput: z.input<typeof reviewAccessSchema>, commentsInput: z.input<typeof reviewCommentSchema>[] = []) {
  const artifact = reviewArtifactSchema.parse(artifactInput), access = reviewAccessSchema.parse(accessInput), comments = z.array(reviewCommentSchema).max(100_000).parse(commentsInput);
  const currentRevision = createHash('sha256').update(await readFile(loaded.projectFile)).digest('hex'); if (artifact.sourceRevision !== currentRevision) throw new Error('Review artifact revision does not match the loaded project revision');
  if (access.mode === 'shared' && access.expiresAt && Date.parse(access.expiresAt) <= Date.now()) throw new Error('Shared review access is already expired');
  const root = path.resolve(outputRoot); await mkdir(root, { recursive: true }); const staging = path.join(root, `.review-${randomBytes(8).toString('hex')}`); await mkdir(staging);
  try {
    const projectResult = await createProjectBundle(loaded, path.join(staging, 'projects')); const projectTarget = path.join(staging, 'project'); await rename(projectResult.directory, projectTarget); await rm(path.join(staging, 'projects'), { recursive: true, force: true });
    await writeFile(path.join(staging, 'review.json'), JSON.stringify(artifact, null, 2) + '\n');
    await writeFile(path.join(staging, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Genmotion review</title><main><h1>Offline Genmotion review</h1><p>This immutable bundle contains review.json, timestamped comments, verified evidence, and a frozen project.</p></main>');
    const evidence = [...artifact.representativeFrames, ...artifact.comparedVariants.flatMap((variant) => variant.frames)], files: ReviewBundleManifest['files'] = [];
    for (const [index, frame] of evidence.entries()) { const target = path.join(staging, 'evidence', safeName(frame.path, index)); await mkdir(path.dirname(target), { recursive: true }); await cp(path.resolve(loaded.projectDir, frame.path), target, { errorOnExist: true }); const value = await digest(target); if (value.sha256 !== frame.sha256) throw new Error(`Review evidence hash changed: ${frame.path}`); }
    const walk = async (directory: string): Promise<void> => { for (const entry of await (await import('node:fs/promises')).readdir(directory, { withFileTypes: true })) { const full = path.join(directory, entry.name); if (entry.isDirectory()) await walk(full); else { const relative = path.relative(staging, full).replaceAll('\\', '/'); if (relative !== 'review.manifest.json') files.push({ path: relative, ...await digest(full) }); } } }; await walk(staging); files.sort((a, b) => a.path.localeCompare(b.path));
    const payload = { version: 1 as const, sourceRevision: artifact.sourceRevision, sourceHash: artifact.sourceHash, projectBundleId: projectResult.manifest.id, access, comments, files }, id = createHash('sha256').update(JSON.stringify(payload)).digest('hex'), manifest: ReviewBundleManifest = { id, ...payload };
    await writeFile(path.join(staging, 'review.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    const destination = path.join(root, id); await rename(staging, destination); await verifyReviewBundle(destination); return { directory: destination, manifest };
  } finally { await rm(staging, { recursive: true, force: true }); }
}

export async function verifyReviewBundle(directory: string): Promise<ReviewBundleManifest> {
  const root = path.resolve(directory), manifest = reviewBundleManifestSchema.parse(JSON.parse(await readFile(path.join(root, 'review.manifest.json'), 'utf8'))), { id, ...payload } = manifest;
  if (createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== id) throw new Error('Review bundle manifest identity mismatch');
  for (const entry of manifest.files) { const target = path.resolve(root, entry.path); if (!target.startsWith(root + path.sep)) throw new Error('Review bundle path escapes its root'); const measured = await digest(target); if (measured.sha256 !== entry.sha256 || measured.bytes !== entry.bytes) throw new Error(`Review bundle file changed: ${entry.path}`); }
  const project = await verifyProjectBundle(path.join(root, 'project')); if (project.id !== manifest.projectBundleId) throw new Error('Review project bundle identity mismatch');
  const artifact = reviewArtifactSchema.parse(JSON.parse(await readFile(path.join(root, 'review.json'), 'utf8'))); if (artifact.sourceRevision !== manifest.sourceRevision || artifact.sourceHash !== manifest.sourceHash) throw new Error('Review artifact does not match its manifest');
  if (!(await stat(path.join(root, 'index.html'))).isFile()) throw new Error('Offline review entry point is missing'); return manifest;
}
