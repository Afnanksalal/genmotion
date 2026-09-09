#!/usr/bin/env node
import { alphaModeSchema } from './engine/alpha-output.js';
import { importFrozenData } from './ir/data-sources.js';
import { resolveRenderView } from './engine/render-view.js';
import { projectForRenderComposition } from './engine/render-projection.js';
import { readFrozenDataFile } from './ir/data-import-file.js';
import { authoringSchemaKindSchema, describeAuthoringSchema } from './ir/authoring-schema.js';
import { conformMedia, mediaConformPlan, mediaConformOptionsSchema } from './engine/media-conform.js';
import { inspectMedia } from './engine/media-probe.js';
import { editCaptions, captionEditSchema } from './ir/caption-editing.js';
import { createCaptionDeliveryPlan } from './ir/caption-delivery.js';
import { planMusicWorkflow, musicWorkflowOptionsSchema, lyricCueSchema } from './ir/music-workflow.js';
import { frozenAudioFeaturesSchema } from './engine/audio-intelligence.js';
import { planPresentationExport, presentationExportPolicySchema, presentationManifestSchema, validatePresentationManifest } from './ir/presentation.js';
import { analyzeAudioFile, audioAnalysisOptionsSchema } from './engine/audio-analysis.js';
import { globalMarkerTime, timelineMarkersSchema, timelineRangesSchema } from './ir/markers.js';
import { stat } from 'node:fs/promises';
import { importCubeLut } from './ir/lut-import.js';
import { lookupTableSchema } from './ir/lut.js';
import { visualEffectCapabilities, estimateEffectStack } from './engine/effects.js';
import { visualEffectTypeSchema, visualEffectsSchema } from './ir/schema.js';
import { inspectProduction, commitProductionAction, productionActionSchema } from './ir/production-service.js';
import { Command } from 'commander';
import { z } from 'zod';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { loadProject } from './ir/loader.js';
import { commitProject, readProjectSnapshot } from './ir/store.js';
import { applyPatch, patchOperationSchema } from './ir/patch.js';
import { commitSemanticEdits, semanticEditSchema } from './ir/edit.js';
import { EditingSession, filesystemEditingAdapter, editingCommandSchema, editingCheckpointSchema, executeEditingCommand } from './ir/session.js';
import { executeStudioCommand, studioBridgeCommandSchema } from './studio/bridge.js';
import { hasErrors, summarizeProject, validateProject } from './ir/validate.js';
import { reviewSamplePlan } from './ir/review-sampling.js';
import { createRenderPlan } from './ir/render-plan.js';
import { createCheckReport } from './ir/check-report.js';
import { renderFrameRangeSchema } from './ir/render-selection.js';
import { outputCompatibilityMatrix, resolveOutputCompatibility } from './engine/output-compatibility.js';
import { renderFramePng } from './engine/draw.js';
import { defaultVideoExtension, renderProject, type RenderQuality, type VideoCodec } from './engine/render.js';
import { startPreview } from './engine/preview.js';
import { doctor } from './commands/doctor.js';
import { initializeProject } from './commands/init.js';
import { describeCatalogItem, searchCatalog } from './commands/catalog.js';
import { GenmotionError } from './errors.js';
import { makeContactSheet, probeVideo } from './engine/probe.js';
import { auditCatalog } from './catalog/audit.js';
import { isEntrypoint } from './entrypoint.js';
import { getStudioRequests, resolveStudioRequest, startStudio } from './studio/server.js';
import { GENMOTION_VERSION } from './version.js';
import { parseCaptions, serializeCaptions } from './captions.js';
import type { ParameterValue } from './ir/parameters.js';
import { expandParameterMatrix, exportParameterVariants, importParameterVariants } from './ir/variants.js';
import { animationTrackSchema, easingSchema } from './ir/schema.js';
import { secondsToFrames } from './engine/time.js';
import { createProjectBundle, verifyProjectBundle, restoreProjectBundle } from './ir/bundle.js';
import { productionBriefSchema, resumeProductionBrief } from './ir/brief.js';
import { measureProjectText } from './engine/text-measure.js';
import { analyzeTrack } from './engine/kinematics.js';
import { normalizePath, pathMetrics, samplePath } from './engine/path.js';
import { absoluteSvgPath, parseSvgPath } from './engine/svg-path.js';
import { commitEasing, copyEasing, easingAddressSchema } from './ir/easing-edits.js';
import { applyPathOperations } from './engine/path-operations.js';
import { pathOperationsSchema } from './ir/path-operations.js';
import { renderAudio, measureProjectAudio } from './engine/audio.js';
import { measureAudioFile } from './engine/loudness.js';
import { analyzeSpring, easingPresets } from './engine/easing.js';
import { fractalNoise, noiseND, seededRandom, staggerSchedule, staggerWindows } from './engine/procedural.js';

const program = new Command();
program.name('genmotion').description('Agent-native motion design engine and visual editor.').version(GENMOTION_VERSION).option('--json', 'Emit machine-readable JSON.');

