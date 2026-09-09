#!/usr/bin/env node
import { alphaModeSchema } from './engine/alpha-output.js';
import { renderFrameRangeSchema, renderGroupSchema } from './ir/render-selection.js';
import { frozenDataImportSchema, importFrozenData } from './ir/data-sources.js';
import { resolveRenderView } from './engine/render-view.js';
import { projectForRenderComposition } from './engine/render-projection.js';
import { readFrozenDataFile } from './ir/data-import-file.js';
import { authoringSchemaKindSchema, describeAuthoringSchema } from './ir/authoring-schema.js';
import { conformMedia, mediaConformPlan, mediaConformOptionsSchema } from './engine/media-conform.js';
import { inspectMedia } from './engine/media-probe.js';
import { captionCueSchema } from './ir/schema.js';
import { editCaptions, captionEditSchema } from './ir/caption-editing.js';
import { createCaptionDeliveryPlan, captionDeliveryOptionsSchema } from './ir/caption-delivery.js';
import { planMusicWorkflow, musicWorkflowOptionsSchema, lyricCueSchema } from './ir/music-workflow.js';
import { frozenAudioFeaturesSchema } from './engine/audio-intelligence.js';
import { planPresentationExport, presentationExportPolicySchema, presentationManifestSchema, validatePresentationManifest } from './ir/presentation.js';
import { analyzeAudioFile, audioAnalysisOptionsSchema } from './engine/audio-analysis.js';
import { globalMarkerTime, timelineMarkersSchema, timelineRangesSchema } from './ir/markers.js';
import { importCubeLut } from './ir/lut-import.js';
import { readFile, stat } from 'node:fs/promises';
import { lookupTableSchema } from './ir/lut.js';
import { visualEffectCapabilities, estimateEffectStack } from './engine/effects.js';
import { visualEffectTypeSchema, visualEffectsSchema } from './ir/schema.js';
import { inspectProduction, commitProductionAction, productionActionSchema } from './ir/production-service.js';
import { createProjectBundle, restoreProjectBundle, verifyProjectBundle } from './ir/bundle.js';
import { productionBriefSchema, resumeProductionBrief } from './ir/brief.js';
import { measureProjectText, textMeasureAddressSchema } from './engine/text-measure.js';
import { analyzeTrack, trackAnalysisOptionsSchema } from './engine/kinematics.js';
import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { auditCatalog } from './catalog/audit.js';
import { describeCatalogItem, searchCatalog } from './commands/catalog.js';
import { doctor } from './commands/doctor.js';
import { initializeProject } from './commands/init.js';
import { renderFramePng } from './engine/draw.js';
import { makeContactSheet, probeVideo } from './engine/probe.js';
import { startPreview, type PreviewServer } from './engine/preview.js';
import { renderProject } from './engine/render.js';
import { GenmotionError } from './errors.js';
import { loadProject } from './ir/loader.js';
import { animationTrackSchema, easingSchema, parameterValueSchema, projectSchema } from './ir/schema.js';
import { applyPatch, patchOperationSchema } from './ir/patch.js';
import { commitProject, readProjectSnapshot } from './ir/store.js';
import { canApplySemanticEdit, commitSemanticEdits, editTargetSchema, inspectEditTarget, semanticEditSchema } from './ir/edit.js';
import { EditingSession, filesystemEditingAdapter, editingCommandSchema, editingCheckpointSchema, executeEditingCommand } from './ir/session.js';
import { executeStudioCommand, studioBridgeCommandSchema } from './studio/bridge.js';
import { hasErrors, summarizeProject, validateProject } from './ir/validate.js';
import { createRenderPlan, renderPlanOptionsSchema } from './ir/render-plan.js';
import { checkReportOptionsSchema, createCheckReport } from './ir/check-report.js';
import { outputCompatibilityInputSchema, outputCompatibilityMatrix, resolveOutputCompatibility } from './engine/output-compatibility.js';
import { evaluateTrack } from './engine/animation.js';
import { layerIsActive, locateScene } from './engine/timeline.js';
import { getStudioRequests, resolveStudioRequest, startStudio, type StudioServer } from './studio/server.js';
import { GENMOTION_VERSION } from './version.js';
import { parseCaptions, serializeCaptions } from './captions.js';
import { flattenPath, normalizePath, pathMetrics, samplePath } from './engine/path.js';
import type { ParameterValue } from './ir/parameters.js';
import { expandParameterMatrix, exportParameterVariants, importParameterVariants, parameterMatrixSchema } from './ir/variants.js';
import { commitEasing, copyEasing, easingAddressSchema } from './ir/easing-edits.js';
import { applyPathOperations } from './engine/path-operations.js';
import { pathOperationsSchema } from './ir/path-operations.js';
import { renderAudio, measureProjectAudio } from './engine/audio.js';
import { measureAudioFile } from './engine/loudness.js';
import { compositionDependencyGraph, compositionUses } from './ir/compositions.js';
import { analyzeSpring, easingPresets } from './engine/easing.js';
import { fractalNoise, noiseND, seededRandom, staggerSchedule, staggerWindows } from './engine/procedural.js';
import { effectiveLayerStart, layerDependencyGraph, resolveLayerGraph } from './engine/constraints.js';

/** Keep repeated IR definitions as local JSON Schema references on the MCP wire. */
function compactSchema<T extends z.ZodType>(schema: T): T {
  const standard = schema['~standard'];
  Object.defineProperty(standard, 'jsonSchema', { value: {
    input: () => z.toJSONSchema(schema, { io: 'input', reused: 'ref' }),
    output: () => z.toJSONSchema(schema, { io: 'output', reused: 'ref' }),
  } });
  return schema;
}

type ToolValue = Record<string, unknown>;
const qualitySchema = z.enum(['draft', 'standard', 'high']);
const codecSchema = z.enum(['h264', 'h265', 'vp9', 'prores']);
const resolutionSchema = z.object({ width: z.number().int().min(2).max(8192), height: z.number().int().min(2).max(8192) }).strict();
const parameterValuesSchema = z.record(z.string(), parameterValueSchema);

function toolResult(value: ToolValue) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function imageToolResult(value: ToolValue, images: Array<{ data: Buffer; mimeType: 'image/png' | 'image/jpeg' }>) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(value, null, 2) },
      ...images.map((item) => ({ type: 'image' as const, data: item.data.toString('base64'), mimeType: item.mimeType })),
    ],
    structuredContent: value,
  };
}

