import { cp, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

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
        'genmotion_doctor', 'genmotion_init', 'genmotion_plan', 'genmotion_catalog', 'genmotion_project_read', 'genmotion_project_save',
        'genmotion_schema', 'genmotion_project_patch', 'genmotion_timeline_inspect', 'genmotion_validate', 'genmotion_frame',
        'genmotion_render', 'genmotion_probe', 'genmotion_contact_sheet', 'genmotion_studio_start',
      ]));
      expect(new Set(names).size).toBe(names.length);

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

      const sheet = path.join(directory, 'contact-sheet.png');
      const contactSheet = await client.callTool({ name: 'genmotion_contact_sheet', arguments: { video, output: sheet, count: 4, columns: 2 } });
      expect(contactSheet.structuredContent).toMatchObject({ output: sheet, source: video });
    } finally {
      await client.close();
    }
  }, 30_000);
});
