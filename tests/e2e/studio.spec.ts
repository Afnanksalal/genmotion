import { expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../../src/ir/loader.js';
import { startStudio, type StudioServer } from '../../src/studio/server.js';
import type { AgentRuntime } from '../../src/agent/runtime.js';

let directory = '';
let studio: StudioServer | undefined;
function toneWav(): Buffer {
  const sampleRate = 8_000;
  const samples = sampleRate / 4;
  const body = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) body.writeInt16LE(Math.round(Math.sin(index / sampleRate * Math.PI * 880) * 12_000), index * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + body.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(body.length, 40);
  return Buffer.concat([header, body]);
}
const agentRuntime: AgentRuntime = {
  hosts: () => Promise.resolve([{ id: 'codex', label: 'Codex', installed: true, authenticated: true, detail: 'Browser test session' }]),
  run: async (input, onProgress) => {
    await onProgress({ activity: 'Responding', message: 'The selected scene was reviewed.', sessionId: 'browser-test-thread' });
    if (/\b(?:create|make|change|edit|author|design|animate|add|remove|apply|fix|update)\b/i.test(input.prompt)) {
      const project = JSON.parse(await readFile(input.projectFile, 'utf8')) as {
        metadata?: Record<string, string>;
        scenes?: Array<{ layers: Array<Record<string, unknown>> }>;
      };
      project.metadata = { ...project.metadata, browserAgentEdit: 'applied' };
      if (/\bfull Creative IR\b/i.test(input.prompt)) {
        const layer = project.scenes?.[0]?.layers[0];
        if (layer) {
          Object.assign(layer, {
            type: 'shape', shape: 'path', path: 'M 10 90 C 60 10 260 10 310 90',
            fill: '#00000000', stroke: '#59e3a6', strokeWidth: 2, radius: 0, progress: 1,
            tracks: [{ id: 'agent-camera-track', target: 'transform.x', keyframes: [
              { at: 0, value: 12, ease: 'sine-out' }, { at: 1, value: 0, ease: 'cubic-out' },
            ] }],
          });
        }
      }
      await writeFile(input.projectFile, `${JSON.stringify(project, null, 2)}\n`);
    }
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
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('edits generated typed parameter controls and persists nested defaults', async ({ page }) => {
  await studio?.close();
  const loaded = await loadProject(directory);
  loaded.sourceProject.parameters = [
    { id: 'headline', label: 'Headline', type: 'string', default: 'Default', description: 'Reusable headline', group: 'Copy' },
    { id: 'enabled', label: 'Enabled', type: 'boolean', default: false },
    { id: 'theme', label: 'Theme', type: 'enum', default: 'dark', options: ['dark', 'light'] },
    { id: 'details', label: 'Details', type: 'object', default: {}, properties: { count: { id: 'count', label: 'Count', type: 'number', default: 1, min: 0, max: 10 } } },
  ];
  await writeFile(loaded.projectFile, JSON.stringify(loaded.sourceProject));
  studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime });
  await page.goto(studio.url);
  await page.locator('[data-select="project"]').click();
  await expect(page.getByText('Reusable headline', { exact: true })).toBeVisible();
  await page.locator('[data-field="parameterValues.headline"]').fill('Configured headline');
  await page.locator('[data-field="parameterValues.headline"]').press('Tab');
  await page.locator('[data-bool-field="parameterValues.enabled"]').check();
  await page.locator('[data-field="parameterValues.theme"]').selectOption('light');
  await page.locator('[data-field="parameterValues.details.count"]').fill('4');
  await page.locator('[data-field="parameterValues.details.count"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.parameterValues).toEqual({ headline: 'Configured headline', enabled: true, theme: 'light', details: { count: 4 } });
  await page.reload();
  await page.locator('[data-select="project"]').click();
  await expect(page.locator('[data-field="parameterValues.details.count"]')).toHaveValue('4');
  await page.locator('#openConfigurations').click();
  await page.locator('#configurationFormat').selectOption('matrix');
  await page.locator('#configurationSource').fill(JSON.stringify({ headline: ['First', 'Second'], enabled: [true, false] }));
  await page.locator('#configurationValidate').click();
  await expect(page.locator('#configurationStatus')).toHaveText('4 valid configurations');
  await page.locator('#configurationSave').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.variants.length).toBe(4);
  await page.locator('#openConfigurations').click();
  await page.locator('#configurationCsv').click();
  await expect(page.locator('#configurationSource')).toHaveValue(/"\$id","\$label","headline","enabled"/);
  await page.locator('[data-config-use="variant-0004"]').click();
  await expect.poll(async () => (await loadProject(directory)).project.parameterValues.headline).toBe('Second');
  await expect.poll(async () => (await loadProject(directory)).project.parameterValues.enabled).toBe(false);
});

test('authors and persists shared geometry anchors from the project inspector', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="project"]').click();
  await page.locator('#addGeometryAnchor').click();
  await expect(page.locator('[data-field="anchors.0.id"]')).toHaveValue('anchor-1');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('[data-select-field="shape"]').click();
  await page.locator('[data-choice="bezier"]').click();
  await expect(page.locator('[data-json-field="control1"]')).toBeVisible();
  await page.locator('[data-field="endAnchor"]').fill('anchor-1');
  await page.locator('[data-field="endAnchor"]').press('Tab');
  await page.locator('[data-select="project"]').click();
  await page.locator('[data-field="anchors.0.id"]').fill('result-point');
  await page.locator('[data-field="anchors.0.id"]').press('Tab');
  await page.locator('[data-field="anchors.0.x"]').fill('280');
  await page.locator('[data-field="anchors.0.x"]').press('Tab');
  await page.locator('[data-field="anchors.0.y"]').fill('120');
  await page.locator('[data-field="anchors.0.y"]').press('Tab');
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { anchors?: Array<{ id: string; x: number; y: number }>; scenes: Array<{ layers: Array<{ id: string; endAnchor?: string }> }> };
    return { anchor: project.anchors?.[0], binding: project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.endAnchor };
  }).toEqual({ anchor: { id: 'result-point', x: 280, y: 120 }, binding: 'result-point' });
});