function output(value: unknown): void {
  if (program.opts<{ json?: boolean }>().json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === 'string') process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseResolution(value: string): { width: number; height: number } {
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(value.trim());
  if (!match) throw new GenmotionError('INVALID_RENDER_RESOLUTION', 'Resolution must use WIDTHxHEIGHT, for example 1920x1080.');
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseFrameRange(value: string): { startFrame: number; endFrame: number } {
  const match = /^(\d+):(\d+)$/.exec(value.trim());
  if (!match) throw new GenmotionError('INVALID_RENDER_RANGE', 'Frame range must use START:END with an exclusive end.');
  return renderFrameRangeSchema.parse({ startFrame: Number(match[1]), endFrame: Number(match[2]) });
}

function parseRenderGroup(value?: string): { sceneId: string; layerId: string } | undefined {
  if (value === undefined) return undefined;
  const parts = value.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new GenmotionError('INVALID_RENDER_GROUP', 'Group selection must use scene-id/layer-id.');
  return { sceneId: parts[0], layerId: parts[1] };
}

async function loadConfiguredProject(input: string, options: { params?: string; variant?: string }) {
  const initial = await loadProject(input);
  const variant = options.variant ? initial.sourceProject.variants.find((candidate) => candidate.id === options.variant) : undefined;
  if (options.variant && !variant) throw new GenmotionError('VARIANT_UNKNOWN', `Unknown project variant: ${options.variant}`);
  const explicit = options.params ? JSON.parse(options.params) as Record<string, ParameterValue> : {};
  return loadProject(input, { ...(variant?.values ?? {}), ...explicit });
}

program.command('schema')
  .description('Discover current authoring fields or export input JSON Schema')
  .option('--kind <kind>', 'Schema kind: ' + authoringSchemaKindSchema.options.join(', '), 'project')
  .option('--full', 'Return complete input JSON Schema')
  .option('--output <file>', 'Write full input JSON Schema for editor integrations')
  .action(async (options: { kind: string; full?: boolean; output?: string }) => {
    const kind = authoringSchemaKindSchema.parse(options.kind);
    const schema = describeAuthoringSchema(kind, Boolean(options.full || options.output));
    if (options.output) { await writeFile(path.resolve(options.output), JSON.stringify(schema, null, 2) + '\n'); output({ kind, output: path.resolve(options.output) }); }
    else output(schema);
  });

program.command('data-import')
  .argument('<project>')
  .requiredOption('--source <file>', 'Local UTF-8 JSON or CSV file to freeze')
  .requiredOption('--id <id>', 'Stable frozen source ID')
  .requiredOption('--parameter <id>', 'Typed project parameter supplied by this source')
  .requiredOption('--expected-revision <hash>', 'File revision returned by project-read')
  .option('--format <format>', 'json or csv; defaults to the file extension')
  .option('--dry-run', 'Validate without saving')
  .action(async (input: string, options: { source: string; id: string; parameter: string; expectedRevision: string; format?: string; dryRun?: boolean }) => {
    const content = await readFrozenDataFile(path.resolve(options.source));
    const session = new EditingSession(filesystemEditingAdapter(input));
    try {
      const snapshot = await session.read();
      if (snapshot.revision !== options.expectedRevision) throw new GenmotionError('REVISION_CONFLICT', 'Data import uses a stale source revision.');
      const imported = importFrozenData(snapshot.project, { id: options.id, parameterId: options.parameter, format: z.enum(['json', 'csv']).parse(options.format ?? path.extname(options.source).slice(1).toLowerCase()), sourceName: path.basename(options.source), content });
      const receipt = await session.replace(imported.project, { expectedRevision: snapshot.revision, origin: 'cli:data-import', dryRun: options.dryRun });
      output({ receipt, source: { id: imported.source.id, parameterId: imported.source.parameterId, valueHash: imported.source.valueHash } });
    } finally { await session.dispose(); }
  });

program.command('init')
  .argument('<directory>')
  .requiredOption('--title <title>')
  .requiredOption('--promise <promise>')
  .requiredOption('--proof <proof>', 'One verified proof point')
  .requiredOption('--action <action>', 'Desired viewer action')
  .option('--audience <audience>', 'Primary audience', 'Product buyers and users')
  .option('--mode <mode>', 'walkthrough, launch, pitch, or explainer', 'launch')
  .option('--duration <seconds>', 'Target duration', '30')
  .action(async (directory: string, options: { title: string; promise: string; proof: string; action: string; audience: string; mode: 'walkthrough' | 'launch' | 'pitch' | 'explainer'; duration: string }) => {
    output(await initializeProject(directory, { title: options.title, promise: options.promise, proof: options.proof, desiredAction: options.action, audience: options.audience, mode: options.mode, duration: Number(options.duration) }));
  });

program.command('project-read')
  .argument('<project>')
  .description('Read the authoritative Creative IR and revisions for a transactional edit')
  .action(async (input: string) => {
    const snapshot = await readProjectSnapshot(input);
    output({ projectFile: snapshot.projectFile, revision: snapshot.revision, documentRevision: snapshot.documentRevision, project: snapshot.sourceProject });
  });

program.command('edit')
  .argument('<project>')
  .requiredOption('--edits <json-file>', 'Semantic edits addressed by stable scene/composition and layer IDs')
  .requiredOption('--expected-revision <hash>', 'File revision returned by project-read')
  .option('--dry-run', 'Validate without committing')
  .option('--strict', 'Treat validation warnings as failures')
  .action(async (input: string, options: { edits: string; expectedRevision: string; dryRun?: boolean; strict?: boolean }) => {
    const edits = semanticEditSchema.array().min(1).max(500).parse(JSON.parse(await readFile(options.edits, 'utf8')));
    const { loaded, ...receipt } = await commitSemanticEdits(input, edits, { expectedRevision: options.expectedRevision, strict: options.strict ?? false, dryRun: options.dryRun ?? false, origin: 'cli' });
    output({ ...receipt, projectFile: loaded.projectFile });
  });

program.command('editing-session')
  .argument('<project>')
  .requiredOption('--command <json-file>', 'Typed read, inspect, can, apply, undo, redo or checkpoint command')
  .option('--checkpoint <json-file>', 'Restore bounded history from a matching document revision')
  .option('--include-checkpoint', 'Return a checkpoint for the next invocation')
  .action(async (input: string, options: { command: string; checkpoint?: string; includeCheckpoint?: boolean }) => {
    const command = editingCommandSchema.parse(JSON.parse(await readFile(options.command, 'utf8')));
    const session = new EditingSession(filesystemEditingAdapter(input));
    try {
      if (options.checkpoint) await session.restore(editingCheckpointSchema.parse(JSON.parse(await readFile(options.checkpoint, 'utf8'))));
      const result = await executeEditingCommand(session, command);
      output({ result, ...(options.includeCheckpoint ? { checkpoint: await session.checkpoint() } : {}) });
    } finally { await session.dispose(); }
  });

program.command('studio-session')
  .argument('<project>')
  .requiredOption('--command <json-file>', 'Typed live Studio capabilities, context, navigation or editing command')
  .action(async (input: string, options: { command: string }) => {
    const command = studioBridgeCommandSchema.parse(JSON.parse(await readFile(options.command, 'utf8')));
    output(await executeStudioCommand(input, command));
  });

program.command('project-patch')
  .argument('<project>')
  .requiredOption('--operations <json-file>', 'File containing an ordered RFC 6902 patch array')
  .requiredOption('--expected-revision <hash>', 'File revision returned by project-read')
  .option('--dry-run', 'Validate and return the proposed revision without committing')
  .option('--strict', 'Treat validation warnings as failures')
  .action(async (input: string, options: { operations: string; expectedRevision: string; dryRun?: boolean; strict?: boolean }) => {
    const operations = patchOperationSchema.array().min(1).max(500).parse(JSON.parse(await readFile(options.operations, 'utf8')));
    const { loaded, ...receipt } = await commitProject(input, { expectedRevision: options.expectedRevision, update: (project) => applyPatch(project, operations), dryRun: options.dryRun ?? false, strict: options.strict ?? false, origin: 'cli' });
    output({ ...receipt, projectFile: loaded.projectFile, operationsApplied: operations.length });
  });

program.command('project-save')
  .argument('<project>')
  .requiredOption('--document <file>', 'Proposed Creative IR JSON or YAML document')
  .requiredOption('--expected-revision <hash>', 'File revision returned by project-read')
  .option('--dry-run', 'Validate without committing')
  .option('--strict', 'Treat validation warnings as failures')
  .action(async (input: string, options: { document: string; expectedRevision: string; dryRun?: boolean; strict?: boolean }) => {
    const source = await readFile(options.document, 'utf8');
    const document: unknown = /\.ya?ml$/i.test(options.document) ? YAML.parse(source) : JSON.parse(source);
    const { loaded, ...receipt } = await commitProject(input, { expectedRevision: options.expectedRevision, update: () => document, dryRun: options.dryRun ?? false, strict: options.strict ?? false, origin: 'cli' });
    output({ ...receipt, projectFile: loaded.projectFile });
  });

program.command('validate').alias('check')
  .argument('<project>')
  .option('--strict', 'Treat warnings as failures')
  .option('--params <json>', 'Typed parameter overrides as a JSON object')
  .option('--variant <id>', 'Named project variant')
  .action(async (input: string, options: { strict?: boolean; params?: string; variant?: string }) => {
    const loaded = await loadConfiguredProject(input, options);
    const findings = await validateProject(loaded);
    output({ ok: !hasErrors(findings) && (!options.strict || findings.length === 0), summary: summarizeProject(loaded.project), findings });
    if (hasErrors(findings) || (options.strict && findings.length > 0)) process.exitCode = 1;
  });

program.command('review-samples')
  .argument('<project>')
  .option('--max-samples <count>', 'Maximum deterministic review samples', '240')
  .action(async (input: string, options: { maxSamples: string }) => {
    const loaded = await loadProject(input);
    output(reviewSamplePlan(loaded.project, Number.parseInt(options.maxSamples, 10)));
  });

program.command('render-plan')
  .argument('<project>')
  .option('--quality <quality>', 'draft, standard or high', 'high')
  .option('--codec <codec>', 'h264, h265, vp9 or prores', 'h264')
  .option('--filename <name>', 'Planned output filename')
  .option('--resolution <size>', 'Even WIDTHxHEIGHT preserving project aspect')
  .option('--scene <id>', 'Plan one scene')
  .option('--composition <id>', 'Plan one standalone composition')
  .option('--range <start:end>', 'Exclusive frame range')
  .option('--alpha <mode>', 'auto, preserve or flatten', 'auto')
  .option('--alpha-background <color>', 'Opaque flattening color')
  .option('--hardware-acceleration', 'Declare hardware encoder requirement')
  .action(async (input: string, options: { quality: RenderQuality; codec: VideoCodec; filename?: string; resolution?: string; scene?: string; composition?: string; range?: string; alpha: 'auto' | 'preserve' | 'flatten'; alphaBackground?: string; hardwareAcceleration?: boolean }) => {
    const range = options.range ? parseFrameRange(options.range) : undefined;
    output(await createRenderPlan(await loadProject(input), { quality: options.quality, codec: options.codec, filename: options.filename, resolution: options.resolution ? parseResolution(options.resolution) : undefined, sceneId: options.scene, compositionId: options.composition, range, alphaMode: options.alpha, alphaBackground: options.alphaBackground, hardwareAcceleration: options.hardwareAcceleration ?? false }));
  });

program.command('check-report')
  .argument('<project>')
  .option('--max-samples <count>', 'Maximum deterministic review samples', '240')
  .action(async (input: string, options: { maxSamples: string }) => output(await createCheckReport(await loadProject(input), { maxSamples: Number.parseInt(options.maxSamples, 10) })));

program.command('output-compatibility')
  .option('--codec <codec>')
  .option('--filename <name>')
  .option('--resolution <size>')
  .option('--alpha <mode>', 'auto, preserve or flatten', 'auto')
  .option('--hardware-acceleration')
  .action((options: { codec?: VideoCodec; filename?: string; resolution?: string; alpha: 'auto' | 'preserve' | 'flatten'; hardwareAcceleration?: boolean }) => {
    if (!options.codec) { output(outputCompatibilityMatrix); return; }
    if (!options.filename || !options.resolution) throw new GenmotionError('COMPATIBILITY_INPUT_REQUIRED', 'A codec check requires filename and resolution.');
    output(resolveOutputCompatibility({ codec: options.codec, filename: options.filename, ...parseResolution(options.resolution), alphaMode: options.alpha, hardwareAcceleration: options.hardwareAcceleration ?? false }));
  });

program.command('frame')
  .argument('<project>')
  .requiredOption('--at <seconds>')
  .option('--subframe', 'Evaluate the exact timestamp without rounding to a frame')
  .requiredOption('--output <file>')
  .option('--params <json>', 'Typed parameter overrides as a JSON object')
  .option('--group <scene/layer>', 'Isolate a layer and its parented descendants on the source canvas')
  .option('--composition <id>', 'Render a still on a standalone composition local timeline')
  .option('--variant <id>', 'Named project variant')
  .action(async (input: string, options: { at: string; subframe?: boolean; output: string; params?: string; variant?: string; composition?: string; group?: string }) => {
    const loaded = await loadConfiguredProject(input, options);
    if (options.group && options.composition) throw new GenmotionError('RENDER_SELECTION_CONFLICT', 'Choose a group or a standalone composition.');
    loaded.project = projectForRenderComposition(loaded.project, options.composition);
    const frame = secondsToFrames(Number(options.at), loaded.project.fps, options.subframe ? 'none' : 'floor');
    if (options.subframe && Number(options.at) >= loaded.project.scenes.reduce((sum, scene) => sum + scene.duration, 0)) throw new GenmotionError('FRAME_OUTSIDE_COMPOSITION', 'Exact timestamp must be inside the composition.');
    const png = await renderFramePng(loaded.project, loaded.projectDir, frame, undefined, resolveRenderView(loaded.project, parseRenderGroup(options.group)));
    const destination = path.resolve(options.output);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, png);
    output({ output: destination, frame, at: frame / loaded.project.fps });
  });

program.command('render')
  .argument('<project>')
  .option('--output <file>', 'Explicit output path; defaults to the resolved project output name in renders/')
  .option('--quality <quality>', 'draft, standard, or high', 'high')
  .option('--codec <codec>', 'h264, h265, vp9, or prores', 'h264')
  .option('--alpha-mode <mode>', 'auto, preserve, or flatten', 'auto')
  .option('--alpha-background <color>', 'Opaque background used when flattening transparency')
  .option('--workers <count>', 'Frame workers')
  .option('--max-buffered-frames <count>', 'Maximum reserved frames, including in-flight work')
  .option('--max-buffered-bytes <bytes>', 'Maximum reserved RGBA frame bytes')
  .option('--timeout-ms <milliseconds>', 'Cancel the entire render pipeline after this deadline')
  .option('--resolution <WIDTHxHEIGHT>', 'Exact even-sized output resolution; must preserve the project aspect ratio')
  .option('--group <scene/layer>', 'Isolate a layer and its parented descendants on the source canvas')
  .option('--composition <id>', 'Render a standalone composition on its local canvas')
  .option('--scene <id>', 'Render the scene interval in the full timeline')
  .option('--frames <start:end>', 'Integer source-frame interval with an exclusive end')
  .option('--hardware', 'Require a platform hardware encoder')
  .option('--params <json>', 'Typed parameter overrides as a JSON object')
  .option('--variant <id>', 'Named project variant')
  .action(async (input: string, options: { output?: string; quality: RenderQuality; codec: VideoCodec; alphaMode?: string; alphaBackground?: string; workers?: string; maxBufferedFrames?: string; maxBufferedBytes?: string; timeoutMs?: string; resolution?: string; hardware?: boolean; params?: string; variant?: string; scene?: string; composition?: string; group?: string; frames?: string }) => {
    let range: { startFrame: number; endFrame: number } | undefined;
    if (options.frames) { const match = /^(\d+):(\d+)$/.exec(options.frames); if (!match) throw new GenmotionError('INVALID_RENDER_RANGE', 'Frames must use start:end with an exclusive end.'); range = { startFrame: Number(match[1]), endFrame: Number(match[2]) }; }
    const loaded = await loadConfiguredProject(input, options);
    const findings = await validateProject(loaded);
    if (hasErrors(findings)) throw new GenmotionError('VALIDATION_FAILED', 'Render blocked by validation errors.', findings);
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    process.once('SIGINT', abort);
    process.once('SIGTERM', abort);
    let lastReport = 0;
    try {
      const result = await renderProject(loaded, {
        output: options.output, sceneId: options.scene, compositionId: options.composition, group: parseRenderGroup(options.group), range, quality: options.quality, codec: options.codec, alphaMode: alphaModeSchema.parse(options.alphaMode ?? "auto"), alphaBackground: options.alphaBackground,
        ...(options.workers ? { workers: Number(options.workers) } : {}),
        ...(options.maxBufferedFrames !== undefined ? { maxBufferedFrames: Number(options.maxBufferedFrames) } : {}),
        ...(options.maxBufferedBytes !== undefined ? { maxBufferedBytes: Number(options.maxBufferedBytes) } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: Number(options.timeoutMs) } : {}),
        ...(options.resolution ? { resolution: parseResolution(options.resolution) } : {}),
        hardwareAcceleration: options.hardware ?? false, signal: controller.signal,
        onProgress: (progress) => {
          if (program.opts<{ json?: boolean }>().json || performance.now() - lastReport < 500) return;
          lastReport = performance.now();
          process.stderr.write(`\r${progress.stage}: ${String(progress.encodedFrames)}/${String(progress.totalFrames)} frames · ${progress.fps.toFixed(1)} fps`);
        },
      });
      if (!program.opts<{ json?: boolean }>().json) process.stderr.write('\n');
      output(result);
    } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  });

