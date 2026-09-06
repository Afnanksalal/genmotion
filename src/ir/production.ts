import { z } from 'zod';
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const text = z.string().max(20000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const workflowKindSchema = z.enum(['product-film', 'explainer', 'footage-edit', 'captions', 'music-film', 'motion-unit', 'presentation']);
export const productionStageSchema = z.enum(['sources', 'planning', 'authoring', 'verification', 'delivery']);
export const storyboardShotSchema = z.object({
  id, title: z.string().min(1).max(512), direction: text.default(''), narration: text.default(''),
  duration: z.number().finite().positive().max(86400),
  references: z.array(z.object({ path: z.string().min(1).max(2048), description: text.default(''), evidenceId: id.optional() }).strict()).max(128).default([]),
  sourceEvidenceIds: z.array(id).max(128).default([]),
  sceneId: id.optional(), layerIds: z.array(id).max(10000).default([]),
  build: z.enum(['planned', 'building', 'built']).default('planned'),
  review: z.object({ state: z.enum(['approved', 'changes-requested']), subjectHash: hash, reviewedRevision: hash, author: z.string().min(1).max(256), note: text, at: z.string().datetime() }).strict().optional(),
  comments: z.array(z.object({ id, author: z.string().min(1).max(256), body: z.string().min(1).max(20000), at: z.string().datetime(), resolved: z.boolean().default(false), frame: z.number().finite().nonnegative().optional(), revision: hash }).strict()).max(1000).default([]),
}).strict();
export const productionWorkflowSchema = z.object({
  version: z.literal(1), kind: workflowKindSchema,
  shots: z.array(storyboardShotSchema).max(10000).default([]),
  stages: z.array(z.object({ stage: productionStageSchema, inputHash: hash, completedAt: z.string().datetime(), evidence: z.array(z.object({ path: z.string().min(1).max(2048), sha256: hash }).strict()).max(256).default([]) }).strict()).max(5).default([]),
}).strict().refine((workflow) => new Set(workflow.shots.map((shot) => shot.id)).size === workflow.shots.length, 'Storyboard shot IDs must be unique')
  .refine((workflow) => new Set(workflow.stages.map((stage) => stage.stage)).size === workflow.stages.length, 'Production stages must be unique');
export type ProductionWorkflow = z.infer<typeof productionWorkflowSchema>;
export type StoryboardShot = z.infer<typeof storyboardShotSchema>;
export type ProductionStage = z.infer<typeof productionStageSchema>;

export const productionWorkflows: Record<ProductionWorkflow['kind'], { title: string; inputs: string[]; outputs: string[]; capabilities: string[] }> = {
  'product-film': { title: 'Product film', inputs: ['Production brief', 'Verified product evidence', 'Brand specification'], outputs: ['Evidence-linked storyboard', 'Native scenes', 'Master and review frames'], capabilities: ['evidence-ingestion', 'text', 'compositions', 'video', 'audio', 'render'] },
  explainer: { title: 'Explainer', inputs: ['Message and audience', 'Verified script', 'Source evidence'], outputs: ['Narrated storyboard', 'Diagram and text scenes', 'Master and captions'], capabilities: ['text', 'paths', 'compositions', 'audio', 'captions', 'render'] },
  'footage-edit': { title: 'Existing footage edit', inputs: ['Frozen footage', 'Source time ranges', 'Editorial brief'], outputs: ['Source-aware edit', 'Audio mix', 'Master'], capabilities: ['video', 'source-trim', 'audio', 'transitions', 'render'] },
  captions: { title: 'Caption production', inputs: ['Source audio or video', 'Reviewed timed transcript', 'Language and style'], outputs: ['Caption IR', 'Readable caption review', 'Captioned master'], capabilities: ['captions', 'text', 'video', 'render'] },
  'music-film': { title: 'Music-driven film', inputs: ['Licensed soundtrack and range', 'Reviewed beat/phrase plan', 'Visual brief'], outputs: ['Music-aligned storyboard', 'Native scenes and soundtrack', 'Master'], capabilities: ['audio', 'beat-analysis', 'animation', 'render'] },
  'motion-unit': { title: 'Short motion unit', inputs: ['Message', 'Dimensions and duration', 'Brand assets'], outputs: ['Native reusable composition', 'Preview frames', 'Master'], capabilities: ['text', 'paths', 'animation', 'render'] },
  presentation: { title: 'Presentation', inputs: ['Audience and narrative', 'Slide outline', 'Verified content'], outputs: ['Shot-per-slide storyboard', 'Native scenes', 'Playback and exports'], capabilities: ['text', 'compositions', 'player', 'render'] },
};
