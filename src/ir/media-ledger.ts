import { z } from 'zod';
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
