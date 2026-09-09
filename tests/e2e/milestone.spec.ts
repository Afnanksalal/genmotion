import { test, expect } from '@playwright/test';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../../src/ir/loader.js';
import { startStudio, type StudioServer } from '../../src/studio/server.js';
import { startPreview, type PreviewServer } from '../../src/engine/preview.js';
import type { GenmotionPlayer } from '../../src/player.js';
import type * as PlayerModule from '../../src/player.js';
import { projectSchema } from '../../src/ir/schema.js';
import { runProcess } from '../../src/engine/process.js';

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
  if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('genmotion-milestone-')) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
  const markerColor = page.locator('[data-marker-field="0:color"]');
  await expect(markerColor).toHaveAttribute('type', 'text');
  await markerColor.locator('..').getByRole('button').click();
  await page.locator('[data-color-hex]').fill('#32a8f0');
  await page.locator('[data-color-hex]').press('Tab');
  await page.locator('[data-color-apply]').click();
  await expect.poll(async () => (await loadProject(directory)).project.markers?.[0]?.color).toBe('#32a8f0');
  await page.locator('#addTimelineRange').click();
  await page.locator('[data-range-field="0:start"]').fill('0.2'); await page.locator('[data-range-field="0:start"]').press('Tab');
  await page.locator('[data-range-field="0:end"]').fill('0.6'); await page.locator('[data-range-field="0:end"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).project.ranges?.[0]?.end).toBe(.6);
  await page.locator('[data-loop-range]').click(); await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Editor', exact: true }).click(); await page.locator('#playButton').click();
  const sampled = await page.evaluate(async () => {
    const samples: number[] = [];
    for (let index = 0; index < 20; index += 1) { await new Promise(resolve => setTimeout(resolve, 40)); samples.push(Number(document.querySelector<HTMLInputElement>('#scrubber')!.value)); }
    return samples;
  });
  await page.locator('#playButton').click();
  expect(sampled.every(frame => frame >= 6 && frame < 18)).toBe(true); expect(new Set(sampled).size).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('imports a frozen LUT and reorders, bypasses and copies its native stack', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  await page.goto(studio.url); await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('#addVisualEffect').click(); await page.locator('[data-visual-fx-choice="lut"]').click();
  await page.locator('#lutFile').setInputFiles({ name: 'inverse.cube', mimeType: 'text/plain', buffer: Buffer.from('LUT_1D_SIZE 2\n1 1 1\n0 0 0\n') });
  await expect(page.locator('.gm-file')).toContainText('inverse.cube');
  await expect(page.locator('.gm-file button')).toBeVisible();
  await page.locator('#importLut').click();
  await expect.poll(async () => (await loadProject(directory)).project.scenes[0]!.layers[0]!.effects?.[0]?.lut?.data).toEqual([1, 1, 1, 0, 0, 0]);
  await page.locator('#addVisualEffect').click(); await page.locator('[data-visual-fx-choice="exposure"]').click();
  await page.locator('[data-visual-fx-move="1:-1"]').click();
  await page.locator('[data-bool-field="effects.0.enabled"]').uncheck();
  await page.locator('#copyVisualEffects').click();
  await page.locator('[data-select="layer"][data-id="title"]').click(); await page.locator('#pasteVisualEffects').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers[1]!.effects?.map(effect => [effect.type, effect.enabled])).toEqual([['exposure', false], ['lut', true]]);
  await page.reload(); await page.locator('[data-select="layer"][data-id="title"]').click();
  await expect(page.locator('[data-bool-field="effects.0.enabled"]')).not.toBeChecked();
});

