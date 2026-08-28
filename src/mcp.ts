#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import YAML from 'yaml';
import { auditCatalog } from './catalog/audit.js';
import { searchCatalog } from './commands/catalog.js';
import { doctor } from './commands/doctor.js';
import { initializeProject } from './commands/init.js';
import { planProject } from './commands/plan.js';
import { renderFramePng } from './engine/draw.js';
import { makeContactSheet, probeVideo } from './engine/probe.js';
import { startPreview, type PreviewServer } from './engine/preview.js';
import { renderProject } from './engine/render.js';
import { GenmotionError } from './errors.js';
import { loadProject } from './ir/loader.js';
import { projectSchema } from './ir/schema.js';
import { applyPatch, patchOperationSchema } from './ir/patch.js';
import { hasErrors, summarizeProject, validateProject } from './ir/validate.js';
import { evaluateLayerTracks } from './engine/animation.js';
import { layerIsActive, locateScene } from './engine/timeline.js';
import { getStudioRequests, resolveStudioRequest, startStudio, type StudioServer } from './studio/server.js';
import { GENMOTION_VERSION } from './version.js';

type ToolValue = Record<string, unknown>;
const qualitySchema = z.enum(['draft', 'standard', 'high']);
const codecSchema = z.enum(['h264', 'h265', 'vp9', 'prores']);
const resolutionSchema = z.object({ width: z.number().int().min(2).max(8192), height: z.number().int().min(2).max(8192) }).strict();

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

