import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { GenmotionProject } from './schema.js';
import type { LoadedProject } from './loader.js';
const hash = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const primitive = z.union([z.string().max(4096), z.number().finite(), z.boolean(), z.null()]);
export const mediaMetadataSchema = z.object({
  kind: z.enum(['image', 'video', 'audio', 'font', 'icon', 'logo', 'transcript', 'analysis', 'other']),
  title: z.string().min(1).max(512),
  origin: z.enum(['imported', 'captured', 'generated', 'derived']).default('imported'),
  source: z.object({ uri: z.string().max(8192).optional(), provider: z.string().max(256).optional(), model: z.string().max(256).optional(), prompt: z.string().max(20000).optional(), tool: z.string().max(256).optional(), settings: z.record(z.string().max(128).refine((key) => !['__proto__', 'prototype', 'constructor'].includes(key)), z.union([primitive, z.array(primitive).max(128)])).default({}).refine((settings) => Object.keys(settings).length <= 64, 'At most 64 source settings') }).strict().default({ settings: {} }),
  license: z.object({ status: z.enum(['unknown', 'user-confirmed', 'documented']).default('unknown'), identifier: z.string().max(256).optional(), attribution: z.string().max(4096).optional(), evidence: z.string().max(8192).optional() }).strict().default({ status: 'unknown' }),
  tags: z.array(z.string().min(1).max(128)).max(128).default([]),
  parents: z.array(z.object({ sha256: hash, recordId: id.optional() }).strict()).max(128).default([]),
  timeMap: z.array(z.object({ sourceStart: z.number().finite().nonnegative(), sourceEnd: z.number().finite().nonnegative(), outputStart: z.number().finite().nonnegative(), outputEnd: z.number().finite().positive() }).strict().refine((span) => span.outputEnd > span.outputStart, 'Output time span must be positive')).max(10000).optional(),
}).strict().superRefine((metadata, context) => {
  if (metadata.origin === 'generated' && (!metadata.source.provider || !metadata.source.model)) context.addIssue({ code: 'custom', message: 'Generated media must identify its provider and model' });
  if (metadata.origin === 'captured' && !metadata.source.uri) context.addIssue({ code: 'custom', message: 'Captured evidence must identify its source URI' });
  if (metadata.origin === 'derived' && !metadata.parents.length) context.addIssue({ code: 'custom', message: 'Derived media must retain parent content hashes' });
  if (metadata.license.status === 'documented' && !metadata.license.evidence) context.addIssue({ code: 'custom', message: 'Documented rights require an evidence reference' });
  for (let index = 1; index < (metadata.timeMap?.length ?? 0); index += 1) if (metadata.timeMap![index]!.outputStart < metadata.timeMap![index - 1]!.outputEnd) context.addIssue({ code: 'custom', message: 'Derivative output time spans must be ordered and non-overlapping' });
});
export const mediaRecordSchema = z.object({ id, path: z.string().min(1).max(4096), sha256: hash, bytes: z.number().int().nonnegative().max(32 * 1024 ** 3), importedAt: z.string().datetime(), metadata: mediaMetadataSchema }).strict();
export const mediaLedgerSchema = z.object({ version: z.literal(1), records: z.array(mediaRecordSchema).max(10000) }).strict().superRefine((ledger, context) => {
  const records = new Map(ledger.records.map((record) => [record.id, record]));
  if (records.size !== ledger.records.length) context.addIssue({ code: 'custom', message: 'Media record IDs must be unique' });
  for (const record of ledger.records) for (const parent of record.metadata.parents) if (parent.recordId) {
    const source = records.get(parent.recordId);
    if (!source || source.sha256 !== parent.sha256) context.addIssue({ code: 'custom', message: 'Parent record is missing or has a different content hash' });
    if (parent.recordId === record.id) context.addIssue({ code: 'custom', message: 'A media record cannot derive from itself' });
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  for (const record of ledger.records) {
    const stack = [{ id: record.id, exit: false }];
    while (stack.length) {
      const entry = stack.pop()!;
      if (entry.exit) { visiting.delete(entry.id); visited.add(entry.id); continue; }
      if (visiting.has(entry.id)) { context.addIssue({ code: 'custom', message: 'Media derivation graph contains a cycle' }); return; }
      if (visited.has(entry.id)) continue;
      visiting.add(entry.id); stack.push({ id: entry.id, exit: true });
      for (const parent of records.get(entry.id)?.metadata.parents ?? []) if (parent.recordId) stack.push({ id: parent.recordId, exit: false });
    }
  }
});
export type MediaRecord = z.infer<typeof mediaRecordSchema>;
export type MediaMetadata = z.input<typeof mediaMetadataSchema>;

async function digest(file: string): Promise<string> { return createHash('sha256').update(await readFile(file)).digest('hex'); }
function localAsset(directory: string, reference: string): string { const root = path.resolve(directory), target = path.resolve(root, reference); if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Media path must stay inside its declared root'); return target; }
export async function inspectMediaLedger(loaded: LoadedProject) {
  const { projectAssetReferences } = await import('./asset-references.js');
  const usage = new Map<string, number>(); for (const reference of projectAssetReferences({ ...loaded.sourceProject, mediaLedger: { version: 1, records: [] } })) usage.set(reference, (usage.get(reference) ?? 0) + 1);
  const records = await Promise.all(loaded.sourceProject.mediaLedger.records.map(async record => {
    try { const file = localAsset(loaded.projectDir, record.path), metadata = await stat(file), actual = await digest(file); return { id: record.id, path: record.path, sha256: record.sha256, bytes: record.bytes, usage: usage.get(record.path) ?? 0, status: actual === record.sha256 && metadata.size === record.bytes ? 'valid' as const : 'changed' as const, actualHash: actual }; }
    catch { return { id: record.id, path: record.path, sha256: record.sha256, bytes: record.bytes, usage: usage.get(record.path) ?? 0, status: 'missing' as const }; }
  }));
  return { version: 1 as const, ok: records.every(record => record.status === 'valid'), records, unused: records.filter(record => record.usage === 0).map(record => record.id), invalidated: records.filter(record => record.status !== 'valid').map(record => record.id) };
}

export async function importMediaRecord(loaded: LoadedProject, input: { id: string; sourceFile: string; path: string; metadata: MediaMetadata; cacheDirectory?: string }): Promise<{ project: GenmotionProject; record: MediaRecord; deduplicatedFrom?: string }> {
  const source = path.resolve(input.sourceFile), sha256 = await digest(source), bytes = (await stat(source)).size, existing = loaded.sourceProject.mediaLedger.records.find(record => record.sha256 === sha256);
  if (existing) return { project: loaded.sourceProject, record: existing, deduplicatedFrom: existing.id };
  const destination = localAsset(loaded.projectDir, input.path); await mkdir(path.dirname(destination), { recursive: true }); const temporary = `${destination}.${randomUUID()}.tmp`; await copyFile(source, temporary); await rename(temporary, destination);
  if (input.cacheDirectory) { const cached = localAsset(path.resolve(input.cacheDirectory), sha256); await mkdir(path.dirname(cached), { recursive: true }); try { await copyFile(source, cached, (await import('node:fs')).constants.COPYFILE_EXCL); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } }
  const record = mediaRecordSchema.parse({ id: input.id, path: input.path.replaceAll('\\', '/'), sha256, bytes, importedAt: new Date().toISOString(), metadata: input.metadata });
  const { projectSchema } = await import('./schema.js'); return { project: projectSchema.parse({ ...loaded.sourceProject, mediaLedger: { version: 1, records: [...loaded.sourceProject.mediaLedger.records, record] } }), record };
}

function replacePath(value: unknown, previous: string, next: string): unknown {
  if (value === previous) return next; if (Array.isArray(value)) return value.map(item => replacePath(item, previous, next));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'path' || key === 'src' || key === 'file' || typeof item !== 'string' ? replacePath(item, previous, next) : item === previous ? next : item])); return value;
}
export async function relocateMediaRecord(loaded: LoadedProject, id: string, nextPath: string): Promise<GenmotionProject> {
  const record = loaded.sourceProject.mediaLedger.records.find(item => item.id === id); if (!record) throw new Error(`Unknown media record: ${id}`);
  const source = localAsset(loaded.projectDir, record.path), destination = localAsset(loaded.projectDir, nextPath); await mkdir(path.dirname(destination), { recursive: true }); await rename(source, destination);
  try { const replaced = replacePath(loaded.sourceProject, record.path, nextPath.replaceAll('\\', '/')) as GenmotionProject; const { projectSchema } = await import('./schema.js'); return projectSchema.parse(replaced); }
  catch (error) { await rename(destination, source); throw error; }
}

export async function removeUnusedMediaRecord(loaded: LoadedProject, id: string): Promise<GenmotionProject> {
  const report = await inspectMediaLedger(loaded), current = report.records.find(record => record.id === id); if (!current) throw new Error(`Unknown media record: ${id}`); if (current.usage) throw new Error('Media record is still in use');
  await rm(localAsset(loaded.projectDir, current.path), { force: true }); const { projectSchema } = await import('./schema.js'); return projectSchema.parse({ ...loaded.sourceProject, mediaLedger: { version: 1, records: loaded.sourceProject.mediaLedger.records.filter(record => record.id !== id) } });
}