test('authors and reviews a storyboard through persisted production stages', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  await page.goto(studio.url); await page.locator('#openProduction').click();
  await page.locator('#productionKind').selectOption('motion-unit'); await page.locator('#configureProduction').click();
  await page.locator('#newProductionShot').click();
  await page.locator('#shotId').fill('opening'); await page.locator('#shotTitle').fill('Opening');
  await page.locator('#shotDirection').fill('Hold the title clearly'); await page.locator('#shotNarration').fill('Native motion');
  await page.locator('#shotDuration').fill('1'); await page.locator('#shotScene').selectOption('intro');
  await page.locator('#shotBuild').selectOption('built'); await page.locator('#saveProductionShot').click();
  await expect(page.locator('[data-shot-preview="opening"]')).toBeEnabled();
  await page.locator('#productionAuthor').fill('QA reviewer'); await page.locator('[data-shot-comment="opening"]').fill('Check the hold');
  await page.locator('[data-shot-add-comment="opening"]').click();
  await page.locator('[data-shot-resolve]').click();
  await page.locator('#productionAuthor').fill('QA reviewer'); await page.locator('[data-shot-review="opening:approved"]').click();
  await expect.poll(async () => (await loadProject(directory)).project.productionWorkflow?.shots[0]?.review?.state).toBe('approved');
  await page.locator('[data-stage-complete="sources"]').click();
  await page.locator('[data-stage-complete="planning"]').click();
  await page.locator('[data-stage-complete="authoring"]').click();
  await expect.poll(async () => (await loadProject(directory)).project.productionWorkflow?.stages.map(stage => stage.stage)).toEqual(['sources', 'planning', 'authoring']);
  await page.locator('[data-shot-preview="opening"]').click();
  await expect(page.locator('#view-preview')).toHaveClass(/active/);
  await page.reload(); await page.locator('[data-select="project"]').click(); await page.locator('#openProduction').click();
  await expect(page.getByText('1 s · built · review approved')).toBeVisible();
});

test('keeps canvas controls live after autosave and supports keyboard zoom and pan', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  await page.goto(studio.url); await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await page.locator('#viewportSettings').click(); await page.locator('#canvasGrid').check();
  await expect(page.locator('#saveState')).toContainText('Saved');
  // Wait for the actual disk write, then edit again without reopening the modal.
  const state = async () => { const { readFile } = await import('node:fs/promises'); return JSON.parse(await readFile(path.join(directory, '.genmotion/studio.json'), 'utf8')) as { viewport: { grid: boolean; zoom: number; panX: number; safeZone: string } }; };
  await expect.poll(async () => (await state()).viewport.grid).toBe(true);
  await page.locator('#canvasSafeZone').selectOption('action');
  await expect.poll(async () => (await state()).viewport.safeZone).toBe('action');
  await page.locator('#canvasOnion').check();
  await page.keyboard.press('Escape'); await page.locator('#monitor').focus();
  await expect(page.getByAltText('Next onion-skin frame')).toBeVisible();
  await page.keyboard.press('Control+='); await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await state()).viewport).toMatchObject({ zoom: 1.2, panX: 50, grid: true, safeZone: 'action' });
  await page.keyboard.press('Control+0');
  await expect.poll(async () => (await state()).viewport.zoom).toBe(1);
});

test('Player and thumbnails switch named variants and reject stale slow frames', async ({ page }) => {
  const loaded = await loadProject(directory);
  loaded.sourceProject.parameters = [{ id: 'tint', label: 'Tint', type: 'color', default: '#ff0000' }];
  loaded.sourceProject.variants = [{ id: 'blue', label: 'Blue', values: { tint: '#0000ff' } }];
  loaded.sourceProject.scenes[0]!.layers[0]!.bindings = { fill: 'tint' };
  await writeFile(loaded.projectFile, JSON.stringify(loaded.sourceProject));
  preview = await startPreview(await loadProject(directory), { port: 0 });
  await page.goto(new URL('/embed', preview.url).href);
  const result = await page.evaluate(async () => {
    const modulePath = '/player.js'; const { GenmotionPlayer, GenmotionThumbnail, httpPlayerSource } = await import(modulePath) as typeof PlayerModule;
    const parent = document.createElement('div'); document.body.append(parent);
    const source = httpPlayerSource('/'); const player = new GenmotionPlayer(parent, source, { controls: false, fit: 'contain', telemetry: () => { throw new Error('Telemetry is isolated'); } });
    await player.ready; await player.seekFrame(15);
    const bytes = async (url: string) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())).join(',');
    const red = await bytes(player.image.src); await player.setVariant('blue'); const blue = await bytes(player.image.src);
    const thumbnail = new GenmotionThumbnail(parent, httpPlayerSource('/', 'blue'), { frame: 15 }); await thumbnail.ready;
    const thumbnailMatches = await bytes(thumbnail.element.src) === blue;
    let release: (() => void) | undefined; const delivered: number[] = [];
    const delayed = new GenmotionPlayer(parent, { metadata: (parameters, signal) => source.metadata(parameters, signal), frame: async (frame, parameters, signal) => { if (frame === 5) await new Promise<void>(resolve => { release = resolve; }); return source.frame(frame, parameters, signal); } });
    await delayed.ready; delayed.addEventListener('frame', event => delivered.push((event as CustomEvent<{ frame: number }>).detail.frame));
    const slow = delayed.seekFrame(5); await delayed.seekFrame(10); release!(); await slow;
    const frame = delayed.frame; const hidden = player.element.querySelector('button')!.parentElement!.hidden;
    thumbnail.dispose(); delayed.dispose(); player.dispose(); parent.remove();
    return { different: red !== blue, thumbnailMatches, frame, delivered, hidden };
  });
  expect(result).toEqual({ different: true, thumbnailMatches: true, frame: 10, delivered: [10], hidden: true });
});

