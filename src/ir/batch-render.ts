import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { importParameterVariants, type ParameterVariant } from './variants.js';
import { parameterValueSchema, variantSchema, type GenmotionProject } from './schema.js';
import { resolveParameters } from './parameters.js';

const batchRowSchema = z.object({ id: z.string().min(1).max(128).optional(), outputName: z.string().min(1).max(180).optional(), values: z.record(z.string(), parameterValueSchema) }).strict();
const batchReceiptSchema = z.object({ id: z.string(), identity: z.string(), outputName: z.string(), state: z.enum(['accepted', 'failed', 'skipped']), startedAt: z.string().optional(), completedAt: z.string(), error: z.string().optional() }).strict();
export const batchOptionsSchema = z.object({ concurrency: z.number().int().min(1).max(32).default(2), retry: z.enum(['failed', 'all']).default('failed') }).strict();
export interface BatchRow { id: string; outputName: string; values: Record<string, z.infer<typeof parameterValueSchema>>; identity: string }
export interface BatchReceipt { id: string; identity: string; outputName: string; state: 'accepted' | 'failed' | 'skipped'; startedAt?: string | undefined; completedAt: string; error?: string | undefined }

function safeName(value: string): string { const result = [...value.trim()].map(character => /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32 ? '-' : character).join('').replace(/[. ]+$/g, '').slice(0, 180); if (!result || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) throw new Error(`Invalid portable output name: ${value}`); return result; }
function identity(values: unknown): string { return createHash('sha256').update(JSON.stringify(values)).digest('hex'); }
function isUnknownArray(value: unknown): value is unknown[] { return Array.isArray(value); }
function parseUnknownJson(value: string): unknown { return JSON.parse(value) as unknown; }
export function parseBatchRows(project: GenmotionProject, content: string, format: 'json' | 'jsonl' | 'csv', limit = 10000): BatchRow[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('Batch row limit must be between 1 and 10000.');
  let raw: Array<z.input<typeof batchRowSchema>>;
  if (format === 'csv') raw = importParameterVariants(project, content, 'csv', limit).map(row => ({ id: row.id, outputName: row.id, values: row.values }));
  else if (format === 'jsonl') raw = content.split(/\r?\n/).filter(line => line.trim()).map((line, index) => { try { return batchRowSchema.parse(JSON.parse(line)); } catch (error) { throw new Error(`JSONL row ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); } });
  else raw = z.array(batchRowSchema).max(limit).parse(JSON.parse(content));
  if (raw.length > limit) throw new Error(`Batch exceeds ${limit} rows.`);
  const rows = raw.map(item => { const parsed = batchRowSchema.parse(item), hash = identity(parsed.values), id = parsed.id ?? `row-${hash.slice(0, 12)}`; resolveParameters(project, parsed.values); return { id, outputName: safeName(parsed.outputName ?? id), values: parsed.values, identity: hash }; });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Batch row IDs must be unique.'); if (new Set(rows.map(row => row.outputName.toLowerCase())).size !== rows.length) throw new Error('Batch output names must be unique.'); return rows;
}

export async function executeBatch(project: GenmotionProject, rows: BatchRow[], stateFile: string, executor: (project: GenmotionProject, row: BatchRow) => Promise<void>, rawOptions: z.input<typeof batchOptionsSchema> = {}, onProgress?: (progress: { completed: number; total: number; receipt: BatchReceipt }) => void) {
  const options = batchOptionsSchema.parse(rawOptions), target = path.resolve(stateFile); await mkdir(path.dirname(target), { recursive: true }); let previous: BatchReceipt[] = [];
  try { const serialized = parseUnknownJson(await readFile(target, 'utf8')); if (!isUnknownArray(serialized)) throw new Error('Batch state must be an array'); previous = serialized.map((value): BatchReceipt => { const item = batchReceiptSchema.parse(value); return { id: item.id, identity: item.identity, outputName: item.outputName, state: item.state, completedAt: item.completedAt, ...(item.startedAt ? { startedAt: item.startedAt } : {}), ...(item.error ? { error: item.error } : {}) }; }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const prior = new Map(previous.map(receipt => [receipt.id, receipt])), receipts: BatchReceipt[] = []; let cursor = 0, completed = 0, saveQueue = Promise.resolve();
  const save = (): Promise<void> => { saveQueue = saveQueue.then(async () => { const temporary = `${target}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(receipts.filter(Boolean), null, 2)}\n`, { flag: 'wx' }); await rename(temporary, target); }); return saveQueue; };
  const worker = async (): Promise<void> => { for (;;) { const index = cursor++; if (index >= rows.length) return; const row = rows[index]!, accepted = prior.get(row.id); let receipt: BatchReceipt;
      if (options.retry === 'failed' && accepted?.state === 'accepted' && accepted.identity === row.identity && accepted.outputName === row.outputName) receipt = { ...accepted, state: 'skipped', completedAt: new Date().toISOString() };
      else { const startedAt = new Date().toISOString(); try { await executor(resolveParameters(project, row.values), row); receipt = { id: row.id, identity: row.identity, outputName: row.outputName, state: 'accepted', startedAt, completedAt: new Date().toISOString() }; } catch (error) { receipt = { id: row.id, identity: row.identity, outputName: row.outputName, state: 'failed', startedAt, completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }; } }
      receipts[index] = receipt; completed++; await save(); onProgress?.({ completed, total: rows.length, receipt });
    } };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, rows.length) }, worker)); return { version: 1 as const, rows: receipts, accepted: receipts.filter(item => item.state === 'accepted').length, failed: receipts.filter(item => item.state === 'failed').length, skipped: receipts.filter(item => item.state === 'skipped').length };
}

export function batchRowsAsVariants(rows: BatchRow[]): ParameterVariant[] { return rows.map(row => variantSchema.parse({ id: row.id, label: row.outputName, values: row.values })); }
