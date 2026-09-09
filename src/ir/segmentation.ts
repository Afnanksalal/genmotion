import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const artifactSchema = z.object({ role: z.enum(['foreground', 'inverse-alpha']), path: z.string().min(1), sha256: hash, format: z.enum(['png', 'webm', 'prores']) }).strict();
export const segmentationResultSchema = z.object({ version: z.literal(1), id: z.string().min(1), sourceHash: hash, provider: z.string().min(1), model: z.string().min(1), settings: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()])), createdAt: z.string().datetime(), artifacts: z.array(artifactSchema).length(2), qa: z.object({ edgeError: z.number().finite().min(0).max(1), temporalInstability: z.number().finite().min(0).max(1).nullable(), passed: z.boolean(), notes: z.array(z.string()).default([]) }).strict(), inverseAlphaMeaning: z.literal('inverse opacity matte; not an inpainted background') }).strict();
export interface SegmentationProvider { id: string; segment(source: string, options: { model: string; settings: Record<string, string | number | boolean | null>; kind: 'image' | 'video' }, signal?: AbortSignal): Promise<{ foreground: string; inverseAlpha: string; edgeError: number; temporalInstability?: number; notes?: string[] }> }
async function digest(file: string): Promise<string> { return createHash('sha256').update(await readFile(file)).digest('hex'); }

export async function prepareSegmentation(source: string, outputDirectory: string, provider: SegmentationProvider, options: { model: string; settings?: Record<string, string | number | boolean | null>; kind: 'image' | 'video'; edgeThreshold?: number; temporalThreshold?: number }, signal?: AbortSignal) {
  const sourceFile = path.resolve(source), output = path.resolve(outputDirectory), settings = options.settings ?? {}, raw = await provider.segment(sourceFile, { model: options.model, settings, kind: options.kind }, signal); await mkdir(output, { recursive: true });
  const format = options.kind === 'image' ? 'png' as const : path.extname(raw.foreground).toLowerCase() === '.mov' ? 'prores' as const : 'webm' as const, foreground = path.join(output, `foreground.${format === 'prores' ? 'mov' : format}`), inverseAlpha = path.join(output, `inverse-alpha.${format === 'prores' ? 'mov' : format}`); await copyFile(raw.foreground, foreground); await copyFile(raw.inverseAlpha, inverseAlpha);
  const edgeThreshold = z.number().finite().min(0).max(1).parse(options.edgeThreshold ?? .15), temporalThreshold = z.number().finite().min(0).max(1).parse(options.temporalThreshold ?? .2), temporal = raw.temporalInstability ?? null;
  const result = segmentationResultSchema.parse({ version: 1, id: randomUUID(), sourceHash: await digest(sourceFile), provider: provider.id, model: options.model, settings, createdAt: new Date().toISOString(), artifacts: [{ role: 'foreground', path: foreground, sha256: await digest(foreground), format }, { role: 'inverse-alpha', path: inverseAlpha, sha256: await digest(inverseAlpha), format }], qa: { edgeError: raw.edgeError, temporalInstability: temporal, passed: raw.edgeError <= edgeThreshold && (temporal === null || temporal <= temporalThreshold), notes: raw.notes ?? [] }, inverseAlphaMeaning: 'inverse opacity matte; not an inpainted background' });
  for (const artifact of result.artifacts) if (!(await stat(artifact.path)).isFile()) throw new Error('Segmentation output is unavailable'); return result;
}
export async function segmentationIsCurrent(result: z.infer<typeof segmentationResultSchema>, source: string): Promise<boolean> { return result.sourceHash === await digest(path.resolve(source)); }
