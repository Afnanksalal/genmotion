import { z } from 'zod';

export const briefSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  mode: z.enum(['walkthrough', 'launch', 'pitch', 'explainer']),
  audience: z.string().min(1),
  promise: z.string().min(1),
  proof: z.array(z.string().min(1)).min(1),
  desiredAction: z.string().min(1),
  duration: z.number().positive().max(600),
  energy: z.enum(['restrained', 'balanced', 'energetic', 'cinematic']),
  brand: z.object({
    background: z.string().min(1),
    foreground: z.string().min(1),
    accent: z.string().min(1),
    muted: z.string().min(1),
    primaryFont: z.string().min(1),
    displayFont: z.string().min(1),
    tone: z.array(z.string()).min(1),
  }),
  requiredScenes: z.array(z.string()).default([]),
  forbiddenClaims: z.array(z.string()).default([]),
  assets: z.array(z.object({ id: z.string().min(1), path: z.string().min(1), role: z.string().min(1), provenance: z.string().min(1) })).default([]),
});

export const conceptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  thesis: z.string().min(1),
  blueprintId: z.string().min(1),
  referenceIds: z.array(z.string()).min(2),
  borrow: z.array(z.string()).min(1),
  avoid: z.array(z.string()).min(1),
  transform: z.array(z.string()).min(1),
  sceneDirections: z.array(z.object({
    purpose: z.string().min(1),
    composition: z.string().min(1),
    motion: z.array(z.string()).min(1),
    holdSeconds: z.number().nonnegative(),
  })).min(1),
  negativeConstraints: z.array(z.string()).min(1),
});

export type CreativeBrief = z.infer<typeof briefSchema>;
export type CreativeConcept = z.infer<typeof conceptSchema>;

export interface ScoredConcept {
  concept: CreativeConcept;
  score: number;
  scores: {
    coherence: number;
    originality: number;
    feasibility: number;
    hierarchy: number;
    brandFit: number;
  };
  findings: string[];
}