test('Player respects reduced motion, exposes lifecycle events and synchronizes custom control values', async ({ page }) => {
  preview = await startPreview(await loadProject(directory), { port: 0 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(new URL('/embed', preview.url).href);
  const result = await page.evaluate(async () => {
    const modulePath = '/player.js'; const { GenmotionPlayer, httpPlayerSource } = await import(modulePath) as typeof PlayerModule;
    const host = document.createElement('div'); document.body.append(host);
    const source = httpPlayerSource('/'), events: string[] = [], telemetry: string[] = [];
    const player = new GenmotionPlayer(host, { metadata: (values, signal) => source.metadata(values, signal), frame: (frame, values, signal) => frame === 13 ? Promise.reject(new Error('Intentional source failure')) : source.frame(frame, values, signal) }, { autoplay: true, fit: 'cover', telemetry: name => telemetry.push(name) });
    for (const name of ['ready', 'frame', 'timeupdate', 'buffering', 'resume', 'play', 'pause', 'ended', 'error', 'parameterschange']) player.addEventListener(name, () => events.push(name));
    await player.ready; const autoplaySuppressed = !player.playing;
    player.playbackRate = 1.75; player.volume = .25; player.muted = true;
    const speed = player.element.querySelector<HTMLSelectElement>('select')!.value;
    await player.seekFrame(13).catch(() => undefined); await player.seekFrame(28); await player.play();
    await new Promise<void>(resolve => player.addEventListener('ended', () => resolve(), { once: true }));
    const frame = player.frame, fit = player.image.style.objectFit;
    player.dispose(); host.remove(); return { events, telemetry, autoplaySuppressed, speed, frame, fit };
  });
  expect(result).toMatchObject({ autoplaySuppressed: true, speed: '1.75', frame: 29, fit: 'cover' });
  for (const event of ['ready', 'frame', 'timeupdate', 'buffering', 'resume', 'play', 'pause', 'ended', 'error', 'parameterschange']) expect(result.events).toContain(event);
  expect(result.telemetry).toContain('ended');
});

test('Player seeks and plays against the processed native audio clock', async ({ page }) => {
  await runProcess('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(directory, 'tone.wav')]);
  const loaded = await loadProject(directory);
  await writeFile(loaded.projectFile, JSON.stringify(projectSchema.parse({ ...loaded.sourceProject, audio: [{ id: 'tone', src: 'tone.wav', kind: 'voice' }] })));
  preview = await startPreview(await loadProject(directory), { port: 0 });
  await page.goto(new URL('/embed', preview.url).href);
  await page.waitForFunction(() => Boolean((document.querySelector('genmotion-player') as HTMLElement & { player?: GenmotionPlayer })?.player?.metadata));
  const result = await page.evaluate(async () => {
    const player = (document.querySelector('genmotion-player') as HTMLElement & { player: GenmotionPlayer }).player;
    await player.ready; player.muted = true; player.loop = false; await player.seek(.25); await player.play();
    await new Promise<void>(resolve => { const listener = () => { if (player.currentTime >= .5) { player.removeEventListener('timeupdate', listener); resolve(); } }; player.addEventListener('timeupdate', listener); });
    player.pause(); return { source: player.audio.src, time: player.currentTime, audioTime: player.audio.currentTime, paused: player.audio.paused };
  });
  expect(result.source).toContain('/api/audio.m4a'); expect(result.paused).toBe(true);
  expect(Math.abs(result.time - result.audioTime)).toBeLessThan(.15);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
});


test('records a real pointer gesture, previews native frames, persists it and undoes it after reload', async ({ page }) => {
  const source = (await loadProject(directory)).sourceProject;
  source.scenes[0]!.duration = 4; source.scenes[0]!.layers[0]!.duration = 4; source.scenes[0]!.layers[0]!.motion = [];
  await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(source));
  studio = await startStudio(await loadProject(directory), { port: 0 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(studio.url);
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('#recordGesture').click();
  const box = await page.locator('#gestureCanvas').boundingBox();
  if (!box) throw new Error('Gesture canvas missing');
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .6, { steps: 20 });
  await page.mouse.up();
  await page.locator('#gesturePreview').click();
  await expect(page.locator('#gesturePreviewFrames img')).toHaveCount(3);
  for (const image of await page.locator('#gesturePreviewFrames img').all()) await expect(image).toHaveJSProperty('naturalWidth', 320);
  await expect(page.locator('#gestureAccept')).toBeEnabled();
  await page.locator('#gestureAccept').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers[0]!.gestureRecordings?.length).toBe(1);
  await page.reload();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers[0]!.gestureRecordings?.length ?? 0).toBe(0);
  expect(errors).toEqual([]);
});

test('previews a selected frame interval before queuing its export', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(studio.url); await page.getByRole('button', { name: 'Export' }).click();
  await page.locator('#renderSelection').selectOption('custom');
  await page.locator('#renderRangeStart').fill('4'); await page.locator('#renderRangeEnd').fill('15');
  await page.locator('#previewRenderSelection').click();
  await expect(page.locator('#renderSelectionPreview img')).toHaveCount(3);
  for (const image of await page.locator('#renderSelectionPreview img').all()) await expect(image).toHaveJSProperty('naturalWidth', 320);
  await expect(page.locator('#renderSelectionPreview')).toContainText('4–15');
  await page.screenshot({ path: 'output/playwright/milestone-range-preview.png', fullPage: true });
  expect(errors).toEqual([]);
});