function revision(content: string): string {
  return createHash('sha256').update(content).digest('hex');
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

function serverFactory(): McpServer {
  const server = new McpServer({ name: 'genmotion', version: GENMOTION_VERSION }, { capabilities: { tools: {} } });
  const previews = new Map<string, PreviewServer>();
  const studios = new Map<string, StudioServer>();

  server.registerTool('genmotion_doctor', {
    title: 'Check Genmotion runtime', description: 'Verify FFmpeg, ffprobe, Node.js, and renderer readiness.', inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true },
  }, async () => { const checks = await doctor(); return toolResult({ ok: checks.every((check) => check.ok), checks }); });

  server.registerTool('genmotion_init', {
    title: 'Create Genmotion project', description: 'Create a neutral Genmotion artboard and truth-linked creative brief for the calling agent to author. No canned scene design is generated.',
    inputSchema: z.object({ directory: z.string().min(1), title: z.string().min(1), promise: z.string().min(1), proof: z.string().min(1), action: z.string().min(1), audience: z.string().min(1), mode: z.enum(['walkthrough', 'launch', 'pitch', 'explainer']), duration: z.number().positive().max(3600) }).strict(),
  }, async (input) => toolResult(await initializeProject(await allowedPath(input.directory, 'Project directory'), { title: input.title, promise: input.promise, proof: input.proof, desiredAction: input.action, audience: input.audience, mode: input.mode, duration: input.duration })));

  server.registerTool('genmotion_plan', {
    title: 'Build offline concept scaffold', description: 'Optional compatibility scaffold for unattended CLI use. Agent workflows should inspect the brief, author the Creative IR directly, and visually iterate with frame tools.',
    inputSchema: z.object({ project: z.string().min(1), brief: z.string().min(1), concepts: z.number().int().min(2).max(24).default(8) }).strict(),
  }, async (input) => toolResult(await planProject(await allowedPath(input.project, 'Project'), await allowedPath(input.brief, 'Brief'), input.concepts)));

  server.registerTool('genmotion_catalog', {
    title: 'Search motion catalog', description: 'Search Genmotion motions, scene blueprints, and taste references by creative intent.',
    inputSchema: z.object({ query: z.string().default(''), limit: z.number().int().min(1).max(50).default(12) }).strict(), annotations: { readOnlyHint: true },
  }, (input) => Promise.resolve(toolResult({ results: searchCatalog(input.query, input.limit) })));

  server.registerTool('genmotion_catalog_audit', {
    title: 'Audit motion catalog', description: 'Validate catalog implementations, references, and licenses.', inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true },
  }, () => Promise.resolve(toolResult({ ...auditCatalog() })));

  server.registerTool('genmotion_project_read', {
    title: 'Read Genmotion project', description: 'Read the authoritative Creative IR with its revision for safe agent editing.', inputSchema: z.object({ project: z.string().min(1) }).strict(), annotations: { readOnlyHint: true },
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const source = await readFile(loaded.projectFile, 'utf8');
    return toolResult({ projectFile: loaded.projectFile, projectDir: loaded.projectDir, revision: revision(source), project: loaded.sourceProject, summary: summarizeProject(loaded.project) });
  });

  server.registerTool('genmotion_schema', {
    title: 'Inspect Genmotion authoring schema', description: 'Return the complete machine-readable Creative IR schema and open-ended animation capabilities for agent authoring.', inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true },
  }, () => Promise.resolve(toolResult({
    schema: z.toJSONSchema(projectSchema),
    authoring: {
      model: 'Agents may author complete projects, granular RFC 6902 patches, arbitrary numeric property tracks, custom cubic-bezier and spring easing, and SVG path geometry.',
      recipePolicy: 'Named recipes are optional reusable references. Direct tracks are first-class and require no recipe.',
      visualLoop: ['genmotion_project_read', 'genmotion_project_patch', 'genmotion_validate', 'genmotion_frame', 'genmotion_timeline_inspect'],
    },
  })));

  server.registerTool('genmotion_project_save', {
    title: 'Save Genmotion project', description: 'Validate and atomically save Creative IR using optimistic revision locking and recoverable history.',
    inputSchema: z.object({ project: z.string().min(1), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), document: z.unknown(), strict: z.boolean().default(true) }).strict(),
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const current = await readFile(loaded.projectFile, 'utf8');
    const currentRevision = revision(current);
    if (currentRevision !== input.expectedRevision) throw new GenmotionError('REVISION_CONFLICT', 'The project changed after it was read. Read the latest revision and reconcile the edit.', { expected: input.expectedRevision, actual: currentRevision });
    const parsed = projectSchema.parse(input.document);
    const serialized = /\.ya?ml$/i.test(loaded.projectFile) ? YAML.stringify(parsed) : `${JSON.stringify(parsed, null, 2)}\n`;
    const extension = path.extname(loaded.projectFile);
    const temporary = path.join(path.dirname(loaded.projectFile), `.${path.basename(loaded.projectFile, extension)}.${randomUUID()}.tmp${extension}`);
    await writeFile(temporary, serialized, { flag: 'wx' });
    try {
      const proposed = await loadProject(temporary);
      const findings = await validateProject(proposed);
      if (hasErrors(findings) || (input.strict && findings.length > 0)) throw new GenmotionError('VALIDATION_FAILED', 'Project save blocked by validation findings.', findings);
      const historyDir = path.join(loaded.projectDir, '.genmotion', 'history');
      await mkdir(historyDir, { recursive: true });
      await writeFile(path.join(historyDir, `${new Date().toISOString().replaceAll(':', '-')}-${currentRevision.slice(0, 12)}${path.extname(loaded.projectFile)}`), current, { flag: 'wx' });
      await rename(temporary, loaded.projectFile);
      return toolResult({ projectFile: loaded.projectFile, revision: revision(serialized), findings });
    } catch (error) {
      const { rm } = await import('node:fs/promises');
      await rm(temporary, { force: true });
      throw error;
    }
  });

  server.registerTool('genmotion_project_patch', {
    title: 'Patch Genmotion project', description: 'Apply an ordered RFC 6902 transaction to the Creative IR, validate it, preserve history, and reject stale revisions. Use this for precise agent iteration instead of rewriting the entire project.',
    inputSchema: z.object({ project: z.string().min(1), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), operations: z.array(patchOperationSchema).min(1).max(500), strict: z.boolean().default(true) }).strict(),
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const current = await readFile(loaded.projectFile, 'utf8');
    const currentRevision = revision(current);
    if (currentRevision !== input.expectedRevision) throw new GenmotionError('REVISION_CONFLICT', 'The project changed after it was read. Read the latest revision and reconcile the edit.', { expected: input.expectedRevision, actual: currentRevision });
    const document = applyPatch(loaded.sourceProject, input.operations);
    const parsed = projectSchema.parse(document);
    const serialized = /\.ya?ml$/i.test(loaded.projectFile) ? YAML.stringify(parsed) : `${JSON.stringify(parsed, null, 2)}\n`;
    const extension = path.extname(loaded.projectFile);
    const temporary = path.join(path.dirname(loaded.projectFile), `.${path.basename(loaded.projectFile, extension)}.${randomUUID()}.tmp${extension}`);
    await writeFile(temporary, serialized, { flag: 'wx' });
    try {
      const proposed = await loadProject(temporary);
      const findings = await validateProject(proposed);
      if (hasErrors(findings) || (input.strict && findings.length > 0)) throw new GenmotionError('VALIDATION_FAILED', 'Project patch blocked by validation findings.', findings);
      const historyDir = path.join(loaded.projectDir, '.genmotion', 'history');
      await mkdir(historyDir, { recursive: true });
      await writeFile(path.join(historyDir, `${new Date().toISOString().replaceAll(':', '-')}-${currentRevision.slice(0, 12)}${extension}`), current, { flag: 'wx' });
      await rename(temporary, loaded.projectFile);
      return toolResult({ projectFile: loaded.projectFile, revision: revision(serialized), operationsApplied: input.operations.length, findings, summary: summarizeProject(proposed.project) });
    } catch (error) {
      const { rm } = await import('node:fs/promises');
      await rm(temporary, { force: true });
      throw error;
    }
  });

  server.registerTool('genmotion_validate', {
    title: 'Validate Genmotion project', description: 'Validate Creative IR, assets, layout, timing, motion ownership, and delivery constraints.',
    inputSchema: z.object({ project: z.string().min(1), strict: z.boolean().default(true) }).strict(), annotations: { readOnlyHint: true },
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const findings = await validateProject(loaded);
    return toolResult({ ok: !hasErrors(findings) && (!input.strict || findings.length === 0), summary: summarizeProject(loaded.project), findings });
  });

  server.registerTool('genmotion_frame', {
    title: 'Render Genmotion frame', description: 'Render an exact native PNG frame at a requested timestamp and optional delivery resolution.',
    inputSchema: z.object({ project: z.string().min(1), at: z.number().nonnegative(), output: z.string().min(1), resolution: resolutionSchema.optional() }).strict(),
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const destination = await allowedPath(input.output, 'Frame output');
    const frame = Math.min(Math.ceil(loaded.project.scenes.reduce((sum, scene) => sum + scene.duration, 0) * loaded.project.fps) - 1, Math.floor(input.at * loaded.project.fps));
    const png = await renderFramePng(loaded.project, loaded.projectDir, frame, input.resolution);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, png);
    return imageToolResult({ output: destination, frame, at: frame / loaded.project.fps, resolution: input.resolution ?? { width: loaded.project.width, height: loaded.project.height } }, [{ data: png, mimeType: 'image/png' }]);
  });

  server.registerTool('genmotion_timeline_inspect', {
    title: 'Inspect evaluated timeline', description: 'Evaluate the active scene and every visible layer at an exact time after recipe compilation and arbitrary property-track animation.',
    inputSchema: z.object({ project: z.string().min(1), at: z.number().nonnegative() }).strict(), annotations: { readOnlyHint: true },
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const active = locateScene(loaded.project, input.at);
    const layers = active.scene.layers.filter((layer) => layer.visible && layerIsActive(layer.start, layer.duration, active.scene.duration, active.localTime)).map((layer) => ({
      ...evaluateLayerTracks(layer, active.localTime - layer.start),
      localTime: active.localTime - layer.start,
    }));
    return toolResult({ at: input.at, scene: { id: active.scene.id, purpose: active.scene.purpose, localTime: active.localTime, globalStart: active.globalStart }, layers });
  });

  server.registerTool('genmotion_render', {
    title: 'Render Genmotion master', description: 'Validate and render a reproducible high-resolution video master. High quality guarantees at least a 1920-pixel long edge.',
    inputSchema: z.object({ project: z.string().min(1), output: z.string().min(1), quality: qualitySchema.default('high'), codec: codecSchema.default('h264'), resolution: resolutionSchema.optional(), workers: z.number().int().min(1).max(16).optional(), hardwareAcceleration: z.boolean().default(false), strict: z.boolean().default(true) }).strict(),
  }, async (input) => {
    const loaded = await loadProject(await allowedPath(input.project, 'Project'));
    const findings = await validateProject(loaded);
    if (hasErrors(findings) || (input.strict && findings.length > 0)) throw new GenmotionError('VALIDATION_FAILED', 'Render blocked by validation findings.', findings);
    const output = await allowedPath(input.output, 'Render output');
    const result = await renderProject(loaded, { output, quality: input.quality, codec: input.codec, ...(input.resolution ? { resolution: input.resolution } : {}), ...(input.workers ? { workers: input.workers } : {}), hardwareAcceleration: input.hardwareAcceleration });
    return toolResult({ ...result, probe: await probeVideo(result.output) });
  });

  server.registerTool('genmotion_probe', {
    title: 'Probe video', description: 'Inspect the encoded video contract including dimensions, frame rate, codecs, duration, and size.', inputSchema: z.object({ video: z.string().min(1) }).strict(), annotations: { readOnlyHint: true },
  }, async (input) => toolResult({ ...await probeVideo(await allowedPath(input.video, 'Video')) }));

  server.registerTool('genmotion_contact_sheet', {
    title: 'Create contact sheet', description: 'Create a representative contact sheet for visual review of a rendered video.',
    inputSchema: z.object({ video: z.string().min(1), output: z.string().min(1), count: z.number().int().min(4).max(40).default(12), columns: z.number().int().min(2).max(8).default(4) }).strict(),
  }, async (input) => {
    const video = await allowedPath(input.video, 'Video');
    const output = await allowedPath(input.output, 'Contact sheet output');
    await makeContactSheet(video, output, input.count, input.columns);
    return toolResult({ output, source: video, count: input.count, columns: input.columns });
  });

  server.registerTool('genmotion_requests', {
    title: 'List Studio requests', description: 'Read durable human requests captured by Genmotion Studio.', inputSchema: z.object({ project: z.string().min(1), pendingOnly: z.boolean().default(false) }).strict(), annotations: { readOnlyHint: true },
  }, async (input) => { const requests = await getStudioRequests(await allowedPath(input.project, 'Project')); return toolResult({ requests: input.pendingOnly ? requests.filter((item) => ['pending', 'queued', 'running'].includes(item.status)) : requests }); });

  server.registerTool('genmotion_request_resolve', {
    title: 'Resolve Studio request', description: 'Close a durable Studio request after its real project edit has been saved and verified.',
    inputSchema: z.object({ project: z.string().min(1), id: z.string().min(1), response: z.string().min(3).max(20_000) }).strict(),
  }, async (input) => toolResult({ request: await resolveStudioRequest(await allowedPath(input.project, 'Project'), input.id, input.response) }));

  server.registerTool('genmotion_preview_start', {
    title: 'Start native preview', description: 'Start a localhost-only native frame preview and return its URL.', inputSchema: z.object({ project: z.string().min(1), port: z.number().int().min(1024).max(65535).default(4178) }).strict(),
  }, async (input) => { const preview = await startPreview(await loadProject(await allowedPath(input.project, 'Project')), { host: '127.0.0.1', port: input.port }); const id = randomUUID(); previews.set(id, preview); return toolResult({ id, url: preview.url }); });

  server.registerTool('genmotion_studio_start', {
    title: 'Start Genmotion Studio', description: 'Start the localhost-only workflow and timeline editor for a project.', inputSchema: z.object({ project: z.string().min(1), port: z.number().int().min(1024).max(65535).default(4180), workspace: z.string().optional() }).strict(),
  }, async (input) => { const loaded = await loadProject(await allowedPath(input.project, 'Project')); const workspaceRoot = input.workspace ? await allowedPath(input.workspace, 'Studio workspace') : loaded.projectDir; const studio = await startStudio(loaded, { host: '127.0.0.1', port: input.port, workspaceRoot }); const id = randomUUID(); studios.set(id, studio); return toolResult({ id, url: studio.url, project: loaded.projectFile }); });

  server.registerTool('genmotion_server_stop', {
    title: 'Stop Genmotion local server', description: 'Stop a preview or Studio server previously started by this MCP connection.', inputSchema: z.object({ id: z.string().uuid() }).strict(),
  }, async (input) => { const instance = previews.get(input.id) ?? studios.get(input.id); if (!instance) throw new GenmotionError('SERVER_NOT_FOUND', 'No Genmotion server exists with that id.'); await instance.close(); previews.delete(input.id); studios.delete(input.id); return toolResult({ stopped: true, id: input.id }); });

  return server;
}

serveStdio(serverFactory, { onerror: (error) => process.stderr.write(`[genmotion-mcp] ${error.message}\n`) });
