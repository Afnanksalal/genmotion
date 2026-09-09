import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import YAML from 'yaml';
import { renderFramePng } from '../engine/draw.js';
import { GENMOTION_VERSION } from '../version.js';
import { GenmotionError } from '../errors.js';
import { replaceFile } from './atomic.js';
import { findProjectFile, loadProjectDocument } from './loader.js';
import { projectDuration, projectSchema } from './schema.js';
import { validateProject, hasErrors } from './validate.js';

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const headerSchema = z.object({ schemaVersion: z.number().int().nonnegative() }).passthrough();
const parseDocument = (file: string, content: string): unknown => /[.]ya?ml$/i.test(file) ? YAML.parse(content) : JSON.parse(content);
const serializeDocument = (file: string, value: unknown): string => /[.]ya?ml$/i.test(file) ? YAML.stringify(value) : `${JSON.stringify(value, null, 2)}\n`;
export function migrateProjectDocument(input: unknown) {
  const version = headerSchema.parse(input).schemaVersion;
  if (version === 1) return { project: projectSchema.parse(input), migrations: [] as string[] };
  if (version === 0) return { project: projectSchema.parse({ ...(input as Record<string, unknown>), schemaVersion: 1 }), migrations: ['0->1: normalized Creative IR defaults and explicit compatibility fields'] };
  throw new GenmotionError('PROJECT_VERSION_UNSUPPORTED', `Creative IR schema ${version} is unsupported by Genmotion ${GENMOTION_VERSION}.`);
}
export async function inspectProjectCompatibility(input: string) {
  const projectFile = await findProjectFile(input), rawText = await readFile(projectFile, 'utf8'), raw = parseDocument(projectFile, rawText), migrated = migrateProjectDocument(raw);
  const projectMajor = migrated.project.schemaVersion, runtimeSchema = 1, pins = migrated.project.motionLibraryPins;
  const changes = [...migrated.migrations, ...Object.entries(pins).map(([id, version]) => `preserve motion library pin ${id}@${version}`)];
  return { version: 1 as const, projectFile, before: { schemaVersion: headerSchema.parse(raw).schemaVersion, sha256: hash(rawText) }, after: { schemaVersion: projectMajor, runtime: GENMOTION_VERSION }, compatible: projectMajor === runtimeSchema, pins, migrations: migrated.migrations, changes };
}
export async function upgradeProject(input: string, options: { dryRun?: boolean; actor: string }) {
  const projectFile = await findProjectFile(input), rawText = await readFile(projectFile, 'utf8'), compatibility = await inspectProjectCompatibility(projectFile), migrated = migrateProjectDocument(parseDocument(projectFile, rawText));
  const loaded = await loadProjectDocument(migrated.project, projectFile), findings = await validateProject(loaded);
  if (hasErrors(findings)) throw new GenmotionError('UPGRADE_VALIDATION_FAILED', 'Migrated project failed validation; the source was not changed.', findings);
  const totalFrames = Math.max(1, Math.ceil(projectDuration(loaded.project) * loaded.project.fps)), frames = [...new Set([0, Math.floor((totalFrames - 1) / 2), totalFrames - 1])];
  const representativeFrames = [] as Array<{ frame: number; sha256: string; bytes: number }>;
  for (const frame of frames) { const png = await renderFramePng(loaded.project, loaded.projectDir, frame); representativeFrames.push({ frame, sha256: hash(png), bytes: png.length }); }
  const serialized = serializeDocument(projectFile, migrated.project), afterHash = hash(serialized);
  if (options.dryRun || afterHash === compatibility.before.sha256) return { ...compatibility, actor: options.actor, dryRun: Boolean(options.dryRun), changed: false, backup: null, representativeFrames, findings };
  const backupDirectory = path.join(path.dirname(projectFile), '.genmotion', 'upgrades'), backup = path.join(backupDirectory, `${new Date().toISOString().replaceAll(':', '-')}-${compatibility.before.sha256.slice(0, 12)}.json`); await mkdir(backupDirectory, { recursive: true }); await writeFile(backup, rawText, { flag: 'wx' });
  const candidate = `${projectFile}.${randomUUID()}.upgrade`; await writeFile(candidate, serialized, { flag: 'wx' }); try { await replaceFile(candidate, projectFile); } finally { await rm(candidate, { force: true }); }
  return { ...compatibility, actor: options.actor, dryRun: false, changed: true, backup, after: { ...compatibility.after, sha256: afterHash }, representativeFrames, findings };
}
export async function rollbackProjectUpgrade(input: string, backup: string, actor: string) {
  const projectFile = await findProjectFile(input), root = path.resolve(path.dirname(projectFile), '.genmotion', 'upgrades'), source = path.resolve(backup), relative = path.relative(root, source); if (relative.startsWith('..') || path.isAbsolute(relative)) throw new GenmotionError('UPGRADE_BACKUP_OUTSIDE_PROJECT', 'Rollback source must be a project upgrade backup.');
  const content = await readFile(source, 'utf8'); migrateProjectDocument(parseDocument(source, content)); const candidate = `${projectFile}.${randomUUID()}.rollback`; await writeFile(candidate, content, { flag: 'wx' }); const replacedSha256 = hash(await readFile(projectFile)); try { await replaceFile(candidate, projectFile); } finally { await rm(candidate, { force: true }); } return { version: 1 as const, actor, projectFile, restoredFrom: source, restoredSha256: hash(content), replacedSha256 };
}