test('edits a native path node with the keyboard and persists its curve split', async ({ page }) => {
  const source = (await loadProject(directory)).sourceProject, shape = source.scenes[0]!.layers[0]!;
  if (shape.type !== 'shape') throw new Error('Expected path fixture');
  shape.shape = 'path'; shape.path = 'M0 0 C0 100 100 100 100 0'; shape.motion = [];
  await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify(source));
  studio = await startStudio(await loadProject(directory), { port: 0 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(studio.url); await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('#pathNodeEditor').click();
  await page.locator('[data-path-node="0:0:point"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => { const layer = (await loadProject(directory)).sourceProject.scenes[0]!.layers[0]!; return layer.type === 'shape' ? layer.path : ''; }).toMatch(/^M\s*1[ ,]/);
  await page.locator('#splitPathNode').click();
  await expect(page.locator('[data-path-node$=":point"]')).toHaveCount(3);
  await page.screenshot({ path: 'output/playwright/milestone-path-nodes.png', fullPage: true });
  expect(errors).toEqual([]);
});


test('custom Studio controls support keyboard choices, escape, bounds and disabled states', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(studio.url);
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await page.locator('#viewportSettings').click();
  const select = page.locator('#canvasSafeZone');
  const trigger = select.locator('..').getByRole('combobox');
  await trigger.focus(); await trigger.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await trigger.press('Home'); await trigger.press('ArrowDown'); await trigger.press('Enter');
  await expect(select).toHaveValue('title');
  await trigger.click(); await trigger.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('#canvasZoom')).toBeVisible();
  await select.evaluate((element: HTMLSelectElement) => { element.disabled = true; });
  await expect(trigger).toBeDisabled();
  await select.evaluate((element: HTMLSelectElement) => { element.disabled = false; element.value = 'action'; });
  await expect(trigger).toContainText('action');
  const zoom = page.locator('#canvasZoom');
  await zoom.fill('150'); await zoom.press('Tab');
  await zoom.locator('..').getByRole('button', { name: /Increase/ }).click();
  await expect(zoom).toHaveValue('151');
  await trigger.click();
  await page.screenshot({ path: 'output/playwright/studio-custom-controls.png', fullPage: true });
  const menu = await page.getByRole('listbox').boundingBox();
  expect(menu).not.toBeNull(); expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect.poll(async () => { const box = await page.getByRole('listbox').boundingBox(); return box !== null && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 780; }).toBe(true);
  await page.screenshot({ path: 'output/playwright/studio-custom-controls-mobile.png', fullPage: true });

  expect(errors).toEqual([]);
});


