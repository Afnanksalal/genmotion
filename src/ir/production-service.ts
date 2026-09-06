import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { LoadedProject } from './loader.js';
import { resolveProjectAsset } from './loader.js';
import { commitProject, readProjectSnapshot } from './store.js';
import { productionStageSchema, productionWorkflowSchema, productionWorkflows, storyboardShotSchema, workflowKindSchema, type ProductionStage, type StoryboardShot } from './production.js';
import { throwIfAborted } from '../engine/process.js';
import { GenmotionError } from '../errors.js';

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function hashFile(projectDir: string, name: string, signal?: AbortSignal): Promise<string> {
  const file = resolveProjectAsset(projectDir, name), before = await stat(file);
  if (!before.isFile() || before.size > 32 * 1024 ** 3) throw new Error('Production evidence must be a file smaller than 32 GiB');
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file, signal ? { signal } : {})) { throwIfAborted(signal); const data = chunk as Buffer; bytes += data.length; if (bytes > 32 * 1024 ** 3) throw new Error('Production source exceeded its byte budget'); hash.update(data); }
  const after = await stat(file);
  if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino) throw new Error(`Source changed while hashing: ${name}`);
  return hash.digest('hex');
}
function shotPlan(shot: StoryboardShot) {
  return { id: shot.id, title: shot.title, direction: shot.direction, narration: shot.narration, duration: shot.duration, references: shot.references, sourceEvidenceIds: shot.sourceEvidenceIds };
}
const stageOrder = productionStageSchema.options;
export async function inspectProduction(loaded: LoadedProject, signal?: AbortSignal) {
  const project = loaded.sourceProject, workflow = project.productionWorkflow;
  const references = new Set<string>(project.brand.fonts.map((font) => font.file));
  for (const track of project.audio) references.add(track.src);
  for (const container of [...project.scenes, ...project.compositions]) for (const layer of container.layers) {
    if (layer.type === 'image' || layer.type === 'video') references.add(layer.src);
    if (layer.type === 'image' && layer.sourceAnimation?.type === 'sequence') for (const frame of layer.sourceAnimation.frames) references.add(frame);
    if ((layer.type === 'text' || layer.type === 'caption') && layer.fontFile) references.add(layer.fontFile);
  }
  for (const container of [...project.scenes, ...project.compositions]) for (const effect of [...(container.effects ?? []), ...container.layers.flatMap((layer) => layer.effects ?? [])]) if (effect.lut?.source) references.add(effect.lut.source.path);
  for (const dependency of loaded.parameterDependencies ?? []) references.add(dependency.path);
  for (const shot of workflow?.shots ?? []) for (const reference of shot.references) references.add(reference.path);
  if (references.size > 10000) throw new Error('Production inspection exceeds 10000 sources');
  const assets: Array<{ path: string; sha256?: string; error?: string }> = [];
  for (const name of [...references].sort()) {
    throwIfAborted(signal);
    try { assets.push({ path: name, sha256: await hashFile(loaded.projectDir, name, signal) }); }
    catch (error) { throwIfAborted(signal); assets.push({ path: name, error: error instanceof Error ? error.message : String(error) }); }
  }
  const nativeDocument = { ...project }; delete nativeDocument.productionBrief; delete nativeDocument.productionWorkflow;
  const native = digest(nativeDocument);
  const fingerprints = { brief: digest({ brief: project.productionBrief ?? null, kind: workflow?.kind }), assets: digest(assets), storyboard: digest(workflow?.shots.map(shotPlan) ?? []), builds: digest(workflow?.shots.map((shot) => ({ id: shot.id, sceneId: shot.sceneId, layerIds: shot.layerIds, build: shot.build })) ?? []), native };
  const shots = (workflow?.shots ?? []).map((shot) => {
    const scene = project.scenes.find((candidate) => candidate.id === shot.sceneId);
    const missingLayers = shot.layerIds.filter((id) => !scene?.layers.some((layer) => layer.id === id));
    const subjectHash = digest({ plan: shotPlan(shot), layerIds: shot.layerIds, scene: scene ?? null, compositions: project.compositions, assets: fingerprints.assets, brand: project.brand, parameters: project.parameterValues, seed: project.seed, width: project.width, height: project.height, fps: project.fps, anchors: project.anchors });
    let start = 0; for (const candidate of project.scenes) { if (candidate.id === shot.sceneId) break; start += candidate.duration; }
    return { id: shot.id, subjectHash, build: shot.build === 'built' && (!scene || missingLayers.length) ? 'invalid' : shot.build, missingLayers, review: !shot.review ? 'unreviewed' : shot.review.subjectHash !== subjectHash ? 'stale' : shot.review.state, unresolvedComments: shot.comments.filter((comment) => !comment.resolved).length, frame: scene ? Math.round(start * project.fps) : null };
  });
  const stages: Array<{ stage: ProductionStage; inputHash: string; state: 'pending' | 'complete' | 'stale' | 'blocked'; reasons: string[] }> = [];
  for (const stage of stageOrder) {
    const index = stageOrder.indexOf(stage), previous = stages[index - 1];
    const inputHash = digest({ brief: fingerprints.brief, assets: fingerprints.assets, ...(index >= 1 ? { storyboard: fingerprints.storyboard } : {}), ...(index >= 2 ? { native, builds: fingerprints.builds } : {}), ...(index >= 3 ? { reviews: shots.map((shot) => ({ id: shot.id, review: shot.review, comments: shot.unresolvedComments })) } : {}) });
    const record = workflow?.stages.find((candidate) => candidate.stage === stage), reasons: string[] = [];
    if (!workflow) reasons.push('Choose a production workflow');
    if (assets.some((asset) => asset.error)) reasons.push('Source files are missing or changed during inspection');
    if (project.productionBrief?.sourceRequirements.some((source) => source.required && source.status === 'open')) reasons.push('Required sources remain unresolved');
    if (previous && previous.state !== 'complete') reasons.push(`Complete ${previous.stage} first`);
    if (index >= 1 && !shots.length) reasons.push('Plan at least one storyboard shot');
    if (index >= 2 && shots.some((shot) => shot.build !== 'built')) reasons.push('Build every shot and link it to valid native scene/layer IDs');
    if (index >= 3 && shots.some((shot) => shot.review !== 'approved' || shot.unresolvedComments)) reasons.push('Resolve feedback and approve the current version of every shot');
    let evidenceValid = true;
    if (record) for (const evidence of record.evidence) { try { if (await hashFile(loaded.projectDir, evidence.path, signal) !== evidence.sha256) evidenceValid = false; } catch { throwIfAborted(signal); evidenceValid = false; } }
    stages.push({ stage, inputHash, state: reasons.length ? 'blocked' : record ? record.inputHash === inputHash && evidenceValid ? 'complete' : 'stale' : 'pending', reasons: !evidenceValid ? [...reasons, 'Stage evidence changed or is missing'] : reasons });
  }
  const available = new Set(['text', 'paths', 'compositions', 'video', 'audio', 'render', 'captions', 'source-trim', 'transitions', 'animation', 'player', 'beat-analysis']);
  return { version: 1 as const, workflow: workflow?.kind ?? null, definition: workflow ? productionWorkflows[workflow.kind] : null, capabilities: workflow ? productionWorkflows[workflow.kind].capabilities.map((name) => ({ name, available: available.has(name) })) : [], fingerprints, assets, shots, stages };
}

