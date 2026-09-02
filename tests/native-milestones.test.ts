import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCaptions, serializeCaptions } from '../src/captions.js';
import { renderFramePng } from '../src/engine/draw.js';
import { flattenPath, normalizePath, pathMetrics, samplePath } from '../src/engine/path.js';
import { compositionCycles, compositionDependencyGraph, compositionUses } from '../src/ir/compositions.js';
import { resolveParameters } from '../src/ir/parameters.js';
import { projectSchema } from '../src/ir/schema.js';

function project() {
  return projectSchema.parse({
    schemaVersion: 1, id: 'milestones', title: 'Native milestones', width: 320, height: 180, fps: 30,
    parameters: [{ id: 'accent', label: 'Accent', type: 'color', default: '#00ffaa' }],
    variants: [{ id: 'violet', label: 'Violet', values: { accent: '#8855ff' } }],
    compositions: [{ id: 'badge', width: 100, height: 40, duration: 2, layers: [{ id: 'badge-shape', type: 'shape', shape: 'round-rect', x: 0, y: 0, width: 100, height: 40, radius: 12, fill: '#00ffaa', bindings: { fill: 'accent' } }] }],
    brand: { background: '#000', foreground: '#fff', accent: '#0f0', muted: '#777' },
    scenes: [{ id: 'one', purpose: 'Exercise native features', duration: 2, background: '#05070a', transitionOut: { type: 'crossfade', presentation: 'iris', duration: 0.25, ease: 'linear', timing: 'sine-in-out' }, layers: [
      { id: 'nested', type: 'composition', compositionId: 'badge', x: 110, y: 30, width: 100, height: 40 },
      { id: 'route', type: 'shape', shape: 'path', path: 'M 20 130 C 80 40 240 40 300 130', x: 20, y: 90, width: 280, height: 60, stroke: '#ffffff', strokeWidth: 4, progress: { keyframes: [{ at: 0, value: 0 }, { at: 1, value: 1 }] } },
      { id: 'captions', type: 'caption', x: 40, y: 130, width: 240, height: 40, fontFamily: 'Arial', fontSize: 18, color: '#fff', background: '#000000cc', cues: [{ id: 'hello', start: 0, end: 1.5, text: 'Native captions', words: [] }] },
    ] }],
  });
}

describe('five native capability milestones', () => {
  it('resolves typed parameters through reusable compositions', () => {
    const source = project();
    const resolved = resolveParameters(source, { accent: '#8855ff' });
    expect(resolved.compositions[0]?.layers[0]).toMatchObject({ fill: '#8855ff' });
    expect(compositionDependencyGraph(source)).toEqual({ badge: [] });
    expect(compositionUses(source, 'badge')).toEqual([{ container: 'scene', containerId: 'one', layerId: 'nested' }]);
    const cyclic = structuredClone(source);
    cyclic.compositions[0]!.layers = [{ ...cyclic.scenes[0]!.layers[0]!, id: 'self', type: 'composition', compositionId: 'badge', x: 0, y: 0, width: 100, height: 40, timeOffset: 0, timeScale: 1, loop: false }];
    expect(compositionCycles(cyclic)).toEqual([['badge', 'badge']]);
    expect(() => resolveParameters(project(), { accent: 42 })).toThrow(/requires a string/);
  });

  it('measures, samples, and trims arbitrary SVG paths deterministically', () => {
    const data = 'M0 0 C20 80 80 80 100 0';
    expect(pathMetrics(data).length).toBeGreaterThan(100);
    expect(samplePath(data, 0.5).y).toBeGreaterThan(40);
    expect(samplePath(data, 0.5).normalY).toBeGreaterThan(0);
    expect(flattenPath(data, 0, 0.5, 2).at(-1)?.[0]).toBeCloseTo(50, 0);
    expect(normalizePath('m0 0 l10 0', 1)).toMatch(/^M0\.0000 0\.0000 L/);
  });

  it('round-trips SRT and WebVTT cues', () => {
    const cues = parseCaptions('1\n00:00:00,000 --> 00:00:01,250\nHello world\n', 'srt');
    expect(cues).toHaveLength(1);
    expect(parseCaptions(serializeCaptions(cues, 'vtt'), 'vtt')[0]?.text).toBe('Hello world');
  });

  it('keeps transition timing independent from presentation', () => {
    expect(project().scenes[0]?.transitionOut).toMatchObject({ presentation: 'iris', timing: 'sine-in-out' });
  });

  it('renders nested compositions, paths, and captions deterministically', async () => {
    const frame = await renderFramePng(project(), process.cwd(), 15);
    const again = await renderFramePng(project(), process.cwd(), 15);
    expect(frame.length).toBeGreaterThan(1_000);
    expect(createHash('sha256').update(frame).digest('hex')).toBe(createHash('sha256').update(again).digest('hex'));
  });
});