program.command('audio-analyze <media>')
  .description('Analyze a local audio/video source: stereo waveform pyramids, frequency bands, transients, silence and estimated beats.')
  .option('--options <json>', 'Analysis window and detection settings', '{}')
  .action(async (media: string, options: { options: string }) => {
    const controller = new AbortController(), abort = (): void => controller.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    try { output(await analyzeAudioFile(path.resolve(media), audioAnalysisOptionsSchema.parse(JSON.parse(options.options)), { signal: controller.signal })); }
    finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  });

program.command('audio-measure')
  .argument('<input>', 'Project directory/document or local audio/video file')
  .option('--media', 'Measure a media file directly instead of a project mix')
  .option('--params <json>', 'Typed parameter overrides')
  .option('--variant <id>', 'Named project variant')
  .action(async (input: string, options: { media?: boolean; params?: string; variant?: string }) => {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    try {
      if (options.media) output(await measureAudioFile(path.resolve(input), { signal: controller.signal }));
      else {
        const loaded = await loadConfiguredProject(input, options);
        const findings = await validateProject(loaded);
        if (hasErrors(findings)) throw new GenmotionError('VALIDATION_FAILED', 'Project failed audio analysis validation.', findings);
        output(await measureProjectAudio(loaded.project, loaded.projectDir, { signal: controller.signal }));
      }
    } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  });

