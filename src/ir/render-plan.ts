import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { defaultVideoExtension, resolveRenderRange, resolveRenderResolution, validateOutputContainer, type RenderQuality, type VideoCodec } from '../engine/render.js';
import { resolveAlphaOutput } from '../engine/alpha-output.js';
import { projectForRenderComposition } from '../engine/render-projection.js';
import { resolveRenderView } from '../engine/render-view.js';
import { renderFrameRangeSchema, renderGroupSchema } from './render-selection.js';
import { projectAssetReferences } from './asset-references.js';
import { resolveProjectAsset, type LoadedProject } from './loader.js';
import { projectPreflight } from './preflight.js';
import { assertReferenceExportAllowed, deliveryPurposeSchema } from './reference-rights.js';

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export interface RenderPlan {
  version: 1;
  sourceHash: string;
  preflight: ReturnType<typeof projectPreflight>;
  dependencies: Array<{ path: string; bytes: number; hash: string }>;
  dependencyHash: string;
  reproducibility: {
    node: string; platform: NodeJS.Platform; architecture: string; schemaVersion: number;
    renderer: { name: 'native-cpu'; canvasPackage: string }; encoder: { name: 'ffmpeg'; version: string };
    preparation: { modelDependencies: 'none'; dependencyHash: string };
  };
  variantValues: Record<string, unknown>;
  selection: { range: { startFrame: number; endFrame: number }; sceneId?: string; compositionId?: string; group?: { sceneId: string; layerId: string } };
  delivery: {
    quality: RenderQuality; codec: VideoCodec; container: string; dimensions: { width: number; height: number }; fps: number;
    color: { working: 'rgba8-srgb'; output: 'bt709-sdr'; alpha: ReturnType<typeof resolveAlphaOutput> };
    audio: { present: boolean; sampleRate: 48000; channels: 2; codec: 'aac' | 'opus' | 'pcm_s24le'; normalization: unknown };
    backend: { renderer: 'native-cpu'; encoder: 'ffmpeg'; hardwareAcceleration: boolean; temporalSamples: number };
    output: { filename: string; identity: string };
  };
}

export const renderPlanOptionsSchema = z.object({
  quality: z.enum(['draft', 'standard', 'high']).default('high'), codec: z.enum(['h264', 'h265', 'vp9', 'prores']).default('h264'),
  filename: z.string().min(1).max(240).optional(), resolution: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional(),
  range: renderFrameRangeSchema.optional(), sceneId: z.string().min(1).optional(), compositionId: z.string().min(1).optional(), group: renderGroupSchema.optional(),
  alphaMode: z.enum(['auto', 'preserve', 'flatten']).default('auto'), alphaBackground: z.string().optional(), hardwareAcceleration: z.boolean().default(false),
  deliveryPurpose: deliveryPurposeSchema.default('internal-review'),
}).strict();
export type RenderPlanOptions = z.input<typeof renderPlanOptionsSchema>;

async function runtimeEnvelope(dependencyHash: string): Promise<RenderPlan['reproducibility']> {
  const packageDocument = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> };
  const { runProcess } = await import('../engine/process.js');
  const version = (await runProcess('ffmpeg', ['-version'], undefined, { timeoutMs: 10_000, maxOutputBytes: 64 * 1024 })).stdout.split(/\r?\n/u)[0]?.trim() ?? 'unknown';
  return { node: process.version, platform: process.platform, architecture: process.arch, schemaVersion: 1, renderer: { name: 'native-cpu', canvasPackage: packageDocument.dependencies?.['@napi-rs/canvas'] ?? 'unknown' }, encoder: { name: 'ffmpeg', version }, preparation: { modelDependencies: 'none', dependencyHash } };
}

