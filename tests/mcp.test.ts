import { cp, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local test port.');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

describe('Genmotion MCP server', () => {
  it('exposes and executes the complete native motion workflow over stdio', async () => {
    const directory = await mkdtemp(path.resolve('.tmp-mcp-test-'));
    temporary.push(directory);
    const project = path.join(directory, 'project');
    await cp(path.resolve('tests/fixtures/basic'), project, { recursive: true });
    const client = new Client({ name: 'genmotion-test', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/mcp.js')], cwd: process.cwd(), stderr: 'pipe' });
    const diagnostics: string[] = [];
    transport.stderr?.on('data', (chunk: Buffer) => diagnostics.push(chunk.toString('utf8')));
    try { await client.connect(transport); }
    catch (error) { throw new Error(`MCP startup failed: ${diagnostics.join('')}`, { cause: error }); }
    try {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining([
        'genmotion_doctor', 'genmotion_init', 'genmotion_catalog', 'genmotion_project_read', 'genmotion_project_save',
        'genmotion_schema', 'genmotion_project_patch', 'genmotion_timeline_inspect', 'genmotion_validate', 'genmotion_frame',
        'genmotion_render', 'genmotion_render_plan', 'genmotion_check_report', 'genmotion_output_compatibility', 'genmotion_probe', 'genmotion_contact_sheet', 'genmotion_studio_start', 'genmotion_animation_inspect',
      ]));
      expect(new Set(names).size).toBe(names.length);
      const textLayout = await client.callTool({ name: 'genmotion_text_measure', arguments: { project, address: { containerId: 'intro', layerId: 'title' } } });
      expect(textLayout.structuredContent).toMatchObject({ fits: true, overflowX: false, overflowY: false });
      const measuredAudio = await client.callTool({ name: 'genmotion_audio_measure', arguments: { input: project } });
      expect(measuredAudio.structuredContent).toMatchObject({ silence: true, integratedLufs: null, truePeakDbtp: null });
      const saveTool = listed.tools.find((tool) => tool.name === 'genmotion_project_save');
      const saveProperties = saveTool?.inputSchema.properties as Record<string, { properties?: Record<string, unknown> }> | undefined;
      expect(Object.keys(saveProperties?.document?.properties ?? {})).toEqual(expect.arrayContaining(['scenes', 'brand']));

      const doctor = await client.callTool({ name: 'genmotion_doctor', arguments: {} });
      expect(doctor.structuredContent).toMatchObject({ ok: true });
      const catalog = await client.callTool({ name: 'genmotion_catalog', arguments: { query: 'editorial reveal', limit: 5 } });
      expect((catalog.structuredContent as { results: unknown[] }).results.length).toBeGreaterThan(0);
      const catalogAudit = await client.callTool({ name: 'genmotion_catalog_audit', arguments: {} });
      expect(catalogAudit.structuredContent).toMatchObject({ ok: true });

      const initializedDirectory = path.join(directory, 'initialized-by-tool');
      const initialized = await client.callTool({ name: 'genmotion_init', arguments: {
        directory: initializedDirectory, title: 'Tool-created launch', promise: 'Show the product clearly',
        proof: 'Native frames are inspectable', action: 'Review the composition', audience: 'Product teams', mode: 'launch', duration: 6,
      } });
      expect(initialized.structuredContent).toMatchObject({ directory: initializedDirectory });
      expect((await stat(path.join(initializedDirectory, 'brief.json'))).isFile()).toBe(true);

      const read = await client.callTool({ name: 'genmotion_project_read', arguments: { project } });
      expect(read.isError).not.toBe(true);
      expect(read.structuredContent).toMatchObject({ projectDir: project, summary: { resolution: '320x180' } });
      const readContent = read.structuredContent as { revision: string; project: Record<string, unknown> };
      const saved = await client.callTool({ name: 'genmotion_project_save', arguments: { project, expectedRevision: readContent.revision, document: { ...readContent.project, metadata: { mcpTest: 'saved' } }, strict: false } });
      expect(saved.isError).not.toBe(true);
      expect(saved.structuredContent).toMatchObject({ projectFile: path.join(project, 'genmotion.json') });
      const staleSave = await client.callTool({ name: 'genmotion_project_save', arguments: { project, expectedRevision: readContent.revision, document: readContent.project, strict: false } });
      expect(staleSave.isError).toBe(true);

      const schema = await client.callTool({ name: 'genmotion_schema', arguments: {} });
      const schemaContent = schema.structuredContent as { schema?: unknown; schemaSummary?: { fields?: Array<{ name: string; required: boolean }> }; authoring?: { recipePolicy?: string; transformSemantics?: string; canonicalExample?: { textLayer?: Record<string, unknown>; track?: Record<string, unknown> } } };
      expect(schemaContent.schema).toBeUndefined();
      expect(schemaContent.schemaSummary?.fields).toContainEqual(expect.objectContaining({ name: 'id', required: true }));
      expect(Buffer.byteLength(JSON.stringify(listed))).toBeLessThan(1024 * 1024);
      expect(schemaContent.authoring?.recipePolicy).toContain('optional');
      expect(schemaContent.authoring?.transformSemantics).toContain('additional offsets');
      expect(schemaContent.authoring?.canonicalExample?.textLayer).toMatchObject({ width: 1440, fontFamily: 'Arial', color: '#f7f5ef' });
      expect(schemaContent.authoring?.canonicalExample?.track).toMatchObject({ target: 'transform.y', keyframes: [{ at: 0 }, { at: 0.8 }] });
      const fullSchema = await client.callTool({ name: 'genmotion_schema', arguments: { full: true } });
      expect((fullSchema.structuredContent as { schema?: unknown }).schema).toBeDefined();
      const savedContent = saved.structuredContent as { revision: string };
      const patched = await client.callTool({ name: 'genmotion_project_patch', arguments: { project, expectedRevision: savedContent.revision, operations: [{ op: 'add', path: '/metadata/agentic', value: 'true' }], strict: false } });
      expect(patched.structuredContent).toMatchObject({ operationsApplied: 1 });

      const target = { kind: 'scene', id: 'intro', layerId: 'title' };
      const inspected = await client.callTool({ name: 'genmotion_edit_inspect', arguments: { project, target } });
      expect(inspected.structuredContent).toMatchObject({ target, layer: { type: 'text' } });
      const refused = await client.callTool({ name: 'genmotion_edit_capability', arguments: { project, edit: { op: 'text', target: { ...target, layerId: 'accent' }, text: 'Wrong target' } } });
      expect(refused.structuredContent).toMatchObject({ allowed: false, code: 'EDIT_UNSUPPORTED' });
      const expectedRevision = (patched.structuredContent as { revision: string }).revision;
      const edits = [{ op: 'text', target, text: 'Tool edit' }];
      const proposal = await client.callTool({ name: 'genmotion_edit', arguments: { project, expectedRevision, edits, strict: false, dryRun: true } });
      expect(proposal.structuredContent).toMatchObject({ state: 'validated', changed: true, persisted: false });
      const applied = await client.callTool({ name: 'genmotion_edit', arguments: { project, expectedRevision, edits, strict: false } });
      expect(applied.structuredContent).toMatchObject({ state: 'saved', changed: true, affectedTargets: [target] });
      const afterEdit = applied.structuredContent as { revision: string; inverse: unknown[] };
      const undo = await client.callTool({ name: 'genmotion_project_patch', arguments: { project, expectedRevision: afterEdit.revision, operations: afterEdit.inverse, strict: false } });
      expect(undo.isError).not.toBe(true);

      const easingAddress = { kind: 'scene', id: 'intro', path: ['transitionOut', 'timing'] };
      const copiedEasing = await client.callTool({ name: 'genmotion_easing_copy', arguments: { project, address: easingAddress } });
      expect(copiedEasing.structuredContent).toMatchObject({ easing: 'linear' });
      const easingRevision = (copiedEasing.structuredContent as { revision: string }).revision;
      const pastedEasing = await client.callTool({ name: 'genmotion_easing_paste', arguments: { project, address: easingAddress, easing: 'sine-out', expectedRevision: easingRevision } });
      expect(pastedEasing.structuredContent).toMatchObject({ state: 'saved', changed: true });
      const configurations = await client.callTool({ name: 'genmotion_variants', arguments: { project, matrix: {} } });
      expect(configurations.structuredContent).toMatchObject({ variants: [{ id: 'variant-0001', values: {} }] });
      const booleanPath = await client.callTool({ name: 'genmotion_path_operate', arguments: { path: 'M10 10H60V60H10Z', operations: [{ op: 'subtract', path: 'M20 20H50V50H20Z' }] } });
      expect(booleanPath.structuredContent).toMatchObject({ bounds: { x: 10, y: 10, width: 50, height: 50 } });

      const timeline = await client.callTool({ name: 'genmotion_timeline_inspect', arguments: { project, at: 0.5 } });
      const timelineContent = timeline.structuredContent as { scene?: { id?: string }; layers?: unknown[] };
      expect(timelineContent.scene?.id).toBe('intro');
      expect(Array.isArray(timelineContent.layers)).toBe(true);

      const spring = await client.callTool({ name: 'genmotion_animation_inspect', arguments: { action: 'spring', preset: 'snappy', samples: 12 } });
      const springContent = spring.structuredContent as { preset: string; samples: unknown[] };
      expect(springContent.preset).toBe('snappy');
      expect(springContent.samples).toHaveLength(12);
      const stagger = await client.callTool({ name: 'genmotion_animation_inspect', arguments: { action: 'stagger', count: 4, each: 0.1, trail: 0.25, from: 'center', seed: 2, ease: 'linear' } });
      const staggerContent = stagger.structuredContent as { schedule: number[]; windows: unknown[] };
      expect(staggerContent.schedule).toEqual([0.15000000000000002, 0.05, 0.05, 0.15000000000000002]);
      expect(staggerContent.windows).toHaveLength(4);
      const kinematics = await client.callTool({ name: 'genmotion_animation_inspect', arguments: { action: 'kinematics', track: { id: 'speed', target: 'x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 10 }] }, options: { samples: 3 } } });
      expect((kinematics.structuredContent as { samples: Array<{ velocity: number[] }> }).samples[1]!.velocity[0]).toBeCloseTo(10, 6);
      const spatial = await client.callTool({ name: 'genmotion_animation_inspect', arguments: { action: 'stagger', count: 2, each: 0.1, delay: 0.3, trail: 0.2, from: 'distance', positions: [[0, 0], [300, 400]], distanceUnit: 100 } });
      expect(spatial.structuredContent).toMatchObject({ schedule: [0.3, 0.8], windows: [{ index: 0, delay: 0.3, trailEnd: 0.5 }, { index: 1, delay: 0.8, trailEnd: 1 }] });
      const typedTrack = await client.callTool({ name: 'genmotion_animation_inspect', arguments: { action: 'track', at: 0.5, seed: 1, track: { id: 'color', target: 'fill', keyframes: [{ at: 0, value: '#ff0000' }, { at: 1, value: '#0000ff' }] } } });
      expect((typedTrack.structuredContent as { value: string }).value).toMatch(/^rgb/);

      const validation = await client.callTool({ name: 'genmotion_validate', arguments: { project, strict: false } });
      expect(validation.structuredContent).toMatchObject({ ok: true });
      const renderPlan = await client.callTool({ name: 'genmotion_render_plan', arguments: { project, quality: 'draft', codec: 'h264', filename: 'planned.mp4' } });
      expect(renderPlan.structuredContent).toMatchObject({ version: 1, delivery: { quality: 'draft', codec: 'h264', output: { filename: 'planned.mp4' } } });
      const checkReport = await client.callTool({ name: 'genmotion_check_report', arguments: { project, maxSamples: 20 } });
      expect(checkReport.structuredContent).toMatchObject({ version: 1, incompleteChecks: [], sampling: { coverage: 'complete' } });
      const compatibility = await client.callTool({ name: 'genmotion_output_compatibility', arguments: { contract: { codec: 'vp9', filename: 'alpha.webm', width: 640, height: 360, alphaMode: 'preserve' } } });
      expect(compatibility.structuredContent).toMatchObject({ compatible: true, pixelFormat: 'yuva420p', fallback: null });

      const frame = path.join(directory, 'review.png');
      const frameResult = await client.callTool({ name: 'genmotion_frame', arguments: { project, at: 0.5, output: frame, resolution: { width: 640, height: 360 } } });
      const subframe = await client.callTool({ name: 'genmotion_frame', arguments: { project, at: 0.35, subframe: true, output: path.join(directory, 'subframe.png') } });
      expect(subframe.structuredContent).toMatchObject({ at: 0.35, frame: 10.5 });
      expect(frameResult.structuredContent).toMatchObject({ output: frame, resolution: { width: 640, height: 360 } });
      expect(frameResult.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image', mimeType: 'image/png' })]));

      const video = path.join(directory, 'tool-render.mp4');
      const render = await client.callTool({ name: 'genmotion_render', arguments: { project, output: video, quality: 'high', resolution: { width: 640, height: 360 }, workers: 2, strict: false } });
      expect(render.structuredContent).toMatchObject({ width: 640, height: 360, quality: 'high', probe: { width: 640, height: 360, videoCodec: 'h264' } });
      const audioOutput = path.join(directory, 'tool-mix.wav');
      const audioRender = await client.callTool({ name: 'genmotion_audio_render', arguments: { project, output: audioOutput } });
      expect(audioRender.structuredContent).toMatchObject({ output: audioOutput, duration: 1 });
      expect((await stat(audioOutput)).size).toBeGreaterThan(44);

      const probe = await client.callTool({ name: 'genmotion_probe', arguments: { video } });
      expect(probe.structuredContent).toMatchObject({ width: 640, height: 360, videoCodec: 'h264' });
      const linkSnapshot = await client.callTool({ name: 'genmotion_project_read', arguments: { project } });
      const linkEdit = await client.callTool({ name: 'genmotion_edit', arguments: { project, expectedRevision: (linkSnapshot.structuredContent as { revision: string }).revision, edits: [{ op: 'property', target: { kind: 'scene', id: 'intro', layerId: 'accent' }, path: ['propertyLinks'], value: [{ target: 'transform.x', sourceLayerId: 'title', sourceProperty: 'transform.x', scale: 1, offset: 7, enabled: true }] }], strict: false } });
      expect(linkEdit.isError).not.toBe(true);
      const linkedTimeline = await client.callTool({ name: 'genmotion_timeline_inspect', arguments: { project, at: .5 } });
      const linkedLayers = (linkedTimeline.structuredContent as { layers: Array<{ id: string; transform: { x: number } }> }).layers;
      expect(linkedLayers.find((layer) => layer.id === 'accent')!.transform.x).toBe(linkedLayers.find((layer) => layer.id === 'title')!.transform.x + 7);
      const briefSnapshot = await client.callTool({ name: 'genmotion_brief', arguments: { project } });
      expect(briefSnapshot.structuredContent).toMatchObject({ missing: ['destination', 'aspect', 'language', 'audience', 'message', 'duration'] });
      const briefSaved = await client.callTool({ name: 'genmotion_brief', arguments: { project, expectedRevision: (briefSnapshot.structuredContent as { revision: string }).revision, brief: { version: 1, message: { value: 'Native agentic motion', origin: 'user' }, language: { value: 'en', origin: 'inferred' } } } });
      expect(briefSaved.structuredContent).toMatchObject({ userStated: ['message'], inferred: ['language'], resolved: ['language', 'message'] });

      const sheet = path.join(directory, 'contact-sheet.png');
      const contactSheet = await client.callTool({ name: 'genmotion_contact_sheet', arguments: { video, output: sheet, count: 4, columns: 2 } });
      expect(contactSheet.structuredContent).toMatchObject({ output: sheet, source: video });

      const previewPort = await availablePort();
      const preview = await client.callTool({ name: 'genmotion_preview_start', arguments: { project, port: previewPort } });
      const previewContent = preview.structuredContent as { id: string; url: string };
      expect((await fetch(previewContent.url)).status).toBe(200);
      expect((await client.callTool({ name: 'genmotion_server_stop', arguments: { id: previewContent.id } })).structuredContent).toMatchObject({ stopped: true, id: previewContent.id });

      const studioPort = await availablePort();
      const studio = await client.callTool({ name: 'genmotion_studio_start', arguments: { project, port: studioPort, workspace: directory } });
      const studioContent = studio.structuredContent as { id: string; url: string };
      const token = (await fetch(`${studioContent.url}/api/session`).then((response) => response.json()) as { token: string }).token;
      const queued = await fetch(`${studioContent.url}/api/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-genmotion-token': token },
        body: JSON.stringify({ prompt: 'Make the proof hold longer.', selection: { sceneId: 'intro', frame: 12 } }),
      });
      expect(queued.status).toBe(201);
      const request = await queued.json() as { id: string };
      const requests = await client.callTool({ name: 'genmotion_requests', arguments: { project, pendingOnly: true } });
      expect(requests.structuredContent).toMatchObject({ requests: [expect.objectContaining({ id: request.id, status: 'pending' })] });
      const resolved = await client.callTool({ name: 'genmotion_request_resolve', arguments: { project, id: request.id, response: 'Extended and visually verified the proof hold.' } });
      expect(resolved.structuredContent).toMatchObject({ request: { id: request.id, status: 'resolved' } });
      expect((await client.callTool({ name: 'genmotion_server_stop', arguments: { id: studioContent.id } })).structuredContent).toMatchObject({ stopped: true, id: studioContent.id });

      const forbidden = await client.callTool({ name: 'genmotion_project_read', arguments: { project: path.join(path.parse(process.cwd()).root, 'genmotion-forbidden') } });
      expect(forbidden.isError).toBe(true);
    } catch (error) { throw new Error(`MCP workflow failed: ${diagnostics.join('')}`, { cause: error }); } finally {
      await client.close();
    }
  }, process.platform === 'win32' ? 90_000 : 45_000);
});