program.command('audio-render')
  .argument('<project>')
  .requiredOption('--output <file>', 'Processed mix: WAV, FLAC, M4A or Opus')
  .option('--params <json>', 'Typed parameter overrides')
  .option('--variant <id>', 'Named project variant')
  .option('--stem <kind>', 'Pre-master float WAV stem: music, voice, sfx or source')
  .action(async (input: string, options: { output: string; params?: string; variant?: string; stem?: 'music' | 'voice' | 'sfx' | 'source' }) => {
    const loaded = await loadConfiguredProject(input, options);
    const findings = await validateProject(loaded);
    if (hasErrors(findings)) throw new GenmotionError('VALIDATION_FAILED', 'Project failed audio export validation.', findings);
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    try { output(await renderAudio(loaded.project, loaded.projectDir, options.output, { signal: controller.signal, ...(options.stem ? { stem: options.stem } : {}) })); }
    finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  });

program.command('easing-copy')
  .argument('<project>')
  .requiredOption('--address <json>', 'Stable scene/composition, optional layer ID, and easing property path')
  .action(async (input: string, options: { address: string }) => {
    const snapshot = await readProjectSnapshot(input);
    output({ revision: snapshot.revision, easing: copyEasing(snapshot.sourceProject, easingAddressSchema.parse(JSON.parse(options.address))) });
  });