test('authors composition instance overrides, frame holds and finite loop timing', async ({ page }) => {
  await studio?.close();
  const loaded = await loadProject(directory);
  const source = loaded.sourceProject;
  source.compositions = [{ id: 'badge', width: 100, height: 100, duration: 2, fps: 30, parameters: [{ id: 'label', label: 'Label', type: 'string', default: 'Badge' }], layers: [source.scenes[0]!.layers[0]!] }];
  const { compositionLayerSchema } = await import('../../src/ir/schema.js');
  source.scenes[0]!.layers = [compositionLayerSchema.parse({ id: 'instance', type: 'composition', compositionId: 'badge', x: 0, y: 0, width: 100, height: 100 })];
  await writeFile(loaded.projectFile, JSON.stringify(source));
  studio = await startStudio(await loadProject(directory), { port: 0, agentRuntime });
  await page.goto(studio.url);
  await page.locator('[data-select="layer"][data-id="instance"]').click();
  await page.locator('[data-json-field="parameterValues"]').fill('{"label":"Configured"}');
  await page.locator('[data-json-field="parameterValues"]').press('Tab');
  await page.locator('[data-json-field="freeze"]').fill('{"frame":15,"from":0.2,"to":0.8}');
  await page.locator('[data-json-field="freeze"]').press('Tab');
  await page.locator('[data-bool-field="loop"]').check();
  await page.locator('[data-field="loopCount"]').fill('3');
  await page.locator('[data-field="loopCount"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers[0]).toMatchObject({ parameterValues: { label: 'Configured' }, freeze: { frame: 15, from: 0.2, to: 0.8 }, loop: true, loopCount: 3 });
  await page.locator('[data-json-field="freeze"]').fill('null');
  await page.locator('[data-json-field="freeze"]').press('Tab');
  await page.locator('[data-field="loopCount"]').fill('');
  await page.locator('[data-field="loopCount"]').press('Tab');
  await expect.poll(async () => {
    const layer = (await loadProject(directory)).sourceProject.scenes[0]!.layers[0]!;
    return Object.hasOwn(layer, 'freeze') || Object.hasOwn(layer, 'loopCount');
  }).toBe(false);
});

test('normalizes SVG curves and disjoint subpaths without flattening geometry', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('[data-select-field="shape"]').click();
  await page.locator('[data-choice="path"]').click();
  const data = 'm10 10c0 10 10 10 10 0z m30 0h10v10z';
  await page.locator('[data-field="path"]').fill(data);
  await page.locator('[data-field="path"]').press('Tab');
  await page.locator('[data-normalize-path="path"]').click();
  await expect(page.locator('[data-field="path"]')).toHaveValue('M10 10 C10 20 20 20 20 10 Z M40 10 L50 10 L50 20 Z');
  await expect.poll(async () => {
    const layer = (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((item) => item.id === 'accent');
    return layer?.type === 'shape' ? layer.path : undefined;
  }).toBe('M10 10 C10 20 20 20 20 10 Z M40 10 L50 10 L50 20 Z');
  await page.locator('#addPathOperation').click();
  await page.locator('[data-path-op-choice="round"]').click();
  await page.locator('[data-field="pathOperations.0.radius"]').fill('5');
  await page.locator('[data-field="pathOperations.0.radius"]').press('Tab');
  await page.locator('#addPathOperation').click();
  await page.locator('[data-path-op-choice="stroke"]').click();
  await expect.poll(async () => {
    const layer = (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((item) => item.id === 'accent');
    return layer?.type === 'shape' ? layer.pathOperations : undefined;
  }).toEqual([{ op: 'round', radius: 5 }, { op: 'stroke', width: 10, join: 'round', cap: 'round', miterLimit: 4 }]);
  await page.locator('[data-path-op-remove="1"]').click();
  await expect(page.locator('[data-path-op-remove]')).toHaveCount(1);
});

test('authors curve reversal, subdivision and corner warps through the shared operation stack', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('[data-select-field="shape"]').click();
  await page.locator('[data-choice="path"]').click();
  for (const op of ['reverse', 'subdivide', 'warp', 'cut']) {
    await page.locator('#addPathOperation').click();
    await page.locator('[data-path-op-choice="' + op + '"]').click();
  }
  await page.locator('[data-field="pathOperations.1.divisions"]').fill('4');
  await page.locator('[data-field="pathOperations.1.divisions"]').press('Tab');
  await page.locator('[data-json-field="pathOperations.2.corners"]').fill('[[10,0],[90,0],[100,100],[0,100]]');
  await page.locator('[data-json-field="pathOperations.2.corners"]').press('Tab');
  await expect.poll(async () => {
    const layer = (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((item) => item.id === 'accent');
    return layer?.type === 'shape' ? layer.pathOperations : undefined;
  }).toEqual([{ op: 'reverse' }, { op: 'subdivide', divisions: 4 }, { op: 'warp', corners: [[10,0],[90,0],[100,100],[0,100]], divisions: 16 }, { op: 'cut', at: 0.5 }]);
  await page.reload();
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await expect(page.locator('[data-field="pathOperations.1.divisions"]')).toHaveValue('4');
});

test('authors and reloads native path morph keyframes', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('[data-select-field="shape"]').click();
  await page.locator('[data-choice="path"]').click();
  await page.locator('#addTrack').click();
  await page.locator('[data-select-field="tracks.0.target"]').click();
  await page.locator('[data-choice="path"]').click();
  const target = 'M50 0L100 100L0 100Z';
  await page.locator('[data-field="tracks.0.keyframes.1.value"]').fill(target);
  await page.locator('[data-field="tracks.0.keyframes.1.value"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((item) => item.id === 'accent')?.tracks[0]).toMatchObject({ target: 'path', interpolation: 'path', keyframes: [{ at: 0 }, { value: target }] });
  await page.reload();
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await expect(page.locator('[data-field="tracks.0.keyframes.1.value"]')).toHaveValue(target);
});

test('copies and pastes easing through the scene inspector', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="scene"]').first().click();
  await page.locator('[data-select-field="transitionIn.timing"]').click();
  await page.locator('[data-choice="sine-out"]').click();
  await page.locator('[data-ease-copy="transitionIn.timing"]').click();
  await page.locator('[data-ease-paste="transitionOut.timing"]').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.transitionOut.timing).toBe('sine-out');
  await expect(page.locator('[data-select-field="transitionOut.timing"]')).toContainText('sine-out');
});

