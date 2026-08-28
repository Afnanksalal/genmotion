import { expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../../src/ir/loader.js';
import { startStudio, type StudioServer } from '../../src/studio/server.js';
import type { AgentRuntime } from '../../src/agent/runtime.js';

let directory = '';
let studio: StudioServer | undefined;
const agentRuntime: AgentRuntime = {
  hosts: () => Promise.resolve([{ id: 'codex', label: 'Codex', installed: true, authenticated: true, detail: 'Browser test session' }]),
  run: async (_input, onProgress) => {
    await onProgress({ activity: 'Responding', message: 'The selected scene was reviewed.', sessionId: 'browser-test-thread' });
    return { response: 'The selected scene was reviewed.', sessionId: 'browser-test-thread' };
  },
  close: () => Promise.resolve(),
};

test.beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-studio-browser-'));
  await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
  studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime, agentRuntimeFactory: () => agentRuntime, workspaceRoot: path.join(directory, 'workspace') });
});

test.afterEach(async () => {
  await studio?.close();
  await rm(directory, { recursive: true, force: true });
});

test('edits, previews, references, and queues contextual agent work', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(studio?.url ?? '');
  await expect(page.getByText('Creative brief')).toBeVisible();

  const title = page.locator('[data-field="title"]');
  await title.fill('Studio browser proof');
  await title.press('Tab');
  await expect.poll(async () => JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { title: string }).toMatchObject({ title: 'Studio browser proof' });

  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await page.locator('#scrubber').fill('15');
  await expect(page.locator('#previewImage')).toHaveJSProperty('naturalWidth', 320);
  await expect(page.getByText('Frame 15')).toBeVisible();

  const firstPhase = page.locator('[data-phase]').first();
  await expect(firstPhase).toBeVisible();
  await firstPhase.click();
  await expect(page.locator('#selectionKind')).toHaveText('motion');
  const phaseStart = page.locator('[data-field="motion.start"]');
  await phaseStart.fill('0.1');
  await phaseStart.press('Tab');
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ motion: Array<{ start: number }> }> }> };
    return project.scenes[0]?.layers[0]?.motion[0]?.start;
  }).toBe(0.1);
  await page.locator('[data-phase]').first().press('ArrowRight');
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ motion: Array<{ start: number }> }> }> };
    return project.scenes[0]?.layers[0]?.motion[0]?.start ?? 0;
  }).toBeGreaterThan(0.1);
  await expect(page.locator('[title]')).toHaveCount(0);

  await page.getByRole('button', { name: 'References' }).click();
  await page.locator('#referencePicker').setInputFiles({
    name: 'direction.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.locator('#referenceGrid').getByText('direction', { exact: true })).toBeVisible();

  const request = page.locator('#agentInput');
  await request.fill('Make the selected proof hold longer and keep the landing frame still.');
  await request.press('Enter');
  await expect(page.getByText('Make the selected proof hold longer and keep the landing frame still.')).toBeVisible();
  await expect(page.getByText('codex · Complete')).toBeVisible();
  await expect.poll(async () => {
    const files = await readdir(path.join(directory, '.genmotion', 'requests'));
    return files[0] ? readFile(path.join(directory, '.genmotion', 'requests', files[0]), 'utf8') : '';
  }).toContain('landing frame');
  expect(errors).toEqual([]);
});

test('keeps the inspector accessible at a compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto(studio?.url ?? '');
  await expect(page.getByRole('button', { name: 'Inspector' })).toBeVisible();
  await page.getByRole('button', { name: 'Inspector' }).click();
  await expect(page.locator('#inspector')).toHaveClass(/open/);
  await expect(page.locator('[data-field="title"]')).toBeVisible();
});

