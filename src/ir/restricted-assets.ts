import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const restrictedAssetAcceptanceSchema = z.object({ id: z.string().min(1).max(200), assetRole: z.enum(['font', 'logo', 'image', 'video', 'audio', 'other']), expectedSha256: hash, termsUrl: z.string().url(), termsVersion: z.string().min(1).max(200), actor: z.string().min(1).max(300), acceptedAt: z.string().datetime(), sourceUrl: z.string().url() }).strict();
export const restrictedAssetAcceptancesSchema = z.array(restrictedAssetAcceptanceSchema).max(1000).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Restricted asset acceptance IDs must be unique');
export type RestrictedAssetAcceptance = z.infer<typeof restrictedAssetAcceptanceSchema>;
export function recordRestrictedAssetAcceptance(input: Omit<RestrictedAssetAcceptance, 'acceptedAt'> & { acceptedAt?: string }): RestrictedAssetAcceptance { return restrictedAssetAcceptanceSchema.parse({ ...input, acceptedAt: input.acceptedAt ?? new Date().toISOString() }); }
export async function acquireRestrictedAsset(acceptance: RestrictedAssetAcceptance, destination: string, downloader: (sourceUrl: string, temporaryFile: string, signal?: AbortSignal) => Promise<void>, signal?: AbortSignal) {
  const record = restrictedAssetAcceptanceSchema.parse(acceptance), target = path.resolve(destination), temporary = `${target}.${randomUUID()}.tmp`; await mkdir(path.dirname(target), { recursive: true });
  try { await downloader(record.sourceUrl, temporary, signal); const actualSha256 = createHash('sha256').update(await readFile(temporary)).digest('hex'); if (actualSha256 !== record.expectedSha256) throw new Error('Restricted asset bytes differ from the hash-bound acceptance; substitution refused'); await rename(temporary, target); return { path: target, sha256: actualSha256, acceptanceId: record.id, termsUrl: record.termsUrl, termsVersion: record.termsVersion }; }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}