test('authors shared voice-ducking dynamics in the project inspector', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="project"]').click();
  await page.locator('[data-object-toggle="audioDucking"]').click();
  await page.locator('[data-field="audioDucking.attackMs"]').fill('5');
  await page.locator('[data-field="audioDucking.attackMs"]').press('Tab');
  await page.locator('[data-field="audioDucking.releaseMs"]').fill('20');
  await page.locator('[data-field="audioDucking.releaseMs"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.audioDucking).toMatchObject({ attackMs: 5, releaseMs: 20 });
  await page.locator('[data-object-toggle="audioDucking"]').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.audioDucking).toBeUndefined();
});

test('persists loudness targets and measures the saved processed mix', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="project"]').click();
  await page.locator('[data-object-toggle="audioNormalization"]').click();
  await page.locator('[data-field="audioNormalization.integratedLufs"]').fill('-18');
  await page.locator('[data-field="audioNormalization.integratedLufs"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.audioNormalization).toMatchObject({ integratedLufs: -18, truePeakDbtp: -1, rangeLu: 11 });
  await page.locator('#measureAudio').click();
  await expect(page.locator('#loudnessResult')).toContainText('True peak: Silence');
  await expect(page.locator('#loudnessResult')).toContainText('Revision:');
  await page.keyboard.press('Escape');
  await page.locator('[data-object-toggle="audioNormalization"]').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.audioNormalization).toBeUndefined();
});

test('downloads all four full-duration audio stems from Studio', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="project"]').click();
  for (const kind of ['music', 'voice', 'sfx', 'source']) {
    const pending = page.waitForEvent('download');
    await page.locator('[data-stem-download="' + kind + '"]').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(kind + '.wav');
    expect(await download.failure()).toBeNull();
    const destination = path.join(directory, kind + '-stem.wav');
    await download.saveAs(destination);
    expect((await stat(destination)).size).toBeGreaterThan(380_000);
  }
});