test('creates and opens a real project from the project switcher', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('#projectSwitch').click();
  await expect(page.locator('#projectPopover')).toContainText('Deterministic render');
  await page.getByRole('button', { name: /New project/ }).click();
  await page.locator('[data-field="newProject.title"]').fill('Studio launch');
  await page.locator('[data-field="newProject.audience"]').fill('Product teams');
  await page.locator('[data-field="newProject.promise"]').fill('Explain the product with clarity');
  await page.locator('[data-field="newProject.proof"]').fill('Captured product evidence');
  await page.locator('[data-field="newProject.desiredAction"]').fill('Start creating');
  await page.locator('#createProject').click();
  await expect(page.locator('#projectName')).toHaveText('Studio launch', { timeout: 15_000 });
  expect((await stat(path.join(directory, 'workspace', 'studio-launch', 'genmotion.json'))).isFile()).toBe(true);
});

test('moves, trims, snaps, resizes, and imports timeline media', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(studio?.url ?? '');
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(page.locator('#previewImage')).toHaveJSProperty('naturalWidth', 320);

  await page.locator('[data-layerclip="accent"]').click();
  const durationField = page.locator('[data-field="duration"]');
  await durationField.fill('0.7');
  await durationField.press('Tab');
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; duration?: number }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.duration;
  }).toBe(0.7);

  await page.locator('[data-layerclip="accent"]').press('ArrowRight');
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; start: number }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.start ?? 0;
  }).toBeCloseTo(1 / 30, 4);

  const layerBox = await page.locator('[data-layerclip="accent"]').boundingBox();
  expect(layerBox).not.toBeNull();
  if (layerBox) {
    await page.mouse.move(layerBox.x + layerBox.width / 2, layerBox.y + layerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(layerBox.x + layerBox.width / 2 + 45, layerBox.y + layerBox.height / 2, { steps: 5 });
    await page.mouse.up();
  }
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; start: number }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.start ?? 0;
  }).toBeGreaterThan(1 / 30);

  const trimHandle = page.locator('[data-layerclip="accent"] [data-layer-handle="right"]');
  await trimHandle.press('ArrowLeft');
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; duration?: number }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.duration ?? 1;
  }).toBeLessThan(0.7);

  const stageBox = await page.locator('[data-stage-layer="accent"]').boundingBox();
  expect(stageBox).not.toBeNull();
  if (stageBox) {
    await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + stageBox.width / 2 + 20, stageBox.y + stageBox.height / 2, { steps: 4 });
    await page.mouse.up();
  }
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; x: number }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.x ?? 18;
  }).toBeGreaterThan(18);

  const beforeWidth = await page.locator('[data-field="width"]').inputValue();
  const resizeHandle = page.locator('[data-stage-handle="se"]');
  await resizeHandle.press('Shift+ArrowLeft');
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; width: number }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.width ?? Number(beforeWidth);
  }).toBeLessThan(Number(beforeWidth));

  await expect(page.locator('#snapToggle')).toHaveClass(/active/);
  await page.locator('#snapToggle').click();
  await expect(page.locator('#snapToggle')).not.toHaveClass(/active/);
  await page.locator('#snapToggle').click();

  await page.getByRole('button', { name: 'Assets' }).click();
  await page.locator('#assetPicker').setInputFiles({ name: 'music.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF0000WAVEfmt ') });
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { audio: Array<{ id: string }> };
    return project.audio.length;
  }).toBe(1);
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(page.locator('[data-audioclip]')).toBeVisible();
  await page.locator('[data-audioclip]').press('ArrowRight');
  await expect(page.locator('#selectionKind')).toHaveText('audio');
  expect(errors).toEqual([]);
});

test('queues one export and announces completion once', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.locator('#startRender').evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(async () => {
    const jobs = await fetch(`${studio?.url ?? ''}/api/jobs`).then((response) => response.json()) as Array<{ status: string }>;
    return jobs.length;
  }).toBe(1);
  await expect(page.getByText(/Export ready:/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Export ready:/)).toHaveCount(1);
  await expect(page.locator('#renderProgress')).toContainText('Export complete');
  await expect(page.locator('#renderProgress').getByRole('button', { name: 'Show in folder' })).toBeVisible();
  await expect(page.locator('#startRender')).toHaveText('Export again');
});
