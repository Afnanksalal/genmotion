import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../src/ir/loader.js';
import { renderFrame } from '../src/engine/draw.js';

describe('scene transitions', () => {
  it('does not emit a blank frame at an exact scene boundary', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-transition-'));
    try {
      const layer = (id: string, fill: string) => ({ id, type: 'shape', shape: 'rect', x: 0, y: 0, width: 64, height: 64, fill });
      await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify({
        schemaVersion: 1, id: 'transition-test', title: 'Transition', width: 64, height: 64, fps: 10,
        brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
        scenes: [
          { id: 'one', purpose: 'One', duration: 1, background: '#000', transitionOut: { type: 'crossfade', duration: 0.2 }, layers: [layer('red', '#ff0000')] },
          { id: 'two', purpose: 'Two', duration: 1, background: '#000', transitionIn: { type: 'crossfade', duration: 0.2 }, layers: [layer('green', '#00ff00')] },
        ],
      }));
      const loaded = await loadProject(directory);
      const rgba = await renderFrame(loaded.project, loaded.projectDir, 10);
      let energy = 0;
      for (let index = 0; index < rgba.length; index += 4) energy += (rgba[index] ?? 0) + (rgba[index + 1] ?? 0) + (rgba[index + 2] ?? 0);
      expect(energy).toBeGreaterThan(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