program.command('easing-paste')
  .argument('<project>')
  .requiredOption('--address <json>', 'Stable easing destination address')
  .requiredOption('--easing <json>', 'Copied easing JSON')
  .requiredOption('--expected-revision <revision>', 'Revision from project-read or easing-copy')
  .option('--dry-run', 'Validate without writing')
  .action(async (input: string, options: { address: string; easing: string; expectedRevision: string; dryRun?: boolean }) => {
    const { loaded: _loaded, ...receipt } = await commitEasing(input, easingAddressSchema.parse(JSON.parse(options.address)), easingSchema.parse(JSON.parse(options.easing)), { expectedRevision: options.expectedRevision, dryRun: options.dryRun ?? false, origin: 'cli' });
    void _loaded; output(receipt);
  });

program.command('path-operate')
  .argument('<path-data>')
  .requiredOption('--operations <json>', 'Ordered native boolean, stroke, round, transform, trim or dash operations')
  .action((data: string, options: { operations: string }) => {
    const result = applyPathOperations(data, pathOperationsSchema.parse(JSON.parse(options.operations)));
    output({ path: result, ...pathMetrics(result) });
  });

program.command('path-inspect')
  .description('Parse SVG path data and return absolute geometry without flattening curves or joining subpaths.')
  .argument('<path-data>')
  .option('--progress <fraction>', 'Position to sample along the path', '0.5')
  .action((data: string, options: { progress: string }) => {
    const progress = Number(options.progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Path progress must be between zero and one.');
    output({ commands: parseSvgPath(data), absolute: absoluteSvgPath(data), normalized: normalizePath(data), ...pathMetrics(data), sample: samplePath(data, progress) });
  });

program.command('variants')
  .description('Validate, expand, import, or export named parameter configurations without changing the project.')
  .argument('<project>')
  .option('--matrix <file>', 'JSON object mapping parameter names to arrays of values')
  .option('--input <file>', 'CSV or JSON configurations to validate and convert')
  .option('--format <format>', 'Output format: json or csv', 'json')
  .option('--output <file>', 'Write configurations to this file')
  .action(async (input: string, options: { matrix?: string; input?: string; format: string; output?: string }) => {
    if (options.matrix && options.input) throw new Error('Choose either --matrix or --input.');
    if (options.format !== 'json' && options.format !== 'csv') throw new Error('Variant format must be json or csv.');
    const loaded = await loadProject(input);
    const variants = options.matrix
      ? expandParameterMatrix(loaded.sourceProject, JSON.parse(await readFile(options.matrix, 'utf8')) as Record<string, ParameterValue[]>)
      : importParameterVariants(loaded.sourceProject, options.input ? await readFile(options.input, 'utf8') : JSON.stringify(loaded.sourceProject.variants), options.input?.toLowerCase().endsWith('.csv') ? 'csv' : 'json');
    const content = exportParameterVariants(variants, options.format);
    if (options.output) { await writeFile(path.resolve(options.output), content); output({ output: path.resolve(options.output), count: variants.length }); }
    else if (options.format === 'json') output({ variants });
    else process.stdout.write(content);
  });

program.command('render-variants')
  .description('Render every named project variant deterministically from one Creative IR document.')
  .argument('<project>')
  .requiredOption('--output <directory>')
  .option('--quality <quality>', 'draft, standard, or high', 'high')
  .option('--codec <codec>', 'h264, h265, vp9, or prores', 'h264')
  .option('--alpha-mode <mode>', 'auto, preserve, or flatten', 'auto')
  .option('--alpha-background <color>', 'Opaque background used when flattening transparency')
  .option('--workers <count>', 'Frame workers')
  .option('--max-buffered-frames <count>', 'Maximum reserved frames per render')
  .option('--max-buffered-bytes <bytes>', 'Maximum reserved RGBA frame bytes per render')
  .option('--timeout-ms <milliseconds>', 'Deadline for each variant render')
  .action(async (input: string, options: { output: string; quality: RenderQuality; codec: VideoCodec; alphaMode?: string; alphaBackground?: string; workers?: string; maxBufferedFrames?: string; maxBufferedBytes?: string; timeoutMs?: string }) => {
    const source = await loadProject(input);
    if (source.sourceProject.variants.length === 0) throw new GenmotionError('VARIANTS_EMPTY', 'The project defines no named variants.');
    const directory = path.resolve(options.output); await mkdir(directory, { recursive: true });
    const results = [];
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    try {
      for (const variant of source.sourceProject.variants) {
        const loaded = await loadProject(input, variant.values);
        const findings = await validateProject(loaded);
        if (hasErrors(findings)) throw new GenmotionError('VALIDATION_FAILED', `Variant ${variant.id} failed validation.`, findings);
        results.push({ variant: variant.id, ...await renderProject(loaded, {
          output: path.join(directory, `${source.sourceProject.id}-${variant.id}${defaultVideoExtension(options.codec)}`), quality: options.quality, codec: options.codec, alphaMode: alphaModeSchema.parse(options.alphaMode ?? "auto"), alphaBackground: options.alphaBackground,
          signal: controller.signal, workers: options.workers === undefined ? undefined : Number(options.workers),
          maxBufferedFrames: options.maxBufferedFrames === undefined ? undefined : Number(options.maxBufferedFrames),
          maxBufferedBytes: options.maxBufferedBytes === undefined ? undefined : Number(options.maxBufferedBytes),
          timeoutMs: options.timeoutMs === undefined ? undefined : Number(options.timeoutMs),
        }) });
      }
      output({ output: directory, variants: results });
    } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  });

program.command('preview')
  .argument('<project>')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--port <port>', 'Bind port', '4178')
  .option('--params <json>', 'Typed parameter overrides as a JSON object')
  .option('--variant <id>', 'Named project variant')
  .action(async (input: string, options: { host: string; port: string; params?: string; variant?: string }) => {
    const loaded = await loadConfiguredProject(input, options);
    const preview = await startPreview(loaded, { host: options.host, port: Number(options.port) });
    output({ url: preview.url });
    await new Promise<void>((resolve) => { const stop = (): void => { void preview.close().then(resolve); }; process.once('SIGINT', stop); process.once('SIGTERM', stop); });
  });

function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

program.command('studio')
  .description('Open the local human-in-the-loop workflow and timeline editor.')
  .argument('<project>')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--port <port>', 'Bind port', '4180')
  .option('--public-url <url>', 'Public origin for redirects behind a reverse proxy (or set GENMOTION_STUDIO_PUBLIC_URL)')
  .option('--workspace <directory>', 'Local project workspace', path.join(os.homedir(), 'Genmotion Projects'))
  .option('--no-open', 'Do not open the system browser')
  .action(async (input: string, options: { host: string; port: string; publicUrl?: string; workspace: string; open: boolean }) => {
    const loaded = await loadProject(input);
    const studio = await startStudio(loaded, { host: options.host, port: Number(options.port), workspaceRoot: options.workspace, ...(options.publicUrl ? { publicUrl: options.publicUrl } : {}) });
    output({ url: studio.url, project: loaded.projectFile });
    if (options.open) openBrowser(studio.url);
    await new Promise<void>((resolve) => { const stop = (): void => { void studio.close().then(resolve); }; process.once('SIGINT', stop); process.once('SIGTERM', stop); });
  });

program.command('requests')
  .description('List human change requests queued from Genmotion Studio.')
  .argument('<project>')
  .option('--pending', 'Only show pending requests')
  .action(async (input: string, options: { pending?: boolean }) => {
    const loaded = await loadProject(input);
    const requests = await getStudioRequests(loaded.projectDir);
    output(options.pending ? requests.filter((request) => ['pending', 'queued', 'running'].includes(request.status)) : requests);
  });

program.command('request-resolve')
  .description('Resolve a Studio change request after applying and validating the requested edit.')
  .argument('<project>')
  .requiredOption('--id <id>', 'Request id')
  .requiredOption('--response <response>', 'Concise summary of the completed change')
  .action(async (input: string, options: { id: string; response: string }) => {
    const loaded = await loadProject(input);
    output(await resolveStudioRequest(loaded.projectDir, options.id, options.response));
  });

program.command('catalog')
  .argument('[query]', 'Describe the creative move, role, or mood', '')
  .option('--limit <count>', 'Maximum results', '12')
  .action((query: string, options: { limit: string }) => { output(searchCatalog(query, Number(options.limit))); });

program.command('catalog-describe <type> <id>')
  .description('Inspect one catalog item before applying it')
  .action((type: 'motion' | 'blueprint' | 'reference', id: string) => { output(describeCatalogItem(type, id)); });

program.command('doctor').action(async () => {
  const checks = await doctor();
  output({ ok: checks.every((check) => check.ok), checks });
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
});

program.command('media-conform <source>')
  .description('Create a separate verified SDR BT.709 media derivative with explicit color assumptions and constant frame rate.')
  .requiredOption('--output <file>', 'New .mov (ProRes) or .mp4 (H.264) output')
  .requiredOption('--options <json>', 'Conforming options including fps')
  .option('--dry-run', 'Inspect the planned conversion without writing a derivative')
  .action(async (source: string, options: { output: string; options: string; dryRun?: boolean }) => {
    const configuration = mediaConformOptionsSchema.parse(JSON.parse(options.options)), controller = new AbortController(), abort = (): void => controller.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    try { output(options.dryRun ? mediaConformPlan(await inspectMedia(path.resolve(source), { signal: controller.signal }), configuration) : await conformMedia(source, options.output, configuration, { signal: controller.signal })); }
    finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  });

program.command('media-info <source>').description('Inspect audio/video streams, display geometry, codecs, color tags, HDR transfer and timing metadata.').action(async (source: string) => output(await inspectMedia(path.resolve(source))));

program.command('probe')
  .argument('<video>')
  .action(async (file: string) => { output(await probeVideo(file)); });

program.command('contact-sheet')
  .argument('<video>')
  .requiredOption('--output <file>')
  .option('--count <count>', 'Number of representative frames', '12')
  .option('--columns <columns>', 'Sheet columns', '4')
  .action(async (file: string, options: { output: string; count: string; columns: string }) => {
    await makeContactSheet(file, options.output, Number(options.count), Number(options.columns));
    output({ output: path.resolve(options.output), source: path.resolve(file) });
  });

program.command('benchmark')
  .argument('<project>')
  .option('--frames <count>', 'Maximum frames', '60')
  .action(async (input: string, options: { frames: string }) => {
    const loaded = await loadProject(input);
    const frames = Math.max(1, Number(options.frames));
    const seconds = frames / loaded.project.fps;
    const firstScene = loaded.project.scenes[0];
    if (!firstScene) throw new Error('Project has no scenes.');
    loaded.project = { ...loaded.project, scenes: [{ ...firstScene, duration: Math.min(firstScene.duration, seconds), transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' } }], audio: [] };
    const directory = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'genmotion-benchmark-')));
    try {
      const result = await renderProject(loaded, { output: path.join(directory, 'benchmark.mp4'), quality: 'draft', workers: Math.min(4, os.availableParallelism()) });
      output(result);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

program.command('easing-inspect')
  .description('Measure and sample a physical spring easing without rendering.')
  .option('--preset <name>', 'gentle, snappy, settled, or expressive', 'settled')
  .option('--spring <json>', 'Explicit spring JSON overrides the preset')
  .option('--samples <count>', 'Sample count', '60')
  .action((options: { preset: keyof typeof easingPresets; spring?: string; samples: string }) => {
    const source: unknown = options.spring ? JSON.parse(options.spring) : easingPresets[options.preset];
    if (!source) throw new GenmotionError('EASING_PRESET_UNKNOWN', `Unknown easing preset: ${options.preset}`);
    const spring = easingSchema.parse(source);
    if (typeof spring === 'string' || spring.type !== 'spring') throw new GenmotionError('SPRING_REQUIRED', 'easing-inspect requires a spring easing.');
    output({ preset: options.spring ? undefined : options.preset, ...analyzeSpring(spring, Number(options.samples)) });
  });

program.command('bundle <project>')
  .description('Create a verified content-addressed project and dependency snapshot.')
  .requiredOption('--output <directory>', 'Directory holding immutable bundle IDs')
  .option('--max-bytes <bytes>', 'Maximum total dependency bytes', String(32 * 1024 ** 3))
  .action(async (input: string, options: { output: string; maxBytes: string }) => {
    const controller = new AbortController(), abort = () => controller.abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    try { output(await createProjectBundle(await loadProject(input), path.resolve(options.output), { maxBytes: Number(options.maxBytes), signal: controller.signal })); }
    finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
  });
program.command('bundle-restore <directory>')
  .description('Restore a verified bundle into a new editable project directory.')
  .requiredOption('--output <directory>')
  .action(async (directory: string, options: { output: string }) => output(await restoreProjectBundle(path.resolve(directory), path.resolve(options.output))));
program.command('bundle-verify <directory>')
  .description('Verify manifest identity, dependency hashes and declared source closure.')
  .action(async (directory: string) => output(await verifyProjectBundle(path.resolve(directory))));

program.command('lut-import <project> <file>')
  .description('Freeze a local CUBE source and return a compact native LUT payload.')
  .requiredOption('--input-space <space>', 'srgb or linear-srgb')
  .requiredOption('--output-space <space>', 'srgb or linear-srgb')
  .option('--interpolation <mode>', 'tetrahedral or trilinear', 'tetrahedral')
  .action(async (input: string, file: string, options: { inputSpace: string; outputSpace: string; interpolation: string }) => {
    const project = await loadProject(input);
    if ((await stat(file)).size > 32 * 1024 ** 2) throw new Error('CUBE input exceeds 32 MiB');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(file));
    output({ lut: await importCubeLut(project.projectDir, text, { inputColorSpace: lookupTableSchema.shape.inputColorSpace.parse(options.inputSpace), outputColorSpace: lookupTableSchema.shape.outputColorSpace.parse(options.outputSpace), interpolation: lookupTableSchema.shape.interpolation.parse(options.interpolation) }) });
  });

program.command('markers <project>')
  .description('Read editorial markers/ranges or replace them in a revision-checked transaction.')
  .option('--file <json>', 'JSON object containing markers and/or ranges')
  .option('--expected-revision <hash>', 'Current file revision for updates')
  .action(async (input: string, options: { file?: string; expectedRevision?: string }) => {
    if (options.file) {
      if (!options.expectedRevision) throw new GenmotionError('REVISION_REQUIRED', 'Marker updates require --expected-revision.');
      const update = z.object({ markers: timelineMarkersSchema.optional(), ranges: timelineRangesSchema.optional() }).strict().parse(JSON.parse(await readFile(options.file, 'utf8')));
      await commitProject(input, { expectedRevision: options.expectedRevision, origin: 'cli', update: (project) => ({ ...project, ...update }) });
    }
    const snapshot = await readProjectSnapshot(input);
    output({ revision: snapshot.revision, markers: (snapshot.sourceProject.markers ?? []).map((marker) => { try { return { ...marker, globalTime: globalMarkerTime(marker, snapshot.sourceProject.scenes) }; } catch (error) { return { ...marker, error: error instanceof Error ? error.message : String(error) }; } }), ranges: snapshot.sourceProject.ranges ?? [] });
  });

program.command('effects')
  .description('List native visual effect support, parameters and working-memory estimates.')
  .option('--stack <json>', 'Inspect a JSON effects array')
  .option('--width <pixels>', 'Output width', '1920')
  .option('--height <pixels>', 'Output height', '1080')
  .action(async (options: { stack?: string; width: string; height: string }) => {
    if (options.stack) output(estimateEffectStack(visualEffectsSchema.parse(JSON.parse(await readFile(options.stack, 'utf8'))), Number(options.width), Number(options.height)));
    else output(visualEffectTypeSchema.options.map(visualEffectCapabilities));
  });

program.command('production <project>')
  .description('Inspect resumable workflow stages and storyboard, or apply a revision-checked production action.')
  .option('--action-file <json>', 'Production action JSON file')
  .option('--expected-revision <hash>', 'Current file revision for mutations')
  .action(async (input: string, options: { actionFile?: string; expectedRevision?: string }) => {
    if (options.actionFile) {
      if (!options.expectedRevision) throw new GenmotionError('REVISION_REQUIRED', 'Production changes require --expected-revision.');
      const action = productionActionSchema.parse(JSON.parse(await readFile(options.actionFile, 'utf8')));
      const receipt = await commitProductionAction(input, options.expectedRevision, action);
      output({ revision: receipt.revision, state: await inspectProduction(receipt.loaded) });
    } else { const snapshot = await readProjectSnapshot(input); output({ revision: snapshot.revision, state: await inspectProduction(snapshot) }); }
  });

program.command('brief <project>')
  .description('Inspect resumable production requirements or persist a versioned brief.')
  .option('--file <json>', 'Replace the production brief with this JSON file')
  .option('--expected-revision <hash>', 'Required file revision when replacing a brief')
  .action(async (input: string, options: { file?: string; expectedRevision?: string }) => {
    if (options.file) {
      if (!options.expectedRevision) throw new GenmotionError('REVISION_REQUIRED', 'Updating a production brief requires --expected-revision from project-read.');
      const brief = productionBriefSchema.parse(JSON.parse(await readFile(options.file, 'utf8')));
      const receipt = await commitProject(input, { expectedRevision: options.expectedRevision, origin: 'cli', update: (project) => ({ ...project, productionBrief: brief }) });
      output({ revision: receipt.revision, ...resumeProductionBrief(receipt.loaded.sourceProject.productionBrief) });
    } else {
      const snapshot = await readProjectSnapshot(input);
      output({ revision: snapshot.revision, ...resumeProductionBrief(snapshot.sourceProject.productionBrief) });
    }
  });

program.command('text-measure <project>')
  .description('Measure complete native text layout and overflow at a container timestamp.')
  .requiredOption('--container <id>')
  .requiredOption('--layer <id>')
  .option('--kind <kind>', 'scene or composition', 'scene')
  .option('--at <seconds>', 'Container-local timestamp', '0')
  .action(async (input: string, options: { container: string; layer: string; kind: 'scene' | 'composition'; at: string }) => {
    output(measureProjectText(await loadProject(input), { kind: options.kind, containerId: options.container, layerId: options.layer, at: Number(options.at) }));
  });

program.command('track-analyze <file>')
  .description('Sample a JSON animation track and its velocity and acceleration in seconds.')
  .option('--samples <count>', 'Samples from first to last key', '121')
  .option('--step <seconds>', 'Numerical derivative interval', '0.0001')
  .option('--seed <seed>', 'Project seed', '0')
  .action(async (file: string, options: { samples: string; step: string; seed: string }) => {
    const track = animationTrackSchema.parse(JSON.parse(await readFile(path.resolve(file), 'utf8')));
    output(analyzeTrack(track, { samples: Number(options.samples), step: Number(options.step), seed: Number(options.seed) }));
  });

program.command('stagger')
  .description('Generate a deterministic stagger schedule for reusable animation groups.')
  .requiredOption('--count <count>')
  .option('--each <seconds>', 'Delay between ordered items', '0.08')
  .option('--from <origin>', 'start, end, center, edges, random, or distance', 'start')
  .option('--positions <json>', 'Distance-mode item positions: [[x,y],...]')
  .option('--origin <json>', 'Distance origin [x,y]', '[0,0]')
  .option('--distance-unit <pixels>', 'Distance represented by each delay interval', '100')
  .option('--delay <seconds>', 'Initial delay before the schedule', '0')
  .option('--seed <seed>', 'Seed for random order', '0')
  .option('--trail <seconds>', 'Trail duration after each delay', '0')
  .option('--ease <name>', 'Named timing curve', 'linear')
  .action((options: { count: string; each: string; from: 'start' | 'end' | 'center' | 'edges' | 'random' | 'distance'; seed: string; trail: string; ease: string; positions?: string; origin: string; distanceUnit: string; delay: string }) => {
    const timing = easingSchema.parse(options.ease);
    const point = z.tuple([z.number().finite(), z.number().finite()]);
    const settings = { each: Number(options.each), from: options.from, seed: Number(options.seed), trail: Number(options.trail), ease: timing, origin: point.parse(JSON.parse(options.origin)), distanceUnit: Number(options.distanceUnit), delay: Number(options.delay), ...(options.positions ? { positions: z.array(point).max(100_000).parse(JSON.parse(options.positions)) } : {}) };
    output({ schedule: staggerSchedule(Number(options.count), settings), windows: staggerWindows(Number(options.count), settings) });
  });

program.command('noise')
  .description('Sample deterministic seeded one- to four-dimensional smooth noise.')
  .requiredOption('--coordinates <csv>', 'One to four comma-separated coordinates')
  .option('--seed <seed>', 'Deterministic seed', '0')
  .option('--octaves <count>', 'Fractal octaves', '1')
  .option('--lacunarity <value>', 'Frequency multiplier', '2')
  .option('--gain <value>', 'Amplitude multiplier', '0.5')
  .action((options: { coordinates: string; seed: string; octaves: string; lacunarity: string; gain: string }) => {
    const coordinates = options.coordinates.split(',').map(Number);
    const seed = Number(options.seed);
    output({ seed, coordinates, random: seededRandom(seed), noise: noiseND(seed, coordinates), fractal: fractalNoise(seed, coordinates, { octaves: Number(options.octaves), lacunarity: Number(options.lacunarity), gain: Number(options.gain) }) });
  });

program.command('catalog-audit').description('Validate catalog cross-references and licenses.').action(() => {
  const result = auditCatalog();
  output(result);
  if (!result.ok) process.exitCode = 1;
});

program.command('captions-import')
  .description('Parse SRT, WebVTT, or timed JSON into Creative IR caption cues.')
  .argument('<file>')
  .option('--format <format>', 'srt, vtt, or json')
  .action(async (file: string, options: { format?: 'srt' | 'vtt' | 'json' }) => {
    const extension = path.extname(file).slice(1).toLowerCase();
    const format = options.format ?? (extension === 'vtt' ? 'vtt' : extension === 'json' ? 'json' : 'srt');
    output({ cues: parseCaptions(await readFile(file, 'utf8'), format) });
  });

program.command('captions-edit <file>')
  .description('Correct word timing/text, shift cue timing, paginate, or replace text in a timed caption JSON file.')
  .requiredOption('--action <json>', 'Typed caption edit action')
  .action(async (file: string, options: { action: string }) => { output(editCaptions(parseCaptions(await readFile(file, 'utf8'), 'json'), captionEditSchema.parse(JSON.parse(options.action)))); });

program.command('captions-export')
  .description('Export a caption layer as SRT, WebVTT, or timed JSON.')
  .argument('<project>')
  .requiredOption('--layer <id>')
  .requiredOption('--format <format>', 'srt, vtt, or json')
  .requiredOption('--output <file>')
  .action(async (input: string, options: { layer: string; format: 'srt' | 'vtt' | 'json'; output: string }) => {
    const loaded = await loadProject(input);
    const layer = [...loaded.sourceProject.scenes.flatMap((scene) => scene.layers), ...loaded.sourceProject.compositions.flatMap((composition) => composition.layers)].find((candidate) => candidate.id === options.layer);
    if (!layer || layer.type !== 'caption') throw new GenmotionError('CAPTION_LAYER_UNKNOWN', `No caption layer found with id ${options.layer}.`);
    const destination = path.resolve(options.output);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, serializeCaptions(layer.cues, options.format));
    output({ output: destination, cues: layer.cues.length, format: options.format });
  });

program.command('captions-delivery <project>')
  .description('Plan burned-in, sidecar, or embedded multilingual caption delivery.')
  .requiredOption('--mode <mode>', 'burned-in, sidecar, or embedded')
  .option('--languages <tags>', 'Comma-separated BCP 47 language tags')
  .option('--format <format>', 'srt or vtt', 'vtt')
  .option('--container <container>', 'mp4, mov, mkv, or webm')
  .action(async (input: string, options: { mode: 'burned-in' | 'sidecar' | 'embedded'; languages?: string; format: 'srt' | 'vtt'; container?: 'mp4' | 'mov' | 'mkv' | 'webm' }) => {
    output(createCaptionDeliveryPlan((await loadProject(input)).project, { mode: options.mode, format: options.format, ...(options.languages ? { languages: options.languages.split(',').map((item) => item.trim()) } : {}), ...(options.container ? { container: options.container } : {}) }));
  });

program.command('music-plan <features>')
  .description('Plan a source-bound music and lyric edit from frozen audio features.')
  .option('--lyrics <file>', 'Reviewed lyric cue JSON')
  .requiredOption('--options <json>', 'Music workflow options JSON')
  .action(async (features: string, options: { lyrics?: string; options: string }) => output(planMusicWorkflow(frozenAudioFeaturesSchema.parse(JSON.parse(await readFile(features, 'utf8'))), options.lyrics ? z.array(lyricCueSchema).parse(JSON.parse(await readFile(options.lyrics, 'utf8'))) : [], musicWorkflowOptionsSchema.parse(JSON.parse(options.options)))));

program.command('presentation-check <project> <manifest>')
  .description('Validate a native presentation manifest against stable project identities.')
  .option('--export-policy <json>', 'Also produce a deterministic video export plan')
  .action(async (input: string, manifestFile: string, options: { exportPolicy?: string }) => { const project = (await loadProject(input)).project, manifest = presentationManifestSchema.parse(JSON.parse(await readFile(manifestFile, 'utf8'))); output(options.exportPolicy ? planPresentationExport(project, manifest, presentationExportPolicySchema.parse(JSON.parse(options.exportPolicy))) : validatePresentationManifest(project, manifest)); });

async function main(): Promise<void> {
  try { await program.parseAsync(process.argv); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = error instanceof GenmotionError ? { ok: false, code: error.code, error: message, details: error.details } : { ok: false, code: 'UNEXPECTED', error: message };
    if (program.opts<{ json?: boolean }>().json) process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    else process.stderr.write(`Genmotion: ${message}\n`);
    process.exitCode = 1;
  }
}

if (isEntrypoint(import.meta.url, process.argv[1])) await main();
