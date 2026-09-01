import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../src/ir/loader.js';
import { renderFrame } from '../src/engine/draw.js';

function pixel(rgba: Buffer): [number, number, number, number] {
  return [rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 0];
}

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

  it('keeps paired outgoing and incoming transitions continuous across the scene boundary', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-transition-continuity-'));
    try {
      const layer = (id: string, fill: string) => ({ id, type: 'shape', shape: 'rect', x: 0, y: 0, width: 64, height: 64, fill });
      const transition = { type: 'crossfade', duration: 0.2, ease: 'linear' };
      await writeFile(path.join(directory, 'genmotion.json'), JSON.stringify({
        schemaVersion: 1, id: 'transition-continuity', title: 'Transition continuity', width: 64, height: 64, fps: 10,
        brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
        scenes: [
          { id: 'one', purpose: 'One', duration: 1, background: '#000', transitionOut: transition, layers: [layer('red', '#ff0000')] },
          { id: 'two', purpose: 'Two', duration: 1, background: '#000', transitionIn: transition, layers: [layer('green', '#00ff00')] },
        ],
      }));
      const loaded = await loadProject(directory);
      const colors = await Promise.all([8, 9, 10, 11, 12].map(async (frame) => pixel(await renderFrame(loaded.project, loaded.projectDir, frame))));
      const reds = colors.map((color) => color[0]);
      const greens = colors.map((color) => color[1]);
      expect(reds).toEqual([...reds].sort((left, right) => right - left));
      expect(greens).toEqual([...greens].sort((left, right) => left - right));
      expect(greens[2]).toBeGreaterThan(greens[1] ?? 0);
      expect(reds[2]).toBeLessThan(reds[1] ?? 255);
      expect((reds[2] ?? 0) + (greens[2] ?? 0)).toBeGreaterThanOrEqual(250);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
