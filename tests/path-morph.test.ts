import { describe, expect, it } from 'vitest';
import { compatiblePaths, interpolatePath } from '../src/engine/path-editing.js';
import { pathMetrics } from '../src/engine/path.js';
import { renderFrame } from '../src/engine/draw.js';
import { loadProjectDocument } from '../src/ir/loader.js';
import { projectSchema } from '../src/ir/schema.js';
import { validateProject } from '../src/ir/validate.js';
import path from 'node:path';

const square = 'M0 0H100V100H0Z', triangle = 'M50 0L100 100L0 100Z';
describe('native path morph tracks', () => {
  it('normalizes dissimilar segment counts and retains independent closed contours', () => {
    const [a, b] = compatiblePaths(square, triangle);
    expect(a.match(/C/g)).toHaveLength(4);
    expect(b.match(/C/g)).toHaveLength(4);
    expect(pathMetrics(a).length).toBeCloseTo(400, 2);
    expect(pathMetrics(b).length).toBeCloseTo(pathMetrics(triangle).length, 2);
    const mid = interpolatePath(square + ' M20 20V80H80V20Z', triangle + ' M50 30L30 70L70 70Z', 0.5);
    expect(mid.match(/M/g)).toHaveLength(2);
    expect(mid.match(/Z/g)).toHaveLength(2);
    expect(() => compatiblePaths(square, triangle + ' M0 0L1 1')).toThrow('contour counts');
    expect(() => compatiblePaths(square, 'M0 0L1 1')).toThrow('topology');
    expect(() => interpolatePath(square, triangle, NaN)).toThrow('finite');
  });
  it('renders deterministic intermediate native frames and reports invalid topology before persistence', async () => {
    const project = projectSchema.parse({ schemaVersion: 1, id: 'morph', title: 'Morph', width: 100, height: 100, fps: 30,
      brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' },
      scenes: [{ id: 'main', purpose: 'Native morph', duration: 2, background: '#000', layers: [{ id: 'shape', type: 'shape', shape: 'path', x: 0, y: 0, width: 100, height: 100, path: square, fill: '#fff', tracks: [{ id: 'morph', target: 'path', keyframes: [{ at: 0, value: square }, { at: 1, value: triangle }] }] }] }],
    });
    const loaded = await loadProjectDocument(project, path.resolve('tests/fixtures/basic/genmotion.json'));
    expect((await validateProject(loaded)).filter((finding) => finding.severity === 'error')).toEqual([]);
    const start = await renderFrame(project, process.cwd(), 0), middle = await renderFrame(project, process.cwd(), 15), end = await renderFrame(project, process.cwd(), 30);
    expect(middle).not.toEqual(start); expect(middle).not.toEqual(end);
    expect(await renderFrame(project, process.cwd(), 15)).toEqual(middle);
    loaded.project.scenes[0]!.layers[0]!.tracks[0]!.keyframes[1]!.value = 'M0 0L1 1';
    expect(await validateProject(loaded)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TRACK_PATH_INVALID', severity: 'error' })]));
  });
});