test('authors native gradient paint and animated stops with persistence', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('[data-object-toggle="gradientFill"]').click();
  await page.locator('[data-select-field="gradientFill.type"]').click();
  await page.locator('[data-choice="radial"]').click();
  await page.locator('[data-field="gradientFill.radius"]').fill('0.8');
  await page.locator('[data-field="gradientFill.radius"]').press('Tab');
  await page.locator('#addTrack').click();
  await page.locator('[data-select-field="tracks.0.target"]').click();
  await page.locator('[data-choice="gradientFill"]').click();
  const gradient = { type: 'radial', angle: 0, center: [.5,.5], radius: .8, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
  await page.locator('[data-json-field="tracks.0.keyframes.1.value"]').fill(JSON.stringify(gradient));
  await page.locator('[data-json-field="tracks.0.keyframes.1.value"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((item) => item.id === 'accent')?.tracks[0]?.keyframes[1]?.value).toEqual(gradient);
  await page.reload();
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await expect(page.locator('[data-field="gradientFill.radius"]')).toHaveValue('0.8');
});

test('authors distance-based stagger timing in the layer inspector', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('[data-object-toggle="stagger"]').click();
  await page.locator('[data-select-field="stagger.from"]').click();
  await page.locator('[data-choice="distance"]').click();
  await page.locator('[data-json-field="stagger.origin"]').fill('[160,90]');
  await page.locator('[data-json-field="stagger.origin"]').press('Tab');
  await page.locator('[data-field="stagger.distanceUnit"]').fill('50');
  await page.locator('[data-field="stagger.distanceUnit"]').press('Tab');
  await page.locator('[data-field="stagger.delay"]').fill('0.2');
  await page.locator('[data-field="stagger.delay"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((item) => item.id === 'accent')?.stagger).toMatchObject({ from: 'distance', origin: [160,90], distanceUnit: 50, delay: .2 });
  await page.reload();
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await expect(page.locator('[data-field="stagger.distanceUnit"]')).toHaveValue('50');
});

test('plots native track velocity and acceleration in the inspector', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('#addTrack').click();
  await page.locator('[data-track-analysis="0"]').click();
  await expect(page.getByRole('img', { name: 'Velocity (units/s)', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Acceleration (units/s²)', exact: true })).toBeVisible();
  await expect(page.locator('#trackAnalysis svg path[stroke="#60a5fa"]').first()).toHaveAttribute('d', /^M/);
  await expect(page.locator('#trackAnalysis')).toContainText('Gaps mark keyframe or cycle boundaries');
  await page.screenshot({ path: 'output/playwright/track-kinematics.png', fullPage: true });
});

test('seeks fractional frames without rounding the requested timestamp', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await page.getByRole('button', { name: 'Seek exact time' }).click();
  await page.locator('#seekSeconds').fill('0.35');
  const frame = page.waitForResponse((response) => response.url().includes('/frame/10.5.png'));
  await page.locator('#seekApply').click();
  expect((await frame).status()).toBe(200);
  await expect(page.locator('#previewImage')).toHaveAttribute('src', /\/frame\/10\.5\.png/);
});

test('fits complete text and measures automatic native box dimensions', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="title"]').click();
  await page.locator('[data-field="text"]').fill('A complete headline with every word preserved');
  await page.locator('[data-field="text"]').press('Tab');
  await page.locator('[data-field="maxLines"]').fill('2');
  await page.locator('[data-field="maxLines"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((layer) => layer.id === 'title')).toMatchObject({ maxLines: 2 });
  await page.locator('#measureText').click();
  await expect(page.locator('#textMeasurement')).toContainText('Complete text fits');
  expect(await page.locator('#textMeasurement li').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('preserved')]));
  await page.keyboard.press('Escape');
  await page.locator('[data-select-field="autoSize"]').click();
  await page.locator('[data-choice="height"]').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((layer) => layer.id === 'title')).toMatchObject({ autoSize: 'height' });
  await page.reload();
  await page.locator('[data-select="layer"][data-id="title"]').click();
  await expect(page.locator('[data-select-field="autoSize"]')).toContainText('height');
});

