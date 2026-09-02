import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadProject } from '../src/ir/loader.js';
import type { GenmotionProject } from '../src/ir/schema.js';
import { hasErrors, summarizeProject, validateProject } from '../src/ir/validate.js';

describe('production validation findings', () => {
  it('reports unsafe timing, ownership, media, readability, and reference states together', async () => {
    const loaded = await loadProject(path.resolve('tests/fixtures/basic'));
    const project: GenmotionProject = structuredClone(loaded.project);
    const scene = project.scenes[0]!;
    const shape = scene.layers.find((layer) => layer.type === 'shape');
    const text = scene.layers.find((layer) => layer.type === 'text');
    if (!shape || !text) throw new Error('The validation fixture must include shape and text layers.');

    project.brand.fonts = [{ family: 'Missing font', file: 'assets/missing-font.ttf' }];
    scene.transitionIn.duration = scene.duration;
    scene.referenceDecisions = [{ referenceId: 'missing-reference', borrow: [], avoid: [], transform: [] }];
    shape.start = scene.duration;
    shape.duration = scene.duration;
    shape.transform.opacity = { keyframes: [{ at: 0.5, value: 2, ease: 'linear' }, { at: 0.25, value: -1, ease: 'linear' }] };
    shape.transform.scaleX = 0;
    shape.tracks = [
      { id: 'duplicate', target: 'transform.opacity', operation: 'replace', extrapolate: 'clamp', enabled: true, keyframes: [{ at: 0, value: -1, ease: 'linear' }, { at: 3, value: 2, ease: 'linear' }] },
      { id: 'duplicate', target: 'width', operation: 'replace', extrapolate: 'clamp', enabled: true, keyframes: [{ at: 0, value: 10, ease: 'linear' }, { at: 3, value: 0, ease: 'linear' }] },
    ];
    text.fontFile = 'assets/missing-layer-font.ttf';
    text.fontSize = 1;
    text.x = -1;
    text.y = -1;
    text.width = project.width + 10;
    text.height = project.height + 10;
    text.transform.x = project.width * 2;
    text.color = scene.background;
    scene.layers.push(...Array.from({ length: 5 }, (_, index) => ({ ...structuredClone(shape), id: `dense-${index}`, z: 0, start: 0, duration: 0.5, tracks: [] })));
    project.audio = [{ id: 'missing-audio', src: 'assets/missing.wav', start: 0, trimStart: 0, duration: 1, volume: 1, pan: 0, fadeIn: 0.75, fadeOut: 0.75, muted: false, solo: false, loop: false, duckUnderVoice: false, kind: 'music' }];

    const findings = await validateProject({ ...loaded, project, sourceProject: project });
    const codes = new Set(findings.map((finding) => finding.code));
    expect([...codes]).toEqual(expect.arrayContaining([
      'FONT_MISSING', 'TRANSITION_TOO_LONG', 'REFERENCE_UNKNOWN', 'REFERENCE_DECISION_INCOMPLETE', 'LAYER_OUTSIDE_SCENE',
      'LAYER_OVERRUN', 'OPACITY_RANGE', 'KEYFRAMES_UNORDERED', 'SCALE_NON_POSITIVE', 'DUPLICATE_TRACK_ID', 'TRACK_OVERRUN',
      'TRACK_NON_POSITIVE', 'LAYER_ALWAYS_OUTSIDE_FRAME', 'ASSET_MISSING', 'TEXT_TOO_SMALL', 'TEXT_OUTSIDE_FRAME', 'TEXT_CONTRAST', 'TEXT_SAFE_AREA',
      'DENSE_Z_PLANE', 'AUDIO_MISSING', 'AUDIO_FADE_OVERLAP',
    ]));
    expect(hasErrors(findings)).toBe(true);
    expect(summarizeProject(project)).toMatchObject({ scenes: 1, layers: 7, audioTracks: 1, resolution: '320x180', fps: 30 });
  });

  it('warns when a project exceeds the supported editorial duration', async () => {
    const loaded = await loadProject(path.resolve('tests/fixtures/basic'));
    const project = structuredClone(loaded.project);
    project.scenes[0]!.duration = 3_601;
    const findings = await validateProject({ ...loaded, project, sourceProject: project });
    expect(findings).toContainEqual(expect.objectContaining({ code: 'DURATION_EXCESSIVE', severity: 'warning' }));
  });

  it('rejects conflicting transition definitions on the same scene boundary', async () => {
    const loaded = await loadProject(path.resolve('tests/fixtures/basic'));
    const project = structuredClone(loaded.project);
    const first = project.scenes[0]!;
    const second = structuredClone(first);
    second.id = 'second-scene';
    second.layers = second.layers.map((layer) => ({ ...layer, id: `second-${layer.id}` }));
    first.transitionOut = { type: 'crossfade', duration: 0.2, ease: 'linear' };
    second.transitionIn = { type: 'slide-left', duration: 0.2, ease: 'cubic-in-out' };
    project.scenes.push(second);

    const findings = await validateProject({ ...loaded, project, sourceProject: project });
    expect(findings).toContainEqual(expect.objectContaining({ code: 'TRANSITION_BOUNDARY_MISMATCH', severity: 'error' }));
  });

  it('rejects duplicate and dangling geometry anchors', async () => {
    const loaded = await loadProject(path.resolve('tests/fixtures/basic'));
    const project = structuredClone(loaded.project);
    project.anchors = [{ id: 'target', x: 80, y: 45 }, { id: 'target', x: 82, y: 45 }];
    const shape = project.scenes[0]!.layers.find((layer) => layer.type === 'shape');
    if (!shape || shape.type !== 'shape') throw new Error('Expected a shape fixture.');
    shape.shape = 'line';
    shape.endAnchor = 'missing';
    const findings = await validateProject({ ...loaded, project, sourceProject: project });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_ANCHOR_ID', severity: 'error' }),
      expect.objectContaining({ code: 'ANCHOR_UNKNOWN', severity: 'error' }),
    ]));
  });
});