/** Frozen, read-only delivery inputs; callers must re-plan after any source change. */
export async function createRenderPlan(loaded: LoadedProject, input: RenderPlanOptions = {}): Promise<RenderPlan> {
  const options = renderPlanOptionsSchema.parse(input);
  if (options.compositionId && (options.sceneId || options.group)) throw new Error('Choose a scene, group or composition.');
  const project = projectForRenderComposition(loaded.project, options.compositionId);
  assertReferenceExportAllowed(project, options.deliveryPurpose);
  resolveRenderView(project, options.group);
  const range = resolveRenderRange(project, options), dimensions = resolveRenderResolution(project, options.quality, options.resolution);
  const filename = options.filename ?? `${project.outputName ?? project.id}${defaultVideoExtension(options.codec)}`;
  validateOutputContainer(filename, options.codec);
  const alpha = resolveAlphaOutput(options.codec, options.alphaMode, options.alphaBackground);
  const paths = projectAssetReferences(loaded.project).sort();
  const dependencies = await Promise.all(paths.map(async (relative) => {
    const file = resolveProjectAsset(loaded.projectDir, relative);
    const info = await stat(file);
    const source = await readFile(file);
    return { path: relative, bytes: info.size, hash: digest(source) };
  }));
  const sourceHash = digest(JSON.stringify(loaded.sourceProject)), dependencyHash = digest(JSON.stringify(dependencies));
  const reproducibility = await runtimeEnvelope(dependencyHash);
  const outputContract = { sourceHash, dependencyHash, parameters: project.parameterValues, range, dimensions, fps: project.fps, quality: options.quality, codec: options.codec, filename };
  return {
    version: 1, sourceHash, preflight: projectPreflight(project), dependencies, dependencyHash, reproducibility, variantValues: project.parameterValues,
    selection: { range, ...(options.sceneId ? { sceneId: options.sceneId } : {}), ...(options.compositionId ? { compositionId: options.compositionId } : {}), ...(options.group ? { group: options.group } : {}) },
    delivery: {
      quality: options.quality, codec: options.codec, container: path.extname(filename).slice(1), dimensions, fps: project.fps,
      color: { working: 'rgba8-srgb', output: 'bt709-sdr', alpha },
      audio: { present: project.audio.length > 0, sampleRate: 48000, channels: 2, codec: options.codec === 'vp9' ? 'opus' : options.codec === 'prores' ? 'pcm_s24le' : 'aac', normalization: project.audioNormalization ?? null },
      backend: { renderer: 'native-cpu', encoder: 'ffmpeg', hardwareAcceleration: options.hardwareAcceleration, temporalSamples: project.motionBlur?.samples ?? 1 },
      output: { filename, identity: digest(JSON.stringify(outputContract)) },
    },
  };
}

export async function verifyRenderPlanEnvironment(loaded: LoadedProject, plan: RenderPlan): Promise<{ compatible: boolean; mismatches: Array<{ field: string; expected: unknown; actual: unknown }> }> {
  const currentSource = digest(JSON.stringify(loaded.sourceProject));
  const paths = projectAssetReferences(loaded.project).sort();
  const dependencies = await Promise.all(paths.map(async relative => { const file = resolveProjectAsset(loaded.projectDir, relative); return { path: relative, bytes: (await stat(file)).size, hash: digest(await readFile(file)) }; }));
  const dependencyHash = digest(JSON.stringify(dependencies)), runtime = await runtimeEnvelope(dependencyHash);
  const comparisons: Array<[string, unknown, unknown]> = [
    ['sourceHash', plan.sourceHash, currentSource], ['dependencyHash', plan.dependencyHash, dependencyHash],
    ['node', plan.reproducibility.node, runtime.node], ['platform', plan.reproducibility.platform, runtime.platform], ['architecture', plan.reproducibility.architecture, runtime.architecture],
    ['schemaVersion', plan.reproducibility.schemaVersion, loaded.project.schemaVersion], ['renderer.canvasPackage', plan.reproducibility.renderer.canvasPackage, runtime.renderer.canvasPackage], ['encoder.version', plan.reproducibility.encoder.version, runtime.encoder.version],
  ];
  const mismatches = comparisons.filter(([, expected, actual]) => expected !== actual).map(([field, expected, actual]) => ({ field, expected, actual }));
  return { compatible: mismatches.length === 0, mismatches };
}