test('authors track groups, locks and declarative property links', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('#addTrackGroup').click();
  await page.locator('#addTrack').click();
  await page.locator('[data-select-field="tracks.0.group"]').click();
  await page.locator('[data-choice="group-1"]').click();
  await page.locator('[data-bool-field="trackGroups.0.solo"]').check();
  await page.locator('[data-bool-field="tracks.0.locked"]').check();
  await expect(page.locator('[data-field="tracks.0.keyframes.1.value"]')).toBeDisabled();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((layer) => layer.id === 'accent')?.tracks[0]?.locked).toBe(true);
  await page.locator('[data-bool-field="tracks.0.locked"]').uncheck();
  await expect(page.locator('[data-field="tracks.0.keyframes.1.value"]')).toBeEnabled();
  await page.locator('#addPropertyLink').click();
  await page.locator('[data-field="propertyLinks.0.offset"]').fill('12');
  await page.locator('[data-field="propertyLinks.0.offset"]').press('Tab');
  await page.locator('[data-bool-field="propertyLinks.0.enabled"]').check();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((layer) => layer.id === 'accent')?.propertyLinks?.[0]).toMatchObject({ enabled: true, offset: 12, sourceLayerId: 'title' });
  await page.reload();
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await expect(page.locator('[data-bool-field="trackGroups.0.solo"]')).toBeChecked();
  await expect(page.locator('[data-field="propertyLinks.0.offset"]')).toHaveValue('12');
});

test('persists production intake and records user decisions separately from inference', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="project"]').click();
  await page.locator('[data-object-toggle="productionBrief"]').click();
  await page.locator('[data-object-toggle="productionBrief.audience"]').click();
  await page.locator('[data-field="productionBrief.audience.value"]').fill('Motion designers and creative agents');
  await page.locator('[data-field="productionBrief.audience.value"]').press('Tab');
  await page.locator('[data-object-toggle="productionBrief.aspect"]').click();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.productionBrief).toMatchObject({ version: 1, audience: { value: 'Motion designers and creative agents', origin: 'user' }, aspect: { value: [320, 180], origin: 'inferred' } });
  await page.reload();
  await page.locator('[data-select="project"]').click();
  await expect(page.locator('[data-field="productionBrief.audience.value"]')).toHaveValue('Motion designers and creative agents');
  await expect(page.locator('[data-select-field="productionBrief.aspect.origin"]')).toContainText('inferred');
});

test('authors native star and waveform geometry through typed controls', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await page.locator('[data-select-field="shape"]').click();
  await page.locator('[data-choice="star"]').click();
  await page.locator('[data-field="sides"]').fill('7');
  await page.locator('[data-field="sides"]').press('Tab');
  await page.locator('[data-field="innerRadius"]').fill('0.3');
  await page.locator('[data-field="innerRadius"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((layer) => layer.id === 'accent')).toMatchObject({ shape: 'star', sides: 7, innerRadius: 0.3 });
  await page.locator('[data-select-field="shape"]').click();
  await page.locator('[data-choice="waveform"]').click();
  await page.locator('[data-json-field="samples"]').fill('[0,1,-1,0]');
  await page.locator('[data-json-field="samples"]').press('Tab');
  await expect.poll(async () => (await loadProject(directory)).sourceProject.scenes[0]!.layers.find((layer) => layer.id === 'accent')).toMatchObject({ shape: 'waveform', samples: [0, 1, -1, 0], strokeWidth: 2 });
});

