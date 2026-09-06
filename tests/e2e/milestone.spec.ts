import { test, expect } from '@playwright/test';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../../src/ir/loader.js';
import { startStudio, type StudioServer } from '../../src/studio/server.js';
import { startPreview, type PreviewServer } from '../../src/engine/preview.js';
import type { GenmotionPlayer } from '../../src/player.js';

let directory: string;
let studio: StudioServer | undefined;
let preview: PreviewServer | undefined;
test.beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-milestone-'));
  await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
});
test.afterEach(async () => {
  await studio?.close(); await preview?.close(); studio = undefined; preview = undefined;
  const relative = path.relative(os.tmpdir(), directory);
  if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('genmotion-milestone-')) await rm(directory, { recursive: true, force: true });
});

test('authors custom effects and masks, persists them and renders native pixels', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(studio.url);
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('#addVisualEffect').click();
  await page.locator('[data-visual-fx-choice="custom"]').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers[0]!.effects?.[0]?.type).toBe('custom');
  await page.locator('#addMask').click();
  await expect(page.locator('[data-field="masks.0.path"]')).toBeVisible();
  await page.locator('[data-field="masks.0.feather"]').fill('3');
  await page.locator('[data-field="masks.0.feather"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers[0]!.masks?.[0]?.feather).toBe(3);
  await page.reload();
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await expect(page.locator('[data-field="masks.0.feather"]')).toHaveValue('3');
  await page.screenshot({ path: 'output/playwright/milestone-effects.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('persists canvas guides and grid preferences across reload', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  await page.goto(studio.url);
  await page.getByRole('tab', { name: 'Editor', exact: true }).click(); await page.locator('#viewportSettings').click();
  await page.locator('#canvasGrid').check();
  await page.locator('#canvasSafeZone').selectOption('title');
  await page.locator('#addVerticalGuide').click();
  await expect(page.locator('[data-guide-position="0"]')).toHaveValue('160');
  await page.locator('#canvasZoom').fill('150'); await page.locator('#canvasZoom').press('Tab');
  await expect.poll(async () => {
    const { readFile } = await import('node:fs/promises');
    return await readFile(path.join(directory, '.genmotion/studio.json'), 'utf8');
  }).toContain('1.5');
  await page.reload(); await page.getByRole('tab', { name: 'Editor', exact: true }).click(); await page.locator('#viewportSettings').click();
  await expect(page.locator('#canvasGrid')).toBeChecked();
  await expect(page.locator('#canvasSafeZone')).toHaveValue('title');
  await expect(page.locator('#canvasZoom')).toHaveValue('150');
});

test('Player renders, seeks, loops, switches parameters and disposes in a real browser', async ({ page }) => {
  preview = await startPreview(await loadProject(directory), { port: 0 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/embed', preview.url).href);
  await page.waitForFunction(() => Boolean((document.querySelector('genmotion-player') as HTMLElement & { player?: GenmotionPlayer })?.player?.metadata));
  const result = await page.evaluate(async () => {
    const host = document.querySelector('genmotion-player') as HTMLElement & { player: GenmotionPlayer };
    const player = host.player; await player.ready;
    await player.seek(.5); const seekFrame = player.frame;
    player.playbackRate = 2; player.volume = .3; player.muted = true;
    await player.setParameters({}); await player.seekFrame(29); await player.play();
    await new Promise<void>(resolve => player.addEventListener('loop', () => { player.pause(); resolve(); }, { once: true }));
    const source = player.image.src, width = player.image.naturalWidth;
    player.dispose();
    return { seekFrame, width, source, removed: !host.children.length, muted: player.muted };
  });
  expect(result).toMatchObject({ seekFrame: 15, width: 320, removed: true, muted: true });
  expect(result.source).toMatch(/^blob:/); expect(errors).toEqual([]);
});

test('edits caption words and timing, then persists a timeline marker', async ({ page }) => {
  const loaded = await loadProject(directory);
  const raw = structuredClone(loaded.sourceProject);
  raw.scenes[0]!.layers.push({ id: 'caption', type: 'caption', x: 10, y: 80, width: 300, height: 80, fontFamily: 'Arial', fontSize: 20, color: '#fff', cues: [{ id: 'cue', start: 0, end: .8, text: 'Hello world', words: [{ text: 'Hello', start: 0, end: .4 }, { text: 'world', start: .4, end: .8 }] }] } as typeof raw.scenes[0]['layers'][number]);
  await writeFile(loaded.projectFile, JSON.stringify(raw));
  studio = await startStudio(await loadProject(directory), { port: 0 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(studio.url);
  await page.locator('[data-select="layer"][data-id="caption"]').click();
  await page.locator('#editCaptionPages').click();
  await page.locator('#captionFind').fill('world'); await page.locator('#captionReplacement').fill('motion');
  await page.locator('#replaceCaptions').click();
  await expect.poll(async () => {
    const layer = (await loadProject(directory)).project.scenes[0]!.layers.find(layer => layer.id === 'caption');
    return layer?.type === 'caption' ? layer.cues[0]?.text : undefined;
  }).toBe('Hello motion');
  await page.locator('#captionShift').fill('0.1'); await page.locator('#shiftCaptions').click();
  await expect.poll(async () => {
    const layer = (await loadProject(directory)).project.scenes[0]!.layers.find(layer => layer.id === 'caption');
    return layer?.type === 'caption' ? layer.cues[0]?.start : undefined;
  }).toBe(.1);
  await page.keyboard.press('Escape');
  await page.locator('[data-select="project"]').click(); await page.locator('#openMarkers').click();
  await page.locator('#addTimelineMarker').click();
  await page.locator('[data-marker-field="0:label"]').fill('Review this');
  await page.locator('[data-marker-field="0:label"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).project.markers?.[0]?.label).toBe('Review this');
  expect(errors).toEqual([]);
});
