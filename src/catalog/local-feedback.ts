import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const catalogFeedbackRecordSchema = z.object({ id: z.string().uuid(), kind: z.enum(['search-miss', 'content-quality']), query: z.string().min(1).max(2000), itemId: z.string().max(200).optional(), rating: z.number().int().min(1).max(5).optional(), note: z.string().max(4000).default(''), createdAt: z.string().datetime() }).strict().superRefine((item, context) => { if (item.kind === 'content-quality' && (!item.itemId || !item.rating)) context.addIssue({ code: 'custom', message: 'Content-quality feedback requires an item and rating' }); });
export const catalogFeedbackStoreSchema = z.object({ version: z.literal(1), records: z.array(catalogFeedbackRecordSchema).max(10000) }).strict();
export type CatalogFeedbackRecord = z.infer<typeof catalogFeedbackRecordSchema>;
export async function readCatalogFeedback(file: string) { try { return catalogFeedbackStoreSchema.parse(JSON.parse(await readFile(path.resolve(file), 'utf8'))); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1 as const, records: [] }; throw error; } }
async function save(file: string, records: CatalogFeedbackRecord[]): Promise<void> { const target = path.resolve(file), temporary = `${target}.${randomUUID()}.tmp`; await mkdir(path.dirname(target), { recursive: true }); await writeFile(temporary, `${JSON.stringify(catalogFeedbackStoreSchema.parse({ version: 1, records }), null, 2)}\n`, { flag: 'wx' }); await rename(temporary, target); }
export async function recordCatalogFeedback(file: string, input: Omit<z.input<typeof catalogFeedbackRecordSchema>, 'id' | 'createdAt'>) { const store = await readCatalogFeedback(file), record = catalogFeedbackRecordSchema.parse({ ...input, id: randomUUID(), createdAt: new Date().toISOString() }); await save(file, [...store.records, record]); return record; }
export async function deleteCatalogFeedback(file: string, ids?: string[]) { const store = await readCatalogFeedback(file), selected = ids ? new Set(ids) : undefined, records = selected ? store.records.filter(record => !selected.has(record.id)) : []; await save(file, records); return { deleted: store.records.length - records.length, remaining: records.length }; }
/** Creates a caller-owned payload only when explicitly invoked; no network transport exists here. */
export async function exportCatalogFeedback(file: string, ids?: string[]) { const store = await readCatalogFeedback(file), selected = ids ? new Set(ids) : undefined; return { version: 1 as const, exportedAt: new Date().toISOString(), records: selected ? store.records.filter(record => selected.has(record.id)) : store.records }; }