test('scales workflow navigation, asset discovery, easing inspection, and audio mixing controls', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.locator('#autoLayout').click();
  await expect(page.getByText(/Workflow arranged for 1 scenes/)).toBeVisible();
  await expect(page.locator('[data-node^="layer:intro:"]')).toHaveCount(2);
  await expect.poll(async () => {
    const state = JSON.parse(await readFile(path.join(directory, '.genmotion', 'studio.json'), 'utf8')) as { nodes: Array<{ kind: string }> };
    return state.nodes.filter((node) => node.kind === 'layer').length;
  }).toBe(2);

  await page.locator('#sceneSearch').fill('title');
  await expect(page.locator('[data-select="layer"][data-id="title"]')).toBeVisible();
  await expect(page.locator('[data-select="layer"][data-id="accent"]')).toHaveCount(0);
  await page.locator('#sceneSearch').fill('');
  await page.locator('[data-select="scene"]').first().click();
  await expect(page.locator('#inspectorBody .easing-card>svg')).toHaveCount(2);

  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.locator('#assetPicker').setInputFiles({ name: 'mix.wav', mimeType: 'audio/wav', buffer: toneWav() });
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.locator('#assetSearch').fill('mix');
  await expect(page.getByText('Audio · 1 use')).toBeVisible();
  await page.locator('[data-asset]').click();
  await expect(page.locator('[data-field="pan"]')).toBeVisible();
  await expect(page.locator('[data-bool-field="muted"]')).toBeVisible();
  await expect(page.locator('[data-bool-field="solo"]')).toBeVisible();
  await expect(page.locator('.audio-waveform')).toBeVisible();
  await expect.poll(() => page.locator('.audio-waveform').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(1);
  await page.locator('[data-field="gainDb"]').fill('-6');
  await page.locator('[data-field="gainDb"]').press('Tab');
  await page.locator('#addAudioEffect').click();
  await page.locator('[data-audio-fx-choice="lowpass"]').click();
  await page.locator('[data-field="effects.0.frequency"]').fill('1000');
  await page.locator('[data-field="effects.0.frequency"]').press('Tab');
  await page.locator('#addAudioEffect').click();
  await page.locator('[data-audio-fx-choice="limiter"]').click();
  await page.locator('[data-audio-fx-move="1:-1"]').click();
  await page.locator('[data-bool-field="effects.0.bypass"]').check();
  await expect.poll(async () => (await loadProject(directory)).sourceProject.audio[0]).toMatchObject({ gainDb: -6, effects: [{ type: 'limiter', bypass: true }, { type: 'lowpass', frequency: 1000 }] });
  await page.locator('[data-audio-fx-remove="1"]').click();
  await expect(page.locator('[data-audio-fx-remove]')).toHaveCount(1);
  await page.locator('#previewAudioMix').click();
  const audio = page.locator('#processedAudioPreview');
  await audio.evaluate((element: HTMLAudioElement) => { element.load(); });
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.duration)).toBeCloseTo(1, 1);
  await expect(audio).not.toHaveAttribute('controls');
  await page.getByRole('button', { name: 'Play audio preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause audio preview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause audio preview', exact: true }).click();
  await page.getByRole('slider', { name: 'Audio volume', exact: true }).fill('0.4');
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.volume)).toBeCloseTo(.4);

  await page.keyboard.press('Escape');
  await page.locator('#deleteSelection').click();
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.locator('#assetSearch').fill('mix');
  await expect(page.getByRole('button', { name: 'Delete unused' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete unused' }).click();
  await expect(page.locator('[data-asset]')).toHaveCount(0);
  await expect.poll(async () => readdir(path.join(directory, 'assets', 'studio'))).toEqual([]);
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

  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
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

  await page.getByRole('tab', { name: 'References' }).click();
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

test('picks colors visually and reframes the real project with canvas presets', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await expect(page.locator('[data-canvas-width="1080"][data-canvas-height="1920"]')).toBeVisible();
  await page.locator('[data-canvas-width="1080"][data-canvas-height="1920"]').click();
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { width: number; height: number };
    return [project.width, project.height];
  }).toEqual([1080, 1920]);
  await expect(page.locator('#monitor')).toHaveCSS('aspect-ratio', '1080 / 1920');

  await page.locator('[data-select="layer"][data-id="accent"]').click();
  const picker = page.locator('[data-color-open="fill"]');
  await picker.click();
  await expect(page.locator('#colorPopover')).toBeVisible();
  await page.locator('[data-color-hex]').fill('#ff2d55');
  await page.locator('[data-color-hex]').press('Tab');
  await page.locator('[data-color-apply]').click();
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; fill?: string }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.fill;
  }).toBe('#ff2d55');
  await expect(page.locator('[data-color-open="fill"] .color-chip')).toHaveCSS('background-color', 'rgb(255, 45, 85)');
});

test('authors the complete IR from Studio without relying on agent chat', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(studio?.url ?? '');

  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const source = page.locator('#projectSource');
  const project = JSON.parse(await source.inputValue()) as { metadata: Record<string, string>; scenes: Array<{ transitionOut: unknown }> };
  project.metadata.studioParity = 'verified';
  project.scenes[0]!.transitionOut = { type: 'blur', duration: 0.2, ease: { type: 'spring', mass: 1, stiffness: 180, damping: 28, velocity: 0 } };
  await source.fill(JSON.stringify(project, null, 2));
  await page.locator('#applyProjectSource').click();
  await expect.poll(async () => {
    const saved = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { metadata: Record<string, string> };
    return saved.metadata.studioParity;
  }).toBe('verified');

  await page.locator('#addLayer').click();
  await page.locator('[data-new-layer="text"]').click();
  await expect.poll(async () => {
    const saved = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ type: string }> }> };
    return saved.scenes[0]?.layers.filter((layer) => layer.type === 'text').length;
  }).toBe(2);
  await expect(page.getByText('Direct animation tracks')).toBeVisible();
  await page.locator('#addTrack').click();
  await page.locator('[data-ease-kind]').first().click();
  await page.locator('[data-ease-choice="spring"]').click();
  await expect.poll(async () => {
    const saved = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ type: string; tracks?: Array<{ keyframes: Array<{ ease: unknown }> }> }> }> };
    const layer = saved.scenes[0]?.layers.filter((item) => item.type === 'text').at(-1);
    return layer?.tracks?.[0]?.keyframes[0]?.ease;
  }).toMatchObject({ type: 'spring', stiffness: 170 });
  await page.locator('[data-ease-kind]').nth(1).click();
  await page.locator('[data-ease-choice="cubic-bezier"]').click();
  const curve = page.locator('[data-ease-curve]').first();
  const handle = curve.locator('[data-ease-handle="1"]');
  await expect(handle).toBeVisible();
  await handle.focus();
  await handle.press('Shift+ArrowRight');
  await expect.poll(async () => {
    const saved = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ type: string; tracks?: Array<{ keyframes: Array<{ ease: unknown }> }> }> }> };
    const layer = saved.scenes[0]?.layers.filter((item) => item.type === 'text').at(-1);
    return layer?.tracks?.[0]?.keyframes[1]?.ease;
  }).toMatchObject({ type: 'cubic-bezier' });
  await expect(page.locator('[data-field$=".ease.x1"]').first()).toHaveValue('0.3');
  expect(errors).toEqual([]);
});