export const productionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('configure'), kind: workflowKindSchema }).strict(),
  z.object({ action: z.literal('shot'), shot: storyboardShotSchema }).strict(),
  z.object({ action: z.literal('remove-shot'), shotId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('review'), shotId: z.string().min(1), state: z.enum(['approved', 'changes-requested']), author: z.string().min(1).max(256), note: z.string().max(20000).default('') }).strict(),
  z.object({ action: z.literal('comment'), shotId: z.string().min(1), author: z.string().min(1).max(256), body: z.string().min(1).max(20000), frame: z.number().finite().nonnegative().optional() }).strict(),
  z.object({ action: z.literal('resolve-comment'), shotId: z.string().min(1), commentId: z.string().min(1), resolved: z.boolean() }).strict(),
  z.object({ action: z.literal('complete-stage'), stage: productionStageSchema, evidence: z.array(z.string().min(1)).max(256).default([]) }).strict(),
  z.object({ action: z.literal('reset-stage'), stage: productionStageSchema }).strict(),
]);

export async function commitProductionAction(input: string, expectedRevision: string, raw: z.input<typeof productionActionSchema>, signal?: AbortSignal) {
  const action = productionActionSchema.parse(raw), before = await readProjectSnapshot(input);
  if (before.revision !== expectedRevision) throw new GenmotionError('REVISION_CONFLICT', 'Production workflow requires the current file revision');
  const state = await inspectProduction(before, signal), now = new Date().toISOString();
  const evidence: Array<{ path: string; sha256: string }> = [];
  if (action.action === 'complete-stage') {
    const stage = state.stages.find((candidate) => candidate.stage === action.stage)!;
    if (stage.state === 'blocked') throw new GenmotionError('PRODUCTION_STAGE_BLOCKED', stage.reasons.join('; '));
    if (['verification', 'delivery'].includes(action.stage) && !action.evidence.length) throw new GenmotionError('PRODUCTION_EVIDENCE_REQUIRED', 'Verification and delivery require local evidence artifacts');
    for (const name of action.evidence) evidence.push({ path: name, sha256: await hashFile(before.projectDir, name, signal) });
    if (action.stage === 'verification') {
      const reportPath = action.evidence[0]!, file = resolveProjectAsset(before.projectDir, reportPath);
      if ((await stat(file)).size > 1024 ** 2) throw new Error('Verification report exceeds 1 MiB');
      const report = z.object({ version: z.literal(1), nativeHash: z.literal(state.fingerprints.native), assetsHash: z.literal(state.fingerprints.assets), passed: z.literal(true), checks: z.array(z.object({ name: z.string().min(1), passed: z.literal(true) })).min(1) }).parse(JSON.parse(await readFile(file, 'utf8')));
      if (!report.passed) throw new Error('Verification did not pass');
    }
  }
  return commitProject(input, { expectedRevision, ...(signal ? { signal } : {}), origin: 'production', update: (project) => {
    if (action.action === 'configure') { project.productionWorkflow = productionWorkflowSchema.parse({ ...(project.productionWorkflow ?? {}), version: 1, kind: action.kind }); return project; }
    const workflow = project.productionWorkflow; if (!workflow) throw new Error('Choose a production workflow first');
    if (action.action === 'shot') {
      const index = workflow.shots.findIndex((shot) => shot.id === action.shot.id);
      const shot = { ...action.shot }; delete shot.review;
      if (index < 0) workflow.shots.push(shot); else { const previous = workflow.shots[index]!; workflow.shots[index] = { ...shot, comments: previous.comments, ...(previous.review ? { review: previous.review } : {}) }; }
    } else if (action.action === 'remove-shot') workflow.shots = workflow.shots.filter((shot) => shot.id !== action.shotId);
    else if (action.action === 'complete-stage') { workflow.stages = workflow.stages.filter((stage) => stage.stage !== action.stage); workflow.stages.push({ stage: action.stage, inputHash: state.stages.find((stage) => stage.stage === action.stage)!.inputHash, completedAt: now, evidence }); }
    else if (action.action === 'reset-stage') workflow.stages = workflow.stages.filter((stage) => stageOrder.indexOf(stage.stage) < stageOrder.indexOf(action.stage));
    else {
      const shot = workflow.shots.find((candidate) => candidate.id === action.shotId); if (!shot) throw new Error('Unknown storyboard shot');
      if (action.action === 'review') {
        const current = state.shots.find((candidate) => candidate.id === shot.id)!;
        if (action.state === 'approved' && (current.build !== 'built' || current.unresolvedComments)) throw new Error('Approval requires a built shot with resolved comments');
        shot.review = { state: action.state, subjectHash: current.subjectHash, reviewedRevision: expectedRevision, author: action.author, note: action.note, at: now };
      } else if (action.action === 'comment') shot.comments.push({ id: 'comment-' + randomUUID(), author: action.author, body: action.body, at: now, resolved: false, revision: expectedRevision, ...(action.frame !== undefined ? { frame: action.frame } : {}) });
      else { const comment = shot.comments.find((candidate) => candidate.id === action.commentId); if (!comment) throw new Error('Unknown storyboard comment'); comment.resolved = action.resolved; }
    }
    return project;
  } });
}
