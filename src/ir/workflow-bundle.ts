import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { GENMOTION_VERSION } from '../version.js';
import { GenmotionError } from '../errors.js';
import { projectAssetReferences } from './asset-references.js';
import { productionBriefSchema } from './brief.js';
import { designSpecSchema } from './design-spec.js';
import { productionWorkflowSchema } from './production.js';
import { parameterSchema, parameterValueSchema, type GenmotionProject } from './schema.js';
import { resolveProjectAsset, type LoadedProject } from './loader.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const assetSchema = z.object({ path: z.string().min(1).max(2048), sha256, required: z.boolean().default(true) }).strict();
const acceptanceSchema = z.object({ id: z.string().min(1).max(200), kind: z.enum(['validation', 'render', 'visual', 'audio', 'custom']), description: z.string().min(1).max(4000), required: z.boolean().default(true) }).strict();
export const workflowBundleSchema = z.object({
  version: z.literal(1), id: sha256, engineVersion: z.string().min(1), createdAt: z.string().datetime(),
  brief: productionBriefSchema.nullable(), designSpec: designSpecSchema.nullable(), workflow: productionWorkflowSchema,
  parameters: z.array(parameterSchema).max(1000), parameterValues: z.record(z.string(), parameterValueSchema),
  assets: z.array(assetSchema).max(10000), acceptanceChecks: z.array(acceptanceSchema).max(1000),
}).strict();
export type WorkflowBundle = z.infer<typeof workflowBundleSchema>;
const workflowBundlePayloadSchema = workflowBundleSchema.omit({ id: true });
export const legacyWorkflowBundleSchema = workflowBundleSchema.omit({ id: true, engineVersion: true }).extend({ version: z.literal(0) }).strict();

function payloadIdentity(bundle: Omit<WorkflowBundle, 'id'>): string { return createHash('sha256').update(JSON.stringify(bundle)).digest('hex'); }
async function fileHash(file: string): Promise<string> { return createHash('sha256').update(await readFile(file)).digest('hex'); }

export async function createWorkflowBundle(loaded: LoadedProject, outputFile: string, acceptanceChecks: WorkflowBundle['acceptanceChecks'] = []): Promise<WorkflowBundle> {
  const workflow = loaded.sourceProject.productionWorkflow;
  if (!workflow) throw new GenmotionError('WORKFLOW_BUNDLE_MISSING_WORKFLOW', 'A reusable workflow bundle requires a production workflow.');
  const unapproved = workflow.shots.filter(shot => shot.review?.state !== 'approved').map(shot => shot.id);
  if (unapproved.length) throw new GenmotionError('WORKFLOW_BUNDLE_NOT_APPROVED', 'Every storyboard shot must have a current approval before freezing the workflow.', { shots: unapproved });
  const assets: WorkflowBundle['assets'] = [];
  for (const reference of projectAssetReferences(loaded.sourceProject).sort()) assets.push({ path: reference, sha256: await fileHash(resolveProjectAsset(loaded.projectDir, reference)), required: true });
  const payload = workflowBundlePayloadSchema.parse({ version: 1, engineVersion: GENMOTION_VERSION, createdAt: new Date().toISOString(), brief: loaded.sourceProject.productionBrief ?? null, designSpec: loaded.sourceProject.designSpec ?? null, workflow, parameters: loaded.sourceProject.parameters, parameterValues: loaded.sourceProject.parameterValues, assets, acceptanceChecks });
  const bundle = workflowBundleSchema.parse({ id: payloadIdentity(payload), ...payload });
  const target = path.resolve(outputFile), temporary = `${target}.${randomUUID()}.tmp`; await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx' }); await rename(temporary, target);
  return bundle;
}

export function migrateWorkflowBundle(input: unknown): { bundle: WorkflowBundle; migrations: string[] } {
  const version = z.object({ version: z.number().int() }).passthrough().parse(input).version;
  if (version === 1) { const bundle = workflowBundleSchema.parse(input), { id, ...payload } = bundle; if (id !== payloadIdentity(payload)) throw new GenmotionError('WORKFLOW_BUNDLE_ID_MISMATCH', 'Workflow bundle content no longer matches its immutable ID.'); return { bundle, migrations: [] }; }
  if (version === 0) { const legacy = legacyWorkflowBundleSchema.parse(input), payload = workflowBundlePayloadSchema.parse({ ...legacy, version: 1 as const, engineVersion: GENMOTION_VERSION }); return { bundle: workflowBundleSchema.parse({ id: payloadIdentity(payload), ...payload }), migrations: ['0->1: recorded engine compatibility and content identity'] }; }
  throw new GenmotionError('WORKFLOW_BUNDLE_VERSION_UNSUPPORTED', `Workflow bundle version ${version} is unsupported.`);
}

export async function openWorkflowBundle(inputFile: string, projectDirectory: string) {
  const { bundle, migrations } = migrateWorkflowBundle(JSON.parse(await readFile(path.resolve(inputFile), 'utf8')));
  const diagnostics: Array<{ code: string; severity: 'error' | 'warning'; path?: string; message: string }> = [];
  for (const asset of bundle.assets) {
    try { const file = resolveProjectAsset(projectDirectory, asset.path); if (!(await stat(file)).isFile()) throw new Error('not a file'); if (await fileHash(file) !== asset.sha256) diagnostics.push({ code: 'WORKFLOW_ASSET_IDENTITY_DRIFT', severity: 'error', path: asset.path, message: 'Dependency bytes differ from the approved workflow bundle.' }); }
    catch { diagnostics.push({ code: 'WORKFLOW_ASSET_MISSING', severity: asset.required ? 'error' : 'warning', path: asset.path, message: 'Workflow dependency is unavailable in the target project.' }); }
  }
  const expectedMajor = bundle.engineVersion.split('.')[0], actualMajor = GENMOTION_VERSION.split('.')[0];
  if (expectedMajor !== actualMajor) diagnostics.push({ code: 'WORKFLOW_ENGINE_INCOMPATIBLE', severity: 'error', message: `Bundle targets Genmotion ${bundle.engineVersion}; this engine is ${GENMOTION_VERSION}.` });
  return { version: 1 as const, bundle, migrations, diagnostics, ready: !diagnostics.some(item => item.severity === 'error') };
}

export function instantiateWorkflowBundle(project: GenmotionProject, bundle: WorkflowBundle): GenmotionProject {
  return {
    ...project, productionBrief: bundle.brief ?? undefined, designSpec: bundle.designSpec ?? undefined,
    productionWorkflow: { ...bundle.workflow, stages: [], shots: bundle.workflow.shots.map(shot => ({ ...shot, build: 'planned', review: undefined, comments: [] })) },
    parameters: structuredClone(bundle.parameters), parameterValues: structuredClone(bundle.parameterValues),
  };
}