test('round-trips typed tracks, procedural noise, hierarchy, and stagger controls', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const source = page.locator('#projectSource');
  const project = JSON.parse(await source.inputValue()) as { scenes: Array<{ layers: Array<Record<string, unknown>> }> };
  const accent = project.scenes[0]!.layers.find((layer) => layer.id === 'accent')!;
  const title = project.scenes[0]!.layers.find((layer) => layer.id === 'title')!;
  accent.tracks = [{
    id: 'fill-shift', target: 'fill', operation: 'replace', interpolation: 'linear', extrapolate: 'clamp',
    extrapolateLeft: 'identity', extrapolateRight: 'ping-pong', enabled: true,
    keyframes: [{ at: 0, value: '#111820', ease: 'linear', hold: false }, { at: 1, value: '#59e3a6', ease: 'sine-in-out', hold: false }],
  }, {
    id: 'seeded-drift', target: 'transform.x', operation: 'add', interpolation: 'linear', extrapolate: 'clamp', enabled: true,
    noise: { seed: 4, amplitude: 3, frequency: 0.5, octaves: 2, lacunarity: 2, gain: 0.5 },
    keyframes: [{ at: 0, value: 0, ease: 'linear', hold: false }, { at: 1, value: 4, ease: 'linear', hold: false }],
  }];
  accent.stagger = { index: 0, count: 2, each: 0.08, from: 'center', seed: 4, trail: 0.2 };
  title.parentId = 'accent';
  await source.fill(JSON.stringify(project, null, 2));
  await page.locator('#applyProjectSource').click();

  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await page.locator('[data-select="layer"][data-id="accent"]').click();
  await expect(page.locator('[data-field="tracks.0.keyframes.0.value"]')).toHaveValue('#111820');
  await expect(page.locator('[data-select-field="tracks.0.extrapolateLeft"]')).toHaveText('identity');
  await expect(page.locator('[data-select-field="tracks.0.extrapolateRight"]')).toHaveText('ping-pong');
  await expect(page.locator('[data-field="tracks.1.noise.amplitude"]')).toHaveValue('3');
  await expect(page.locator('[data-field="stagger.each"]')).toHaveValue('0.08');
  await page.locator('[data-field="tracks.1.noise.amplitude"]').fill('4.5');
  await page.locator('[data-field="tracks.1.noise.amplitude"]').press('Tab');
  await page.locator('[data-select="layer"][data-id="title"]').click();
  await expect(page.locator('[data-field="parentId"]')).toHaveValue('accent');
  await page.locator('[data-field="parentId"]').fill('');
  await page.locator('[data-field="parentId"]').press('Tab');

  await expect.poll(async () => {
    const saved = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; parentId?: string; tracks?: Array<{ noise?: { amplitude: number } }> }> }> };
    return {
      amplitude: saved.scenes[0]!.layers.find((layer) => layer.id === 'accent')?.tracks?.[1]?.noise?.amplitude,
      hasParent: Object.hasOwn(saved.scenes[0]!.layers.find((layer) => layer.id === 'title')!, 'parentId'),
    };
  }).toEqual({ amplitude: 4.5, hasParent: false });
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
  await expect(page.getByRole('tab', { name: 'Editor', exact: true })).toHaveClass(/active/);
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

