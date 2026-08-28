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
    await client.connect(transport);
    try {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining([
        'genmotion_doctor', 'genmotion_init', 'genmotion_catalog', 'genmotion_project_read', 'genmotion_project_save',
        'genmotion_schema', 'genmotion_project_patch', 'genmotion_timeline_inspect', 'genmotion_validate', 'genmotion_frame',
        'genmotion_render', 'genmotion_probe', 'genmotion_contact_sheet', 'genmotion_studio_start',
      ]));
      expect(new Set(names).size).toBe(names.length);

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
      const schemaContent = schema.structuredContent as { authoring?: { recipePolicy?: string } };
      expect(schemaContent.authoring?.recipePolicy).toContain('optional');
      const savedContent = saved.structuredContent as { revision: string };
      const patched = await client.callTool({ name: 'genmotion_project_patch', arguments: { project, expectedRevision: savedContent.revision, operations: [{ op: 'add', path: '/metadata/agentic', value: 'true' }], strict: false } });
      expect(patched.structuredContent).toMatchObject({ operationsApplied: 1 });

      const timeline = await client.callTool({ name: 'genmotion_timeline_inspect', arguments: { project, at: 0.5 } });
      const timelineContent = timeline.structuredContent as { scene?: { id?: string }; layers?: unknown[] };
      expect(timelineContent.scene?.id).toBe('intro');
      expect(Array.isArray(timelineContent.layers)).toBe(true);

      const validation = await client.callTool({ name: 'genmotion_validate', arguments: { project, strict: false } });
      expect(validation.structuredContent).toMatchObject({ ok: true });

      const frame = path.join(directory, 'review.png');
      const frameResult = await client.callTool({ name: 'genmotion_frame', arguments: { project, at: 0.5, output: frame, resolution: { width: 640, height: 360 } } });
      expect(frameResult.structuredContent).toMatchObject({ output: frame, resolution: { width: 640, height: 360 } });
      expect(frameResult.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image', mimeType: 'image/png' })]));

      const video = path.join(directory, 'tool-render.mp4');
      const render = await client.callTool({ name: 'genmotion_render', arguments: { project, output: video, quality: 'high', resolution: { width: 640, height: 360 }, workers: 2, strict: false } });
      expect(render.structuredContent).toMatchObject({ width: 640, height: 360, quality: 'high', probe: { width: 640, height: 360, videoCodec: 'h264' } });

      const probe = await client.callTool({ name: 'genmotion_probe', arguments: { video } });
      expect(probe.structuredContent).toMatchObject({ width: 640, height: 360, videoCodec: 'h264' });

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
    } finally {
      await client.close();
    }
  }, 30_000);
});
