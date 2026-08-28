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
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} @ ${message.location().url}`); });
  page.on('response', (response) => { if (response.status() >= 400) void response.text().then((body) => errors.push(`${response.status()} ${response.url()} ${body}`)); });
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
  await expect(page.locator('[data-phase]').first()).toBeVisible();
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

test('moves expanded workflow layers persistently and opens them in the canvas editor', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  const layersButton = page.getByRole('button', { name: 'Show layers' });
  await expect(layersButton).toBeVisible();
  await expect(page.locator('#expandLayersLabel')).toBeHidden();
  await layersButton.click();

  const layerNode = page.locator('[data-node^="layer:"]').first();
  await expect(layerNode).toBeVisible();
  const nodeId = await layerNode.getAttribute('data-node');
  const before = await layerNode.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move((before?.x ?? 0) + 90, (before?.y ?? 0) + 20);
  await page.mouse.down();
  await page.mouse.move((before?.x ?? 0) + 170, (before?.y ?? 0) + 70, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => {
    try {
      const state = JSON.parse(await readFile(path.join(directory, '.genmotion', 'studio.json'), 'utf8')) as { nodes: Array<{ id: string }> };
      return state.nodes.some((node) => node.id === nodeId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }).toBe(true);

  await expect(page.locator('#editSelectedLayer')).toBeVisible();
  await layerNode.dblclick();
  await expect(page.getByRole('button', { name: 'Editor', exact: true })).toHaveClass(/active/);
  await expect(page.locator('#stageOverlay .stage-selection')).toBeVisible();
  await expect(page.locator('#editSelectedLayer')).toBeHidden();
});

test('wraps long labels and renders unclipped viewport tooltips', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto(studio?.url ?? '');
  await page.getByRole('button', { name: 'Inspector' }).click();
  const longTitle = 'Deterministic product launch with an intentionally descriptive review title';
  await page.locator('[data-field="title"]').fill(longTitle);
  await page.locator('[data-field="title"]').press('Tab');
  const projectLabel = page.locator('#sceneTree [data-select="project"] .tree-label');
  await expect(projectLabel).toHaveText(longTitle);
  await expect(projectLabel).toHaveAttribute('data-tooltip', longTitle);
  await page.getByRole('button', { name: 'Inspector' }).click();
  await page.locator('#manageMotions').hover();
  await expect(page.locator('#appTooltip')).toHaveClass(/visible/);
  await expect(page.locator('#appTooltip')).toHaveText('Manage libraries');
  const [tooltip, sidebar] = await Promise.all([page.locator('#appTooltip').boundingBox(), page.locator('.sidebar').boundingBox()]);
  expect(tooltip).not.toBeNull();
  expect(sidebar).not.toBeNull();
  expect((tooltip?.x ?? 0) + (tooltip?.width ?? 0)).toBeGreaterThan((sidebar?.x ?? 0) + (sidebar?.width ?? 0));
  expect((tooltip?.x ?? 0) + (tooltip?.width ?? 0)).toBeLessThanOrEqual(900);
});

test('keeps primary chrome inside the viewport across responsive widths', async ({ page }) => {
  for (const width of [1280, 900, 700, 480]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto(studio?.url ?? '');
    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - window.innerWidth,
      document: document.documentElement.scrollWidth - window.innerWidth,
      clippedChrome: Array.from(document.querySelectorAll<HTMLElement>('.topbar > *, .agent-bar > *'))
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > window.innerWidth + 1;
        })
        .map((element) => ({ className: element.className, text: element.textContent?.trim() })),
    }));
    expect(overflow, `viewport ${width}px`).toEqual({ body: 0, document: 0, clippedChrome: [] });
  }
});

test('keeps project and export dialogs usable on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 760 });
  await page.goto(studio?.url ?? '');
  await page.locator('#projectSwitch').click();
  const projectPopover = await page.locator('#projectPopover').boundingBox();
  expect(projectPopover).not.toBeNull();
  expect(projectPopover?.x).toBeGreaterThanOrEqual(0);
  expect((projectPopover?.x ?? 0) + (projectPopover?.width ?? 0)).toBeLessThanOrEqual(480);
  await page.getByRole('button', { name: /New project/ }).click();
  await expect(page.locator('.new-project-grid')).toHaveCSS('display', 'block');
  await expect(page.locator('.modal')).toBeInViewport();
  await expect(page.locator('[data-field="newProject.title"]')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.locator('.modal')).toBeInViewport();
  const escaped = await page.locator('.modal input,.modal button').evaluateAll((elements) => elements
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left < 0 || rect.right > window.innerWidth;
    })
    .map((element) => element.outerHTML));
  expect(escaped).toEqual([]);
});

test('uses packaged SVG controls and the selected agent brand', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await expect(page.locator('.logo svg')).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/brand/genmotion.webmanifest');
  await expect(page.locator('#projectSwitch .chevron .ui-icon')).toBeVisible();
  await expect(page.locator('#agentHostMark .brand-icon')).toBeVisible();
  await page.locator('#agentHost').click();
  await expect(page.locator('#agentPopover .agent-host-mark .brand-icon')).toBeVisible();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.locator('.select-button .ui-icon')).toHaveCount(2);
  await expect(page.locator('#modalClose .ui-icon')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/[✦⌄⌃↗＋✕↻▶❚❚−◆▣▤◫✎●◇▧♪]/);
});

test('creates and opens a real project from the project switcher', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('#projectSwitch').click();
  await expect(page.locator('#projectPopover')).toContainText('Agent-authored render');
  await page.getByRole('button', { name: /New project/ }).click();
  await page.locator('[data-field="newProject.title"]').fill('Studio launch');
  await page.locator('[data-field="newProject.audience"]').fill('Product teams');
  await page.locator('[data-field="newProject.promise"]').fill('Explain the product with clarity');
  await page.locator('[data-field="newProject.proof"]').fill('Captured product evidence');
  await page.locator('[data-field="newProject.desiredAction"]').fill('Start creating');
  await page.locator('#createWithAgent').click();
  await expect(page.locator('#projectName')).toHaveText('Studio launch', { timeout: 15_000 });
  await expect(page.getByText('codex · Complete')).toBeVisible({ timeout: 15_000 });
  expect((await stat(path.join(directory, 'workspace', 'studio-launch', 'genmotion.json'))).isFile()).toBe(true);
});

test('creates a blank project without invoking an agent', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('#projectSwitch').click();
  await page.getByRole('button', { name: /New project/ }).click();
  await page.locator('[data-field="newProject.title"]').fill('Blank storyboard');
  await page.locator('[data-field="newProject.audience"]').fill('Motion designers');
  await page.locator('[data-field="newProject.promise"]').fill('Start from an open artboard');
  await page.locator('[data-field="newProject.proof"]').fill('The project remains directly editable');
  await page.locator('[data-field="newProject.desiredAction"]').fill('Direct the first scene');
  await page.locator('#createBlank').click();
  await expect(page.locator('#projectName')).toHaveText('Blank storyboard', { timeout: 15_000 });
  await expect(page.locator('#requestList')).toContainText('No agent conversations yet');
  expect((await stat(path.join(directory, 'workspace', 'blank-storyboard', 'genmotion.json'))).isFile()).toBe(true);
});

test('operates workflow, library, reference, transport, and agent controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} @ ${message.location().url}`); });
  page.on('response', (response) => { if (response.status() >= 400) void response.text().then((body) => errors.push(`${response.status()} ${response.url()} ${body}`)); });
  await page.goto(studio?.url ?? '');

  await page.locator('#addScene').click();
  await page.locator('[data-field="newScene.id"]').fill('proof-scene');
  await page.locator('[data-field="newScene.purpose"]').fill('Hold the verified product result.');
  await page.locator('#confirmAddScene').click();
  await expect(page.locator('#sceneTree')).toContainText('proof-scene');
  await expect(page.locator('#saveState')).toHaveText('Saved');
  await page.locator('[data-select="scene"][data-id="proof-scene"]').click();
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(page.locator('#previewImage')).toHaveAttribute('src', /\/frame\/30\.png/);
  await page.getByRole('button', { name: 'Workflow', exact: true }).click();

  await page.locator('#addNote').click();
  await page.locator('[data-field="newNote.title"]').fill('Pacing');
  await page.locator('[data-field="newNote.body"]').fill('Hold the result for one full reading beat.');
  await page.locator('#confirmAddNote').click();
  await expect(page.locator('#nodes')).toContainText('Pacing');
  await page.locator('#fitWorkflow').click();
  await expect(page.locator('#zoomLabel')).toHaveText(/%$/);

  await page.locator('#sceneTree [data-select="layer"]').first().click();
  const beforeMotions = await page.locator('[data-remove-motion]').count();
  await page.locator('#motionSearch').fill('scale lock');
  await page.locator('#motionList [data-motion]').first().click();
  await expect(page.locator('#replaceMotion')).toBeVisible();
  await page.locator('#replaceMotion').click();
  await expect.poll(() => page.locator('[data-remove-motion]').count()).toBe(beforeMotions);
  await expect(page.locator('#saveState')).toHaveText('Saved');

  await page.locator('#manageMotions').click();
  await expect(page.locator('#importMotionLibrary')).toBeVisible();
  await page.locator('#motionLibraryPicker').setInputFiles({
    name: 'studio-library.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      schemaVersion: 1, id: 'studio-library', title: 'Studio Library', version: '1.0.0', motions: [{
        id: 'gentle-shift', title: 'Gentle shift', roles: ['entrance'], energy: ['balanced'], signature: 'A measured horizontal arrival.',
        duration: [0.2, 0.8], cost: 1, accessibility: ['Respect reduced motion'], tracks: { x: [{ at: 0, value: 18 }, { at: 1, value: 0, ease: 'cubic-out' }] },
      }],
    })),
  });
  await expect(page.getByText('Studio Library', { exact: true })).toBeVisible();
  await page.locator('#modalClose').click();

  await page.getByRole('button', { name: 'References' }).click();
  const [referenceChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#uploadReference').click(),
  ]);
  await referenceChooser.setFiles({
    name: 'workflow-reference.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.locator('[data-reference]').click();
  await page.locator('[data-field="ref.notes"]').fill('Borrow the restrained hierarchy.');
  await page.locator('[data-field="ref.notes"]').press('Tab');
  await page.locator('#connectReference').click();
  await page.locator('[data-connect-scene="intro"]').click();
  await expect(page.locator('#saveState')).toHaveText('Saved');
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ id: string; notes: string[] }> };
    return project.scenes.find((scene) => scene.id === 'intro')?.notes ?? [];
  }).toContain('Studio reference workflow-reference: Borrow the restrained hierarchy.');

  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await page.locator('#playButton').click();
  await expect(page.locator('#playButton')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('#playButton').click();
  await expect(page.locator('#playButton')).toHaveAttribute('aria-label', 'Play');
  await page.locator('#timelineZoomIn').click();
  await expect(page.locator('#timelineZoomLabel')).toHaveText('125%');
  await page.locator('#timelineZoomOut').click();
  await expect(page.locator('#timelineZoomLabel')).toHaveText('100%');
  await page.locator('#refreshValidation').click();
  await expect(page.locator('#saveState')).toHaveText('Saved');

  await page.locator('#agentHost').click();
  await page.locator('#refreshAgents').click();
  await expect(page.locator('#agentPopover')).toHaveClass(/open/);
  await page.locator('#agentHost').click();
  await page.locator('#agentInput').fill('Review the current selected frame.');
  await page.locator('#sendRequest').click();
  await expect(page.getByText('Review the current selected frame.')).toBeVisible();
  await expect(page.getByText('codex · Complete')).toBeVisible();
  expect(errors).toEqual([]);
});