async function canonicalTarget(input: string): Promise<string> {
  const absolute = path.resolve(input);
  let cursor = absolute;
  const suffix: string[] = [];
  while (true) {
    try { return path.join(await realpath(cursor), ...suffix.reverse()); }
    catch {
      const parent = path.dirname(cursor);
      if (parent === cursor) return absolute;
      suffix.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function allowedRoots(): Promise<string[]> {
  const configured = (process.env.GENMOTION_ALLOWED_ROOTS ?? '').split(path.delimiter).filter(Boolean);
  return Promise.all([process.cwd(), ...configured].map(canonicalTarget));
}

async function allowedPath(input: string, label: string): Promise<string> {
  const candidate = await canonicalTarget(input);
  const roots = await allowedRoots();
  const allowed = roots.some((root) => {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  if (!allowed) throw new GenmotionError('MCP_PATH_FORBIDDEN', `${label} must stay inside an allowed Genmotion workspace.`, { candidate, roots });
  return candidate;
}

async function loadConfiguredProject(input: string, parameters: Record<string, ParameterValue> = {}, variantId?: string) {
  const initial = await loadProject(input);
  const variant = variantId ? initial.sourceProject.variants.find((candidate) => candidate.id === variantId) : undefined;
  if (variantId && !variant) throw new GenmotionError('VARIANT_UNKNOWN', `Unknown project variant: ${variantId}`);
  return loadProject(input, { ...(variant?.values ?? {}), ...parameters });
}

function serverFactory(): McpServer {
  const server = new McpServer({ name: 'genmotion', version: GENMOTION_VERSION }, { capabilities: { tools: {} } });
  const previews = new Map<string, PreviewServer>();
  const studios = new Map<string, StudioServer>();

  server.registerTool('genmotion_doctor', {
    title: 'Check Genmotion runtime', description: 'Verify FFmpeg, ffprobe, Node.js, and renderer readiness.', inputSchema: compactSchema(z.object({}).strict()), annotations: { readOnlyHint: true },
  }, async () => { const checks = await doctor(); return toolResult({ ok: checks.every((check) => check.ok), checks }); });

  server.registerTool('genmotion_init', {
    title: 'Create Genmotion project', description: 'Create a neutral Genmotion artboard and truth-linked creative brief for the calling agent to author. No canned scene design is generated.',
    inputSchema: compactSchema(z.object({ directory: z.string().min(1), title: z.string().min(1), promise: z.string().min(1), proof: z.string().min(1), action: z.string().min(1), audience: z.string().min(1), mode: z.enum(['walkthrough', 'launch', 'pitch', 'explainer']), duration: z.number().positive().max(3600) }).strict()),
  }, async (input) => toolResult(await initializeProject(await allowedPath(input.directory, 'Project directory'), { title: input.title, promise: input.promise, proof: input.proof, desiredAction: input.action, audience: input.audience, mode: input.mode, duration: input.duration })));

  server.registerTool('genmotion_catalog', {
    title: 'Search or describe motion catalog', description: 'Search by creative intent, or describe one item with native payload, ranges, cost and refusal conditions before applying it.',
    inputSchema: compactSchema(z.object({ query: z.string().default(''), limit: z.number().int().min(1).max(50).default(12), type: z.enum(['motion', 'blueprint', 'reference']).optional(), id: z.string().optional() }).strict().refine(value => Boolean(value.type) === Boolean(value.id), 'type and id must be supplied together')), annotations: { readOnlyHint: true },
  }, (input) => Promise.resolve(toolResult(input.type && input.id ? { item: describeCatalogItem(input.type, input.id) } : { results: searchCatalog(input.query, input.limit) })));

  server.registerTool('genmotion_catalog_audit', {
    title: 'Audit motion catalog', description: 'Validate catalog implementations, references, and licenses.', inputSchema: compactSchema(z.object({}).strict()), annotations: { readOnlyHint: true },
  }, () => Promise.resolve(toolResult({ ...auditCatalog() })));

  server.registerTool('genmotion_project_read', {
    title: 'Read Genmotion project', description: 'Read the authoritative Creative IR with its revision for safe agent editing.', inputSchema: compactSchema(z.object({ project: z.string().min(1) }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => {
    const loaded = await readProjectSnapshot(await allowedPath(input.project, 'Project'));
    return toolResult({ projectFile: loaded.projectFile, projectDir: loaded.projectDir, revision: loaded.revision, project: loaded.sourceProject, summary: summarizeProject(loaded.project) });
  });

  server.registerTool('genmotion_data_import', {
    title: 'Freeze typed project data', description: 'Import a local UTF-8 JSON/CSV file into a content-hashed typed parameter snapshot. The original file is not read during later renders.',
    inputSchema: frozenDataImportSchema.omit({ content: true, sourceName: true }).extend({ project: z.string().min(1), sourceFile: z.string().min(1), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), dryRun: z.boolean().default(false) }).strict(),
  }, async (input) => {
    const content = await readFrozenDataFile(await allowedPath(input.sourceFile, 'Data source'));
    const session = new EditingSession(filesystemEditingAdapter(await allowedPath(input.project, 'Project')));
    try {
      const snapshot = await session.read();
      if (snapshot.revision !== input.expectedRevision) throw new GenmotionError('REVISION_CONFLICT', 'Data import uses a stale source revision.');
      const imported = importFrozenData(snapshot.project, { id: input.id, parameterId: input.parameterId, format: input.format, sourceName: path.basename(input.sourceFile), content });
      const receipt = await session.replace(imported.project, { expectedRevision: snapshot.revision, origin: 'mcp:data-import', dryRun: input.dryRun });
      return toolResult({ receipt, source: { id: imported.source.id, parameterId: imported.source.parameterId, valueHash: imported.source.valueHash } });
    } finally { await session.dispose(); }
  });

  server.registerTool('genmotion_schema', {
    title: 'Inspect Genmotion authoring schema', description: 'Return a schema-derived Creative IR contract. Choose kind for focused layer, parameter, expression, gesture, edit or query fields. Request full=true for the complete input JSON Schema. Runtime semantic validation is still required.', inputSchema: compactSchema(z.object({ full: z.boolean().default(false), kind: authoringSchemaKindSchema.default('project') }).strict()), annotations: { readOnlyHint: true },
  }, (input) => Promise.resolve(toolResult({
    ...(input.full ? { schema: describeAuthoringSchema(input.kind, true) } : { schemaSummary: describeAuthoringSchema(input.kind) }),
    authoring: {
      model: 'Agents may author complete projects, granular RFC 6902 patches, arbitrary numeric property tracks, custom cubic-bezier and spring easing, and SVG path geometry.',
      layoutSemantics: 'For every layer, x/y are the top-left corner of its layout box, never its center. Text align and verticalAlign work inside that box; anchorX/anchorY only select the transform pivot.',
      transformSemantics: 'transform.x/transform.y are additional offsets around the layer layout position and should normally start at 0; never copy layer x/y into transform x/y. Direct transform tracks animate those offsets.',
      trackTimeSemantics: 'A direct track keyframe at is layer-local time: 0 is the layer entrance and layer.duration is its final instant. Do not use scene or global composition timestamps for layer tracks.',
      recipePolicy: 'Named recipes are optional reusable references. Direct tracks are first-class and require no recipe.',
      canonicalExample: {
        textLayer: { id: 'headline', type: 'text', text: 'Sound, shaped.', x: 240, y: 390, width: 1440, height: 220, fontFamily: 'Arial', fontSize: 96, color: '#f7f5ef' },
        track: { id: 'headline-rise', target: 'transform.y', keyframes: [{ at: 0, value: 36, ease: 'cubic-out' }, { at: 0.8, value: 0, ease: { type: 'cubic-bezier', x1: 0.22, y1: 1, x2: 0.36, y2: 1 } }] },
      },
      visualLoop: ['genmotion_project_read', 'genmotion_project_patch', 'genmotion_validate', 'genmotion_frame', 'genmotion_timeline_inspect'],
    },
  })));

  server.registerTool('genmotion_audio_analyze', {
    title: 'Analyze source audio', description: 'Analyze a bounded window of local audio/video for stereo waveforms, spectrum bands, transients, silence and estimated fixed-tempo beats. Detection is advisory. Dense waveform/spectrum data is opt-in.',
    inputSchema: compactSchema(z.object({ source: z.string(), options: audioAnalysisOptionsSchema.optional(), includeDenseData: z.boolean().default(false) }).strict()), annotations: { readOnlyHint: true },
  }, async (input, context) => {
    const result = await analyzeAudioFile(await allowedPath(input.source, 'Audio source'), input.options, { signal: context.mcpReq.signal });
    if (input.includeDenseData) return toolResult({ ...result });
    const { waveform, spectrum, ...summary } = result;
    return toolResult({ ...summary, waveformLevels: waveform.map((level) => ({ samplesPerBin: level.samplesPerBin, bins: level.values.length / 6 })), spectrumFrames: spectrum.values.length / spectrum.frequencies.length });
  });

  server.registerTool('genmotion_audio_measure', {
    title: 'Measure audio loudness', description: 'Measure integrated LUFS, loudness range and true peak for a processed project mix or a local media file, with silence and clipping diagnostics.',
    inputSchema: compactSchema(z.object({ input: z.string(), media: z.boolean().default(false), parameters: parameterValuesSchema.default({}), variant: z.string().optional() }).strict()), annotations: { readOnlyHint: true },
  }, async (input, context) => {
    const source = await allowedPath(input.input, 'Audio analysis input');
    if (input.media) return toolResult({ ...await measureAudioFile(source, { signal: context.mcpReq.signal }) });
    const loaded = await loadConfiguredProject(source, input.parameters, input.variant);
    const findings = await validateProject(loaded);
    if (hasErrors(findings)) throw new GenmotionError('VALIDATION_FAILED', 'Project failed audio analysis validation.', findings);
    return toolResult({ ...await measureProjectAudio(loaded.project, loaded.projectDir, { signal: context.mcpReq.signal }) });
  });

  server.registerTool('genmotion_audio_render', {
    title: 'Render processed audio mix', description: 'Export the native processed project mix to WAV, FLAC, M4A or Opus, verifying decode before atomic output replacement.',
    inputSchema: compactSchema(z.object({ project: z.string(), output: z.string(), parameters: parameterValuesSchema.default({}), variant: z.string().optional(), stem: z.enum(['music', 'voice', 'sfx', 'source']).optional() }).strict()),
  }, async (input, context) => {
    const loaded = await loadConfiguredProject(await allowedPath(input.project, 'Project'), input.parameters, input.variant);
    const findings = await validateProject(loaded);
    if (hasErrors(findings)) throw new GenmotionError('VALIDATION_FAILED', 'Project failed audio export validation.', findings);
    return toolResult(await renderAudio(loaded.project, loaded.projectDir, await allowedPath(input.output, 'Output'), { signal: context.mcpReq.signal, ...(input.stem ? { stem: input.stem } : {}) }));
  });

  server.registerTool('genmotion_easing_copy', {
    title: 'Copy easing', description: 'Copy a named, Bezier, or spring easing from a stable scene or layer address.', inputSchema: compactSchema(z.object({ project: z.string(), address: easingAddressSchema }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => {
    const snapshot = await readProjectSnapshot(await allowedPath(input.project, 'Project'));
    return toolResult({ revision: snapshot.revision, easing: copyEasing(snapshot.sourceProject, input.address) });
  });
  server.registerTool('genmotion_easing_paste', {
    title: 'Paste easing', description: 'Validate and save a copied easing through a revision-safe project transaction.', inputSchema: compactSchema(z.object({ project: z.string(), address: easingAddressSchema, easing: easingSchema, expectedRevision: z.string(), dryRun: z.boolean().default(false) }).strict()),
  }, async (input, context) => {
    const { loaded: _loaded, ...receipt } = await commitEasing(await allowedPath(input.project, 'Project'), input.address, input.easing, { expectedRevision: input.expectedRevision, dryRun: input.dryRun, signal: context.mcpReq.signal, origin: 'mcp' });
    void _loaded; return toolResult(receipt);
  });

  server.registerTool('genmotion_variants', {
    title: 'Expand and validate parameter configurations', description: 'Generate bounded parameter matrices or validate CSV/JSON named configurations. Returns configurations and serialized export without mutating the project.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), matrix: parameterMatrixSchema.optional(), content: z.string().optional(), inputFormat: z.enum(['csv', 'json']).default('json'), outputFormat: z.enum(['csv', 'json']).default('json') }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => {
    if (input.matrix && input.content !== undefined) throw new Error('Choose matrix or imported content.');
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const variants = input.matrix ? expandParameterMatrix(loaded.sourceProject, input.matrix) : importParameterVariants(loaded.sourceProject, input.content ?? JSON.stringify(loaded.sourceProject.variants), input.inputFormat);
    return toolResult({ variants, content: exportParameterVariants(variants, input.outputFormat) });
  });

  server.registerTool('genmotion_edit_inspect', {
    title: 'Inspect stable native edit target', description: 'Resolve a scene or reusable composition layer by stable identity, including direct dependants and affected composition instances.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), target: editTargetSchema }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => {
    const snapshot = await readProjectSnapshot(await allowedPath(input.project, 'Project'));
    return toolResult({ revision: snapshot.revision, ...inspectEditTarget(snapshot.sourceProject, input.target) });
  });

  server.registerTool('genmotion_editing_session', {
    title: 'Native editing session', description: 'Typed session queries and atomic edits with bounded undo/redo, checkpoint restore and revision-safe filesystem persistence. Return a checkpoint to retain history across calls.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), command: editingCommandSchema, checkpoint: editingCheckpointSchema.optional(), includeCheckpoint: z.boolean().default(false) }).strict()),
  }, async (input, context) => {
    const session = new EditingSession(filesystemEditingAdapter(await allowedPath(input.project, 'Project')));
    const cancel = (): void => { void session.dispose(); };
    context.mcpReq.signal.addEventListener('abort', cancel, { once: true });
    try {
      if (context.mcpReq.signal.aborted) throw context.mcpReq.signal.reason;
      if (input.checkpoint) await session.restore(input.checkpoint);
      const result = await executeEditingCommand(session, input.command);
      return toolResult({ result, ...(input.includeCheckpoint ? { checkpoint: await session.checkpoint() } : {}) });
    } finally { context.mcpReq.signal.removeEventListener('abort', cancel); await session.dispose(); }
  });

  server.registerTool('genmotion_studio_session', {
    title: 'Live Studio session', description: 'Read capabilities and shared Studio context, navigate its playhead/selection, or perform revision-checked semantic edits with Studio session permissions and shared undo history. Requires this project to be open in Studio.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), command: studioBridgeCommandSchema }).strict()),
  }, async (input, context) => toolResult({ result: await executeStudioCommand(await allowedPath(input.project, 'Project'), input.command, context.mcpReq.signal) }));

  server.registerTool('genmotion_edit_capability', {
    title: 'Check native editing capability', description: 'Pure structural capability/refusal query for a semantic edit. Does not certify assets or evaluated semantic validity.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), edit: semanticEditSchema }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => {
    const snapshot = await readProjectSnapshot(await allowedPath(input.project, 'Project'));
    return toolResult({ revision: snapshot.revision, ...canApplySemanticEdit(snapshot.sourceProject, input.edit) });
  });

  server.registerTool('genmotion_edit', {
    title: 'Apply stable native edits', description: 'Apply text, property, timing, asset, layer and track edits as one validated transaction addressed by stable scene/composition and layer IDs. Returns affected targets and an inverse patch for revision-safe undo.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), edits: semanticEditSchema.array().min(1).max(500), strict: z.boolean().default(true), dryRun: z.boolean().default(false) }).strict()),
  }, async (input, context) => {
    const { loaded, ...receipt } = await commitSemanticEdits(await allowedPath(input.project, 'Project'), input.edits, { expectedRevision: input.expectedRevision, strict: input.strict, dryRun: input.dryRun, origin: 'mcp', signal: context.mcpReq.signal });
    return toolResult({ ...receipt, projectFile: loaded.projectFile });
  });

  server.registerTool('genmotion_project_save', {
    title: 'Save Genmotion project', description: 'Validate and atomically save a complete Creative IR document under a cross-process project lock. Dry runs return validated proposals without committing. Stale revisions and invalid documents preserve accepted work.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), document: projectSchema, strict: z.boolean().default(true), dryRun: z.boolean().default(false) }).strict()),
  }, async (input, context) => {
    const receipt = await commitProject(await allowedPath(input.project, 'Project'), { expectedRevision: input.expectedRevision, update: () => input.document, strict: input.strict, dryRun: input.dryRun, origin: 'mcp', signal: context.mcpReq.signal });
    const { loaded, ...result } = receipt;
    return toolResult({ ...result, projectFile: loaded.projectFile, summary: summarizeProject(loaded.project) });
  });

  server.registerTool('genmotion_project_patch', {
    title: 'Patch Genmotion project', description: 'Apply an ordered RFC 6902 transaction, validate before committing, preserve raw-source history and reject competing or stale revisions. Dry runs return validated proposals without committing.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), operations: z.array(patchOperationSchema).min(1).max(500), strict: z.boolean().default(true), dryRun: z.boolean().default(false) }).strict()),
  }, async (input, context) => {
    const receipt = await commitProject(await allowedPath(input.project, 'Project'), { expectedRevision: input.expectedRevision, update: (project) => applyPatch(project, input.operations), strict: input.strict, dryRun: input.dryRun, origin: 'mcp', signal: context.mcpReq.signal });
    const { loaded, ...result } = receipt;
    return toolResult({ ...result, projectFile: loaded.projectFile, operationsApplied: input.operations.length, summary: summarizeProject(loaded.project) });
  });

  server.registerTool('genmotion_validate', {
    title: 'Validate Genmotion project', description: 'Validate Creative IR, assets, layout, timing, motion ownership, and delivery constraints.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), strict: z.boolean().default(true) }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const findings = await validateProject(loaded);
    return toolResult({ ok: !hasErrors(findings) && (!input.strict || findings.length === 0), summary: summarizeProject(loaded.project), findings });
  });

  server.registerTool('genmotion_render_plan', {
    title: 'Create deterministic render plan', description: 'Resolve delivery metadata and hash every frozen local dependency without rendering or mutating the project.',
    inputSchema: compactSchema(renderPlanOptionsSchema.extend({ project: z.string().min(1) }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => { const { project, ...options } = input; return toolResult({ ...(await createRenderPlan(await loadProject(await allowedPath(project, 'Project')), options)) }); });

  server.registerTool('genmotion_check_report', {
    title: 'Create native check report', description: 'Return one bounded report over schema, assets, layout, media, contrast, motion coverage and output contract.',
    inputSchema: compactSchema(checkReportOptionsSchema.extend({ project: z.string().min(1) }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => { const { project, ...options } = input; return toolResult({ ...(await createCheckReport(await loadProject(await allowedPath(project, 'Project')), options)) }); });

  server.registerTool('genmotion_output_compatibility', {
    title: 'Inspect output compatibility', description: 'Return the complete native output matrix or validate one codec/container/pixel/alpha/backend combination without fallback.',
    inputSchema: compactSchema(z.object({ contract: outputCompatibilityInputSchema.optional() }).strict()), annotations: { readOnlyHint: true },
  }, (input) => Promise.resolve(toolResult(input.contract ? { ...resolveOutputCompatibility(input.contract) } : { matrix: outputCompatibilityMatrix })));

  server.registerTool('genmotion_frame', {
    title: 'Render Genmotion frame', description: 'Render an exact native PNG frame at a requested timestamp and optional delivery resolution.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), at: z.number().finite().nonnegative(), subframe: z.boolean().default(false), output: z.string().min(1), resolution: resolutionSchema.optional(), compositionId: z.string().min(1).optional(), group: renderGroupSchema.optional(), parameters: parameterValuesSchema.default({}), variant: z.string().optional() }).strict()),
  }, async (input) => {
    const loaded = await loadConfiguredProject(await allowedPath(input.project, 'Project'), input.parameters, input.variant);
    if (input.group && input.compositionId) throw new GenmotionError('RENDER_SELECTION_CONFLICT', 'Choose a group or a standalone composition.');
    loaded.project = projectForRenderComposition(loaded.project, input.compositionId);
    const destination = await allowedPath(input.output, 'Frame output');
    const duration = loaded.project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    if (input.subframe && input.at >= duration) throw new GenmotionError('FRAME_OUTSIDE_COMPOSITION', 'Exact timestamp must be inside the composition.');
    const frame = input.subframe ? input.at * loaded.project.fps : Math.min(Math.ceil(duration * loaded.project.fps) - 1, Math.floor(input.at * loaded.project.fps));
    const png = await renderFramePng(loaded.project, loaded.projectDir, frame, input.resolution, resolveRenderView(loaded.project, input.group));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, png);
    return imageToolResult({ output: destination, frame, at: frame / loaded.project.fps, resolution: input.resolution ?? { width: loaded.project.width, height: loaded.project.height } }, [{ data: png, mimeType: 'image/png' }]);
  });

  server.registerTool('genmotion_timeline_inspect', {
    title: 'Inspect evaluated timeline', description: 'Evaluate the active scene and every visible layer at an exact time after recipe compilation and arbitrary property-track animation.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), at: z.number().nonnegative() }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const active = locateScene(loaded.project, input.at);
    const layers = resolveLayerGraph(active.scene.layers, active.localTime, loaded.project.seed).filter((layer) => layer.visible && layerIsActive(effectiveLayerStart(layer), layer.duration, active.scene.duration, active.localTime)).map((layer) => ({
      ...layer,
      localTime: active.localTime - effectiveLayerStart(layer),
    }));
    return toolResult({ at: input.at, scene: { id: active.scene.id, purpose: active.scene.purpose, localTime: active.localTime, globalStart: active.globalStart }, layers });
  });

  server.registerTool('genmotion_render', {
    title: 'Render Genmotion master', description: 'Validate and render a reproducible high-resolution video master. High quality guarantees at least a 1920-pixel long edge. Optional sceneId or an exclusive-end frame range exports an interval while preserving global timing and audio processing.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), output: z.string().min(1), quality: qualitySchema.default('high'), codec: codecSchema.default('h264'), alphaMode: alphaModeSchema.default('auto'), alphaBackground: z.string().optional(), resolution: resolutionSchema.optional(), sceneId: z.string().min(1).optional(), compositionId: z.string().min(1).optional(), group: renderGroupSchema.optional(), range: renderFrameRangeSchema.optional(), workers: z.number().int().min(1).max(16).optional(), maxBufferedFrames: z.number().int().positive().optional(), maxBufferedBytes: z.number().int().positive().optional(), timeoutMs: z.number().int().min(1).max(2_147_483_647).optional(), hardwareAcceleration: z.boolean().default(false), strict: z.boolean().default(true), parameters: parameterValuesSchema.default({}), variant: z.string().optional() }).strict()),
  }, async (input, context) => {
    const loaded = await loadConfiguredProject(await allowedPath(input.project, 'Project'), input.parameters, input.variant);
    const findings = await validateProject(loaded);
    if (hasErrors(findings) || (input.strict && findings.length > 0)) throw new GenmotionError('VALIDATION_FAILED', 'Render blocked by validation findings.', findings);
    const output = await allowedPath(input.output, 'Render output');
    const result = await renderProject(loaded, { output, sceneId: input.sceneId, compositionId: input.compositionId, group: input.group, range: input.range, quality: input.quality, codec: input.codec, alphaMode: input.alphaMode, alphaBackground: input.alphaBackground, ...(input.resolution ? { resolution: input.resolution } : {}), workers: input.workers, maxBufferedFrames: input.maxBufferedFrames, maxBufferedBytes: input.maxBufferedBytes, timeoutMs: input.timeoutMs, hardwareAcceleration: input.hardwareAcceleration, signal: context.mcpReq.signal });
    return toolResult({ ...result });
  });

  server.registerTool('genmotion_path_operate', {
    title: 'Apply native path geometry operations', description: 'Evaluate ordered boolean, stroke expansion, rounding, affine transform, trim, dash and simplify operations without changing a project.',
    inputSchema: compactSchema(z.object({ path: z.string().max(10_000_000), operations: pathOperationsSchema }).strict()), annotations: { readOnlyHint: true },
  }, (input) => {
    const path = applyPathOperations(input.path, input.operations);
    return Promise.resolve(toolResult({ path, ...pathMetrics(path) }));
  });

  server.registerTool('genmotion_path_inspect', {
    title: 'Inspect native vector path', description: 'Measure SVG path data and sample deterministic position, tangent, and trimmed polyline geometry.',
    inputSchema: compactSchema(z.object({ path: z.string().min(1), progress: z.number().min(0).max(1).default(1), tolerance: z.number().positive().default(1) }).strict()), annotations: { readOnlyHint: true },
  }, (input) => Promise.resolve(toolResult({ ...pathMetrics(input.path), normalized: normalizePath(input.path, input.tolerance), sample: samplePath(input.path, input.progress), prefix: flattenPath(input.path, 0, input.progress, input.tolerance) })));

  server.registerTool('genmotion_bundle', {
    title: 'Create, verify or restore project bundle', description: 'Freeze project media, fonts, inactive variants and local recipe libraries with SHA-256 identities. Restore verified content to a new editable directory.',
    inputSchema: z.discriminatedUnion('action', [
      z.object({ action: z.literal('create'), project: z.string().min(1), output: z.string().min(1), maxBytes: z.number().int().positive().max(32 * 1024 ** 3).default(32 * 1024 ** 3) }).strict(),
      z.object({ action: z.literal('verify'), directory: z.string().min(1) }).strict(),
      z.object({ action: z.literal('restore'), directory: z.string().min(1), output: z.string().min(1) }).strict(),
    ]),
  }, async (input, context) => {
    if (input.action === 'verify') return toolResult(await verifyProjectBundle(await allowedPath(input.directory, 'Bundle directory'), { signal: context.mcpReq.signal }));
    if (input.action === 'restore') return toolResult(await restoreProjectBundle(await allowedPath(input.directory, 'Bundle directory'), await allowedPath(input.output, 'Restore destination'), { signal: context.mcpReq.signal }));
    return toolResult(await createProjectBundle(await loadProject(await allowedPath(input.project, 'Project')), await allowedPath(input.output, 'Bundle output'), { maxBytes: input.maxBytes, signal: context.mcpReq.signal }));
  });

  server.registerTool('genmotion_lut_import', {
    title: 'Import a frozen native CUBE LUT', description: 'Validate a local 1D/3D CUBE file, freeze its source in the project, and return a compact hash-bound LUT payload for a visual effect. Color spaces must be explicit.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), file: z.string().min(1), inputColorSpace: lookupTableSchema.shape.inputColorSpace, outputColorSpace: lookupTableSchema.shape.outputColorSpace, interpolation: lookupTableSchema.shape.interpolation }).strict()),
  }, async (input) => {
    const project = await loadProject(await allowedPath(input.project, 'Project')), file = await allowedPath(input.file, 'LUT source');
    if ((await stat(file)).size > 32 * 1024 ** 2) throw new Error('CUBE input exceeds 32 MiB');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(file));
    return toolResult({ lut: await importCubeLut(project.projectDir, text, { inputColorSpace: input.inputColorSpace, outputColorSpace: input.outputColorSpace, interpolation: input.interpolation }) });
  });

  server.registerTool('genmotion_markers', {
    title: 'Timeline markers and named ranges', description: 'Read scene-relative/global markers and in/out ranges. Optional replacements require the current file revision and preserve other project data.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), markers: timelineMarkersSchema.optional(), ranges: timelineRangesSchema.optional(), expectedRevision: z.string().optional() }).strict()),
  }, async (input) => {
    const project = await allowedPath(input.project, 'Project');
    if (input.markers || input.ranges) {
      if (!input.expectedRevision) throw new GenmotionError('REVISION_REQUIRED', 'Marker updates require the current file revision.');
      await commitProject(project, { expectedRevision: input.expectedRevision, origin: 'mcp', update: (document) => ({ ...document, ...(input.markers ? { markers: input.markers } : {}), ...(input.ranges ? { ranges: input.ranges } : {}) }) });
    }
    const snapshot = await readProjectSnapshot(project);
    return toolResult({ revision: snapshot.revision, markers: (snapshot.sourceProject.markers ?? []).map((marker) => { try { return { ...marker, globalTime: globalMarkerTime(marker, snapshot.sourceProject.scenes) }; } catch (error) { return { ...marker, error: error instanceof Error ? error.message : String(error) }; } }), ranges: snapshot.sourceProject.ranges ?? [] });
  });

  server.registerTool('genmotion_effects', {
    title: 'Native visual effect capabilities and cost', description: 'Inspect implemented effect controls, sampling, alpha, precision, SDR/HDR support and estimated working memory. Estimates exclude enclosing surfaces and backend scratch allocations.',
    inputSchema: compactSchema(z.object({ effects: visualEffectsSchema.optional(), width: z.number().int().min(1).max(8192).default(1920), height: z.number().int().min(1).max(8192).default(1080) }).strict()),
  }, (input) => toolResult(input.effects ? estimateEffectStack(input.effects, input.width, input.height) : { effects: visualEffectTypeSchema.options.map(visualEffectCapabilities) }));

  server.registerTool('genmotion_production', {
    title: 'Production workflow and storyboard', description: 'Inspect resumable stages, asset fingerprints and shot reviews. Apply explicit revision-checked planning, review, comment and stage actions. Changed inputs invalidate affected completion and approval.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), action: productionActionSchema.optional(), expectedRevision: z.string().optional() }).strict()),
  }, async (input, context) => {
    const project = await allowedPath(input.project, 'Project');
    if (input.action) {
      if (!input.expectedRevision) throw new GenmotionError('REVISION_REQUIRED', 'Production actions require the current file revision.');
      const receipt = await commitProductionAction(project, input.expectedRevision, input.action, context.mcpReq.signal);
      return toolResult({ revision: receipt.revision, state: await inspectProduction(receipt.loaded, context.mcpReq.signal) });
    }
    const snapshot = await readProjectSnapshot(project);
    return toolResult({ revision: snapshot.revision, state: await inspectProduction(snapshot, context.mcpReq.signal) });
  });

  server.registerTool('genmotion_brief', {
    title: 'Read or update production brief', description: 'Resume versioned requirements, distinguish user decisions from inference, and report unresolved fields and sources. Writes require the current file revision.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), brief: productionBriefSchema.optional(), expectedRevision: z.string().optional() }).strict()),
  }, async (input) => {
    const project = await allowedPath(input.project, 'Project');
    if (input.brief) {
      if (!input.expectedRevision) throw new GenmotionError('REVISION_REQUIRED', 'Brief updates require the current file revision.');
      const brief = input.brief;
      const receipt = await commitProject(project, { expectedRevision: input.expectedRevision, origin: 'mcp', update: (document) => ({ ...document, productionBrief: brief }) });
      return toolResult({ revision: receipt.revision, ...resumeProductionBrief(receipt.loaded.sourceProject.productionBrief) });
    }
    const snapshot = await readProjectSnapshot(project);
    return toolResult({ revision: snapshot.revision, ...resumeProductionBrief(snapshot.sourceProject.productionBrief) });
  });

  server.registerTool('genmotion_text_measure', {
    title: 'Measure native text layout', description: 'Measure complete text, fitted font size, line breaks, automatic dimensions and overflow using native project fonts.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), address: textMeasureAddressSchema }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => toolResult(measureProjectText(await loadProject(await allowedPath(input.project, 'Project')), input.address)));

  server.registerTool('genmotion_animation_inspect', {
    title: 'Inspect deterministic animation primitives',
    description: 'Evaluate a typed property track, measure a physical spring, generate a stagger schedule, or sample seeded 1D-4D noise without rendering.',
    inputSchema: z.discriminatedUnion('action', [
      z.object({ action: z.literal('kinematics'), track: animationTrackSchema, options: trackAnalysisOptionsSchema.default({ samples: 121, step: 0.0001, seed: 0 }) }).strict(),
      z.object({ action: z.literal('track'), track: animationTrackSchema, at: z.number(), seed: z.number().int().default(0) }).strict(),
      z.object({ action: z.literal('spring'), spring: easingSchema.optional(), preset: z.enum(['gentle', 'snappy', 'settled', 'expressive']).default('settled'), samples: z.number().int().min(2).max(1000).default(120) }).strict(),
      z.object({ action: z.literal('stagger'), count: z.number().int().min(1).max(10_000), each: z.number().nonnegative().default(0.08), trail: z.number().nonnegative().default(0), from: z.enum(['start', 'end', 'center', 'edges', 'random', 'distance']).default('start'), seed: z.number().int().default(0), ease: easingSchema.default('linear'), positions: z.array(z.tuple([z.number().finite(), z.number().finite()])).max(10_000).optional(), origin: z.tuple([z.number().finite(), z.number().finite()]).default([0, 0]), distanceUnit: z.number().finite().positive().default(100), delay: z.number().finite().nonnegative().default(0) }).strict(),
      z.object({ action: z.literal('noise'), seed: z.number().int().default(0), coordinates: z.array(z.number().finite()).min(1).max(4), octaves: z.number().int().min(1).max(8).default(1), lacunarity: z.number().positive().default(2), gain: z.number().min(0).max(1).default(0.5) }).strict(),
    ]),
    annotations: { readOnlyHint: true },
  }, (input) => {
    if (input.action === 'kinematics') return Promise.resolve(toolResult(analyzeTrack(input.track, input.options)));
    if (input.action === 'track') return Promise.resolve(toolResult({ value: evaluateTrack(input.track, input.at, input.seed), at: input.at }));
    if (input.action === 'spring') {
      const easing = input.spring ?? easingPresets[input.preset];
      if (typeof easing === 'string' || easing.type !== 'spring') throw new GenmotionError('SPRING_REQUIRED', 'Spring inspection requires a physical spring easing.');
      return Promise.resolve(toolResult({ preset: input.spring ? undefined : input.preset, ...analyzeSpring(easing, input.samples) }));
    }
    if (input.action === 'stagger') {
      const options = { each: input.each, from: input.from, seed: input.seed, trail: input.trail, ease: input.ease, origin: input.origin, distanceUnit: input.distanceUnit, delay: input.delay, ...(input.positions ? { positions: input.positions } : {}) };
      return Promise.resolve(toolResult({ schedule: staggerSchedule(input.count, options), windows: staggerWindows(input.count, options) }));
    }
    return Promise.resolve(toolResult({ random: seededRandom(input.seed), noise: noiseND(input.seed, input.coordinates), fractal: fractalNoise(input.seed, input.coordinates, input) }));
  });

  server.registerTool('genmotion_compositions_inspect', {
    title: 'Inspect composition graph', description: 'Return reusable composition dependencies and every scene or composition instance that uses a selected definition.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), compositionId: z.string().optional() }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    return toolResult({ graph: compositionDependencyGraph(loaded.project), layerGraphs: Object.fromEntries([...loaded.project.scenes, ...loaded.project.compositions].map((container) => [container.id, layerDependencyGraph(container.layers)])), ...(input.compositionId ? { uses: compositionUses(loaded.project, input.compositionId) } : {}) });
  });

  server.registerTool('genmotion_captions_edit', {
    title: 'Edit caption timing and pages', description: 'Return corrected, shifted, paginated or text-replaced cues with diagnostics. Apply returned cues through the shared semantic edit API to save them.',
    inputSchema: compactSchema(z.object({ cues: z.array(captionCueSchema).max(10000), action: captionEditSchema }).strict()), annotations: { readOnlyHint: true },
  }, (input) => toolResult(editCaptions(input.cues, input.action)));

  server.registerTool('genmotion_captions_convert', {
    title: 'Convert captions', description: 'Convert provider-neutral SRT, WebVTT, or timed JSON captions without network dependencies.',
    inputSchema: compactSchema(z.object({ content: z.string(), inputFormat: z.enum(['srt', 'vtt', 'json']), outputFormat: z.enum(['srt', 'vtt', 'json']) }).strict()), annotations: { readOnlyHint: true },
  }, (input) => {
    const cues = parseCaptions(input.content, input.inputFormat);
    return Promise.resolve(toolResult({ cues, output: serializeCaptions(cues, input.outputFormat), format: input.outputFormat }));
  });

  server.registerTool('genmotion_captions_delivery', {
    title: 'Plan caption delivery', description: 'Resolve multilingual caption tracks and return deterministic burned-in, sidecar, or embedded subtitle artifacts and mux metadata.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), options: captionDeliveryOptionsSchema }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => toolResult(createCaptionDeliveryPlan((await loadProject(await allowedPath(input.project, 'Project'))).project, input.options)));

  server.registerTool('genmotion_music_plan', { title: 'Plan music and lyrics', description: 'Select a real analyzed source range, map beats, retain verified lyrics and report readable holds.', inputSchema: compactSchema(z.object({ features: frozenAudioFeaturesSchema, lyrics: z.array(lyricCueSchema).max(100000).default([]), options: musicWorkflowOptionsSchema }).strict()), annotations: { readOnlyHint: true } }, (input) => toolResult(planMusicWorkflow(input.features, input.lyrics, input.options)));

  server.registerTool('genmotion_presentation', { title: 'Validate or export a presentation', description: 'Validate stable presentation identities or produce an explicit deterministic video route.', inputSchema: compactSchema(z.object({ project: z.string().min(1), manifest: presentationManifestSchema, exportPolicy: presentationExportPolicySchema.optional() }).strict()), annotations: { readOnlyHint: true } }, async (input) => { const project = (await loadProject(await allowedPath(input.project, 'Project'))).project; return toolResult(input.exportPolicy ? planPresentationExport(project, input.manifest, input.exportPolicy) : validatePresentationManifest(project, input.manifest)); });

  server.registerTool('genmotion_media_conform', {
    title: 'Conform source media', description: 'Create a new verified CFR SDR BT.709 derivative with explicit input color assumptions, optional HDR tone mapping and source/output hashes. Refuses existing destinations. Dry run returns the conversion plan.',
    inputSchema: compactSchema(z.object({ source: z.string().min(1), output: z.string().min(1), options: mediaConformOptionsSchema, dryRun: z.boolean().default(false) }).strict()),
  }, async (input, context) => {
    const source = await allowedPath(input.source, 'Media source'), destination = await allowedPath(input.output, 'Conforming output');
    return toolResult(input.dryRun ? mediaConformPlan(await inspectMedia(source, { signal: context.mcpReq.signal }), input.options) : await conformMedia(source, destination, input.options, { signal: context.mcpReq.signal }));
  });

  server.registerTool('genmotion_media_info', {
    title: 'Inspect source media', description: 'Inspect local audio/video stream metadata, display geometry, rotation, color tags, HDR transfer, audio formats and timing hints. Does not claim frame-by-frame VFR verification or ICC conversion.',
    inputSchema: compactSchema(z.object({ source: z.string().min(1) }).strict()), annotations: { readOnlyHint: true },
  }, async (input, context) => toolResult({ ...await inspectMedia(await allowedPath(input.source, 'Media source'), { signal: context.mcpReq.signal }) }));

  server.registerTool('genmotion_probe', {
    title: 'Probe video', description: 'Inspect the encoded video contract including dimensions, frame rate, codecs, duration, and size.', inputSchema: compactSchema(z.object({ video: z.string().min(1) }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => toolResult({ ...await probeVideo(await allowedPath(input.video, 'Video')) }));

  server.registerTool('genmotion_contact_sheet', {
    title: 'Create contact sheet', description: 'Create a representative contact sheet for visual review of a rendered video.',
    inputSchema: compactSchema(z.object({ video: z.string().min(1), output: z.string().min(1), count: z.number().int().min(4).max(40).default(12), columns: z.number().int().min(2).max(8).default(4) }).strict()),
  }, async (input) => {
    const video = await allowedPath(input.video, 'Video');
    const output = await allowedPath(input.output, 'Contact sheet output');
    await makeContactSheet(video, output, input.count, input.columns);
    return toolResult({ output, source: video, count: input.count, columns: input.columns });
  });

  server.registerTool('genmotion_requests', {
    title: 'List Studio requests', description: 'Read durable human requests captured by Genmotion Studio.', inputSchema: compactSchema(z.object({ project: z.string().min(1), pendingOnly: z.boolean().default(false) }).strict()), annotations: { readOnlyHint: true },
  }, async (input) => { const requests = await getStudioRequests(await allowedPath(input.project, 'Project')); return toolResult({ requests: input.pendingOnly ? requests.filter((item) => ['pending', 'queued', 'running'].includes(item.status)) : requests }); });

  server.registerTool('genmotion_request_resolve', {
    title: 'Resolve Studio request', description: 'Close a durable Studio request after its real project edit has been saved and verified.',
    inputSchema: compactSchema(z.object({ project: z.string().min(1), id: z.string().min(1), response: z.string().min(3).max(20_000) }).strict()),
  }, async (input) => toolResult({ request: await resolveStudioRequest(await allowedPath(input.project, 'Project'), input.id, input.response) }));

  server.registerTool('genmotion_preview_start', {
    title: 'Start native preview', description: 'Start a localhost-only native frame preview and return its URL.', inputSchema: compactSchema(z.object({ project: z.string().min(1), port: z.number().int().min(1024).max(65535).default(4178) }).strict()),
  }, async (input) => { const preview = await startPreview(await loadProject(await allowedPath(input.project, 'Project')), { host: '127.0.0.1', port: input.port }); const id = randomUUID(); previews.set(id, preview); return toolResult({ id, url: preview.url }); });

  server.registerTool('genmotion_studio_start', {
    title: 'Start Genmotion Studio', description: 'Start the localhost-only workflow and timeline editor for a project.', inputSchema: compactSchema(z.object({ project: z.string().min(1), port: z.number().int().min(1024).max(65535).default(4180), workspace: z.string().optional() }).strict()),
  }, async (input) => { const loaded = await loadProject(await allowedPath(input.project, 'Project')); const workspaceRoot = input.workspace ? await allowedPath(input.workspace, 'Studio workspace') : loaded.projectDir; const studio = await startStudio(loaded, { host: '127.0.0.1', port: input.port, workspaceRoot }); const id = randomUUID(); studios.set(id, studio); return toolResult({ id, url: studio.url, project: loaded.projectFile }); });

  server.registerTool('genmotion_server_stop', {
    title: 'Stop Genmotion local server', description: 'Stop a preview or Studio server previously started by this MCP connection.', inputSchema: compactSchema(z.object({ id: z.string().uuid() }).strict()),
  }, async (input) => { const instance = previews.get(input.id) ?? studios.get(input.id); if (!instance) throw new GenmotionError('SERVER_NOT_FOUND', 'No Genmotion server exists with that id.'); await instance.close(); previews.delete(input.id); studios.delete(input.id); return toolResult({ stopped: true, id: input.id }); });

  return server;
}

serveStdio(serverFactory, { onerror: (error) => process.stderr.write(`[genmotion-mcp] ${error.message}\n`) });