test('supports keyboard tab navigation and focus-contained dialogs', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  const workflow = page.getByRole('tab', { name: 'Workflow' });
  await workflow.focus();
  await workflow.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Editor' })).toHaveAttribute('aria-selected', 'true');
  const exportButton = page.getByRole('button', { name: 'Export' });
  await exportButton.focus();
  await exportButton.press('Enter');
  await expect(page.locator('.modal')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.modal')).toContainText('Export master');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toHaveClass(/open/);
  await expect(exportButton).toBeFocused();
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
  await expect(page.locator('.select-button .ui-icon')).toHaveCount(3);
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
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await expect(page.locator('#previewImage')).toHaveAttribute('src', /\/frame\/30\.png/);
  await page.getByRole('tab', { name: 'Workflow', exact: true }).click();

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

  await page.getByRole('tab', { name: 'References' }).click();
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

  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await expect(page.locator('#previewImage')).toHaveJSProperty('naturalWidth', 320);

  await page.locator('[data-layerclip="accent"]').click();
  await page.locator('#addTrack').click();
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; tracks?: unknown[] }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'accent')?.tracks?.length ?? 0;
  }).toBe(1);
  await expect(page.getByText('Direct animation tracks')).toBeVisible();
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

  await expect(page.locator('[data-stage-layer="accent"]')).toBeVisible();
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

  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.locator('#assetPicker').setInputFiles({ name: 'music.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF0000WAVEfmt ') });
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { audio: Array<{ id: string }> };
    return project.audio.length;
  }).toBe(1);
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await expect(page.locator('[data-audioclip]')).toBeVisible();
  await page.locator('[data-audioclip]').press('ArrowRight');
  await expect(page.locator('#selectionKind')).toHaveText('audio');
  expect(errors).toEqual([]);
});

test('persists text inspector changes through stable semantic transactions', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.getByRole('tab', { name: 'Editor', exact: true }).click();
  await page.locator('[data-layerclip="title"]').click();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/edit') && response.request().method() === 'POST');
  const text = page.locator('[data-field="text"]');
  await text.fill('Native text edit');
  await text.press('Tab');
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ receipt: { state: 'verified', evidence: { verificationScope: 'source-document', readback: { status: 'matched' } }, changed: true, affectedTargets: [{ kind: 'scene', id: 'intro', layerId: 'title' }] } });
  await expect.poll(async () => {
    const project = JSON.parse(await readFile(path.join(directory, 'genmotion.json'), 'utf8')) as { scenes: Array<{ layers: Array<{ id: string; text?: string }> }> };
    return project.scenes[0]?.layers.find((layer) => layer.id === 'title')?.text;
  }).toBe('Native text edit');
  await expect(page.locator('#previewImage')).toHaveJSProperty('naturalWidth', 320);
});

test('queues one export and announces completion once', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByText('1920×1080', { exact: true })).toBeVisible();
  await page.locator('[data-field="render.filename"]').fill('e2e-browser-export.mp4');
  await page.getByText('Render limits', { exact: true }).click();
  await page.locator('[data-field="render.workers"]').fill('2');
  await page.locator('[data-field="render.maxBufferedFrames"]').fill('1');
  await page.locator('#startRender').evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(async () => {
    const jobs = await fetch(`${studio?.url ?? ''}/api/jobs`).then((response) => response.json()) as Array<{ status: string; width?: number; height?: number }>;
    if (jobs[0]) expect(jobs[0]).toMatchObject({ width: 1920, height: 1080 });
    return jobs.length;
  }).toBe(1);
  await expect(page.getByText(/Export ready:/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Export ready:/)).toHaveCount(1);
  await expect(page.locator('#renderProgress')).toContainText('Export complete');
  const completedJobs = await fetch(`${studio?.url ?? ''}/api/jobs`).then((response) => response.json()) as Array<{ diagnostics?: { maxBufferedFrames: number; stage: string } }>;
  expect(completedJobs[0]?.diagnostics).toMatchObject({ maxBufferedFrames: 1, stage: 'complete' });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#renderProgress').getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('e2e-browser-export.mp4');
  await expect(page.locator('#startRender')).toHaveText('Export again');
  await page.locator('#modalClose').click();
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.getByText('Evaluated frame 0')).toBeVisible();
  await page.locator('[data-inspect-export="e2e-browser-export.mp4"]').click();
  await expect(page.getByText('Encoded contract')).toBeVisible();
  await expect(page.locator('#modalBody')).toContainText('1920');
  await page.locator('#createContactSheet').click();
  const sheet = page.getByRole('img', { name: 'Contact sheet for e2e-browser-export.mp4' });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => sheet.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(1_000);
});

test('cancels an export from Studio and returns the dialog to a reusable state', async ({ page }) => {
  await page.goto(studio?.url ?? '');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.locator('[data-field="render.filename"]').fill('e2e-cancelled-export.mp4');
  await page.locator('#startRender').click();
  const cancel = page.getByRole('button', { name: 'Cancel export' });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(page.locator('#renderProgress')).toContainText('Export cancelled');
  await expect(page.locator('#startRender')).toBeEnabled();
  await expect(page.locator('#startRender')).toHaveText('Start render');
  await expect.poll(async () => {
    const jobs = await fetch(`${studio?.url ?? ''}/api/jobs`).then((response) => response.json()) as Array<{ output?: string; status: string }>;
    return jobs.find((job) => job.output?.endsWith('e2e-cancelled-export.mp4'))?.status;
  }).toBe('cancelled');
  await expect(stat(path.join(directory ?? '', 'renders', 'e2e-cancelled-export.mp4'))).rejects.toMatchObject({ code: 'ENOENT' });
});
