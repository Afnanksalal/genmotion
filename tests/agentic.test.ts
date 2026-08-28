import { describe, expect, it } from 'vitest';
import { applyPatch } from '../src/ir/patch.js';
import { projectSchema } from '../src/ir/schema.js';
import { evaluateLayerTracks } from '../src/engine/animation.js';
import { ease } from '../src/engine/easing.js';

describe('agent-authored composition primitives', () => {
  it('evaluates arbitrary property tracks without named recipes', () => {
    const project = projectSchema.parse({
      schemaVersion: 1, id: 'agent-motion', title: 'Agent motion', width: 1920, height: 1080, fps: 30, seed: 1,
      brand: { background: '#000000', foreground: '#ffffff', accent: '#ff0000', muted: '#888888', fonts: [], radius: 16, tone: [] },
      scenes: [{ id: 'scene', purpose: 'Agent-authored movement', duration: 2, background: '#000000', layers: [{
        id: 'subject', type: 'shape', shape: 'path', path: 'M0 0 L100 0 L50 100 Z', x: 0, y: 0, width: 100, height: 100,
        fill: '#ff0000', strokeWidth: 0, radius: 0, progress: 1, start: 0, duration: 2, z: 0, visible: true,
        transform: {}, blendMode: 'source-over', tags: [], motion: [], tracks: [
          { id: 'travel', target: 'x', operation: 'replace', extrapolate: 'clamp', enabled: true, keyframes: [{ at: 0, value: 0, ease: 'linear' }, { at: 2, value: 600, ease: { type: 'cubic-bezier', x1: 0.2, y1: 0.8, x2: 0.2, y2: 1 } }] },
          { id: 'pulse', target: 'transform.scaleX', operation: 'replace', extrapolate: 'ping-pong', enabled: true, keyframes: [{ at: 0, value: 1, ease: 'linear' }, { at: 0.5, value: 1.2, ease: { type: 'spring', mass: 1, stiffness: 170, damping: 26, velocity: 0 } }] },
        ],
      }], transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' }, referenceDecisions: [], notes: [] }],
      audio: [], metadata: {},
    });
    const evaluated = evaluateLayerTracks(project.scenes[0]!.layers[0]!, 1);
    expect(evaluated.x).toBeGreaterThan(300);
    expect(evaluated.transform.scaleX).toBeCloseTo(1, 5);
    expect(evaluated.motion).toEqual([]);
  });

  it('supports transactional granular patches and protects prototypes', () => {
    const source = { scenes: [{ id: 'one' }], metadata: {} };
    const result = applyPatch(source, [
      { op: 'test', path: '/scenes/0/id', value: 'one' },
      { op: 'replace', path: '/scenes/0/id', value: 'hero' },
      { op: 'add', path: '/metadata/direction', value: 'editorial' },
      { op: 'copy', from: '/scenes/0', path: '/scenes/-' },
      { op: 'move', from: '/metadata/direction', path: '/metadata/style' },
    ]);
    expect(result).toEqual({ scenes: [{ id: 'hero' }, { id: 'hero' }], metadata: { style: 'editorial' } });
    expect(source).toEqual({ scenes: [{ id: 'one' }], metadata: {} });
    expect(() => applyPatch(source, [{ op: 'add', path: '/__proto__/polluted', value: true }])).toThrow(/prototypes/);
  });

  it('evaluates custom timing functions as authored data', () => {
    expect(ease({ type: 'cubic-bezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }, 0.5)).toBeGreaterThan(0.5);
    expect(ease({ type: 'spring', mass: 1, stiffness: 170, damping: 26, velocity: 0 }, 0)).toBeCloseTo(0, 5);
  });
});
