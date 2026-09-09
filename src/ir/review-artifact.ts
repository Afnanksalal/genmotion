import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const frameSchema = z.object({ time: z.number().finite().nonnegative(), sha256: sha, path: z.string().min(1) }).strict();
export const reviewArtifactSchema = z.object({
  version: z.literal(1), sourceRevision: z.string().min(1), sourceHash: sha, dependencyHash: sha, createdAt: z.string().datetime(),
  checkReport: z.object({ sourceHash: sha }).passthrough(), representativeFrames: z.array(frameSchema).max(1000),
  comparedVariants: z.array(z.object({ id: z.string().min(1), valuesHash: sha, frames: z.array(frameSchema).max(1000), status: z.enum(['complete', 'failed', 'truncated']), reason: z.string().optional() }).strict()).max(1000),
  audioFindings: z.array(z.object({ code: z.string().min(1), severity: z.enum(['info', 'warning', 'error']), message: z.string().min(1), sourceHash: sha.optional() }).strict()).max(1000),
  unresolvedDecisions: z.array(z.object({ id: z.string().min(1), question: z.string().min(1), target: z.string().optional() }).strict()).max(1000),
}).strict().superRefine((value, context) => { if (value.checkReport.sourceHash !== value.sourceHash) context.addIssue({ code: 'custom', message: 'Check report source hash must match the review artifact', path: ['checkReport', 'sourceHash'] }); });
export type ReviewArtifact = z.infer<typeof reviewArtifactSchema>;

export function createReviewArtifact(input: Omit<ReviewArtifact, 'version' | 'createdAt'> & { createdAt?: string }): ReviewArtifact { return reviewArtifactSchema.parse({ version: 1, createdAt: input.createdAt ?? new Date().toISOString(), ...input }); }
export function reviewValuesHash(values: Record<string, unknown>): string { return createHash('sha256').update(JSON.stringify(values)).digest('hex'); }
export function invalidateReviewArtifact(artifact: ReviewArtifact, current: { sourceHash: string; dependencyHash: string }) {
  const sourceChanged = artifact.sourceHash !== current.sourceHash, dependenciesChanged = artifact.dependencyHash !== current.dependencyHash;
  const invalidated = [
    ...(sourceChanged ? ['checkReport', 'representativeFrames', 'comparedVariants'] : []),
    ...(sourceChanged || dependenciesChanged ? ['audioFindings'] : []),
    ...(dependenciesChanged ? ['representativeFrames', 'comparedVariants'] : []),
  ];
  return { valid: !sourceChanged && !dependenciesChanged, sourceChanged, dependenciesChanged, invalidated: [...new Set(invalidated)], unresolvedDecisionsRetained: artifact.unresolvedDecisions.length };
}