test('moves, trims, snaps, resizes, and imports timeline media', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(studio?.url ?? '');
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(page.locator('#previewImage')).toHaveJSProperty('naturalWidth', 320);

  await page.locator('[data-layerclip="accent"]').click();
  await page.locator('#addTrack').click();
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; tracks?: unknown[] }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.tracks?.length ?? 0;
  }).toBe(1);
  await expect(page.getByText('Agent animation tracks')).toBeVisible();
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

  await expect(page.locator('[data-layerclip="accent"]')).toBeVisible();
  const layerBox = await page.locator('[data-layerclip="accent"]').boundingBox();
  expect(layerBox).not.toBeNull();
  if (layerBox) {
    await page.mouse.move(layerBox.x + layerBox.width / 2, layerBox.y + layerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(layerBox.x + layerBox.width / 2 + 45, layerBox.y + layerBox.height / 2, { steps: 5 });
    await page.mouse.up();
  }
  await page.locator('[data-layerclip="accent"]').press('ArrowRight');
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
  await expect(page.getByText('1920×1080', { exact: true })).toBeVisible();
  await page.locator('[data-field="render.filename"]').fill('e2e-browser-export.mp4');
  await page.locator('#startRender').evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(async () => {
    const jobs = await fetch(`${studio?.url ?? ''}/api/jobs`).then((response) => response.json()) as Array<{ status: string; width?: number; height?: number }>;
    if (jobs[0]) expect(jobs[0]).toMatchObject({ width: 1920, height: 1080 });
    return jobs.length;
  }).toBe(1);
  await expect(page.getByText(/Export ready:/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Export ready:/)).toHaveCount(1);
  await expect(page.locator('#renderProgress')).toContainText('Export complete');
  await expect(page.locator('#renderProgress').getByRole('button', { name: 'Show in folder' })).toBeVisible();
  await expect(page.locator('#startRender')).toHaveText('Export again');
});
