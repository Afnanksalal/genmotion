import { z } from 'zod';

const origin = z.enum(['user', 'inferred']);
const textDecision = z.object({ value: z.string().trim().min(1).max(10000), origin, rationale: z.string().max(10000).optional() }).strict();
export const productionBriefSchema = z.object({
  version: z.literal(1),
  destination: textDecision.optional(),
  aspect: z.object({ value: z.tuple([z.number().int().min(1).max(8192), z.number().int().min(1).max(8192)]), origin, rationale: z.string().max(10000).optional() }).strict().optional(),
  language: textDecision.optional(), audience: textDecision.optional(), message: textDecision.optional(),
  duration: z.object({ value: z.number().finite().positive().max(86400), origin, rationale: z.string().max(10000).optional() }).strict().optional(),
  sourceRequirements: z.array(z.object({ id: z.string().min(1).max(128), kind: z.enum(['image', 'video', 'audio', 'voice', 'logo', 'font', 'data', 'reference', 'other']), description: z.string().trim().min(1).max(10000), required: z.boolean().default(true), origin, status: z.enum(['open', 'available', 'waived']).default('open'), evidence: z.string().max(10000).optional() }).strict()).max(256).default([]),
}).strict().refine((brief) => new Set(brief.sourceRequirements.map((item) => item.id)).size === brief.sourceRequirements.length, 'Source requirement IDs must be unique')
  .refine((brief) => JSON.stringify(brief).length <= 32768, 'Production brief exceeds the 32768-character context limit');
export type ProductionBrief = z.infer<typeof productionBriefSchema>;
const fields = ['destination', 'aspect', 'language', 'audience', 'message', 'duration'] as const;

export function resumeProductionBrief(input?: ProductionBrief) {
  const brief = input ? productionBriefSchema.parse(input) : undefined;
  return {
    version: 1 as const,
    resolved: fields.filter((field) => brief?.[field] !== undefined),
    missing: fields.filter((field) => brief?.[field] === undefined),
    userStated: fields.filter((field) => brief?.[field]?.origin === 'user'),
    inferred: fields.filter((field) => brief?.[field]?.origin === 'inferred'),
    openRequiredSources: brief?.sourceRequirements.filter((item) => item.required && item.status === 'open').map((item) => item.id) ?? [],
    brief: brief ?? null,
  };
}