test('playback presents delayed native frames without flooding requests or starving the image', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  let active = 0, peak = 0;
  const edges: number[] = [];
  await page.route('**/frame/*', async route => {
    const edge = new URL(route.request().url()).searchParams.get('maxEdge');
    if (edge) edges.push(Number(edge));
    active++; peak = Math.max(peak, active);
    try { await new Promise(resolve => setTimeout(resolve, 100)); await route.continue(); }
    finally { active--; }
  });
  await page.goto(studio.url);
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await expect(page.locator('#previewImage')).toHaveJSProperty('naturalWidth', 320);
  await page.evaluate(() => {
    const image = document.querySelector('#previewImage')!;
    const frames: string[] = [];
    Object.assign(window, { playbackFrames: frames });
    new MutationObserver(() => frames.push(image.getAttribute('data-presented-frame')!)).observe(image, { attributes: true, attributeFilter: ['data-presented-frame'] });
  });
  await page.locator('#playButton').click();
  await expect.poll(() => page.evaluate(() => new Set((window as unknown as { playbackFrames: string[] }).playbackFrames).size), { timeout: 10000 }).toBeGreaterThan(12);
  await expect.poll(() => Math.min(...edges), { timeout: 2500 }).toBeLessThan(edges[0]!);
  expect(peak).toBeLessThanOrEqual(4); // Two current requests plus two aborted requests during a resolution change.
  await page.locator('#playButton').click();
  await page.locator('#scrubber').fill('20');
  await expect(page.locator('#previewImage')).toHaveAttribute('data-presented-frame', '20');
  await page.waitForTimeout(250);
  await expect(page.locator('#previewImage')).toHaveAttribute('data-presented-frame', '20');
});

test('preview endpoints preserve revision and resolution cache identity', async ({ page }) => {
  studio = await startStudio(await loadProject(directory), { port: 0 });
  const stale = await page.request.get(studio.url + '/frame/0.png?r=stale');
  expect(stale.status()).toBe(409);
  const interactiveStale = await page.request.get(studio.url + '/frame/0.png?r=stale', { headers: { 'x-genmotion-preview': '1' } });
  expect(interactiveStale.status()).toBe(204);
  expect(interactiveStale.headers()['x-preview-revision']).toBeTruthy();
  const small = await page.request.get(studio.url + '/frame/0.png?preview=1&maxEdge=160');
  expect(small.ok()).toBe(true);
  expect(small.headers()['x-preview-width']).toBe('160');
  expect(small.headers()['cache-control']).toBe('no-cache');
  const raw = await page.request.get(studio.url + '/frame/0.rgba?maxEdge=160');
  expect(raw.headers()['content-type']).toContain('application/octet-stream');
  expect((await raw.body()).byteLength).toBe(160 * 90 * 4);
  const full = await page.request.get(studio.url + '/frame/0.png');
  expect(full.headers()['x-preview-width']).toBe('320');
  expect((await page.request.get(studio.url + '/frame/0.png?preview=1&maxEdge=999999')).status()).toBe(400);
});
