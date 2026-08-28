import { expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../../src/ir/loader.js';
import { startStudio, type StudioServer } from '../../src/studio/server.js';

let directory = '';
let studio: StudioServer | undefined;

test.beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-studio-browser-'));
  await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
  studio = await startStudio(await loadProject(directory), { port: 0 });
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

  await page.getByRole('button', { name: 'Editor' }).click();
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
  const phaseBox = await page.locator('[data-phase]').first().boundingBox();
  expect(phaseBox).not.toBeNull();
  if (phaseBox) {
    await page.mouse.move(phaseBox.x + phaseBox.width / 2, phaseBox.y + phaseBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(phaseBox.x + phaseBox.width / 2 + 70, phaseBox.y + phaseBox.height / 2, { steps: 4 });
    await page.mouse.up();
  }
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

  const request = page.getByPlaceholder('Describe a change, critique this scene, or ask for new directions');
  await request.fill('Make the selected proof hold longer and keep the landing frame still.');
  await request.press('Enter');
  await expect(page.getByText('Make the selected proof hold longer and keep the landing frame still.')).toBeVisible();
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
