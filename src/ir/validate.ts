import { access } from 'node:fs/promises';
import type { GenmotionProject, Layer } from './schema.js';
import { projectDuration } from './schema.js';
import { resolveProjectAsset, type LoadedProject } from './loader.js';
import { tasteReferences } from '../catalog/references.js';
import { evaluateLayerTracks } from '../engine/animation.js';
import { evaluateNumber } from '../engine/timeline.js';

export type Severity = 'error' | 'warning';

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  location?: string;
}

function collectAsset(layer: Layer): string | undefined {
  return layer.type === 'image' || layer.type === 'video' ? layer.src : layer.type === 'text' ? layer.fontFile : undefined;
}

function animatedValues(value: Layer['transform']['opacity']): number[] {
  return typeof value === 'number' ? [value] : value.keyframes.map((keyframe) => keyframe.value);
}

function hexRgb(value: string): [number, number, number] | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (!match?.[1]) return undefined;
  const hex = match[1].length === 3 ? match[1].split('').map((character) => character + character).join('') : match[1].slice(0, 6);
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

function luminance(rgb: [number, number, number]): number {
  const values = rgb.map((component) => {
    const value = component / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (values[0] ?? 0) * 0.2126 + (values[1] ?? 0) * 0.7152 + (values[2] ?? 0) * 0.0722;
}

function contrast(left: string, right: string): number | undefined {
  const a = hexRgb(left);
  const b = hexRgb(right);
  if (!a || !b) return undefined;
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function validateAnimated(value: Layer['transform']['opacity'], location: string, findings: Finding[]): void {
  if (typeof value === 'number') return;
  for (let index = 1; index < value.keyframes.length; index += 1) {
    const previous = value.keyframes[index - 1];
    const current = value.keyframes[index];
    if (previous && current && current.at <= previous.at) findings.push({ code: 'KEYFRAMES_UNORDERED', severity: 'error', message: 'Keyframe times must be strictly increasing.', location });
  }
}

function layerBox(layer: Layer): { x: number; y: number; width: number; height: number } {
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}

function layerIsAlwaysOutsideFrame(layer: Layer, sceneDuration: number, width: number, height: number): boolean {
  const visibleDuration = layer.duration ?? sceneDuration - layer.start;
  const times = new Set([0, Math.max(0, visibleDuration - 0.001)]);
  for (const property of [layer.transform.x, layer.transform.y]) {
    if (typeof property !== 'number') for (const keyframe of property.keyframes) times.add(Math.min(visibleDuration, keyframe.at));
  }
  for (const track of layer.tracks) for (const keyframe of track.keyframes) times.add(Math.min(visibleDuration, keyframe.at));
  const box = layerBox(layer);
  return [...times].every((time) => {
    const evaluated = evaluateLayerTracks(layer, time);
    const x = box.x + evaluateNumber(evaluated.transform.x, time);
    const y = box.y + evaluateNumber(evaluated.transform.y, time);
    return x >= width || y >= height || x + box.width <= 0 || y + box.height <= 0;
  });
}

export async function validateProject(loaded: LoadedProject): Promise<Finding[]> {
  const findings: Finding[] = [];
  const { project, projectDir } = loaded;
  const ids = new Set<string>();
  const referenceIds = new Set(tasteReferences.map((reference) => reference.id));

  if (projectDuration(project) > 3_600) {
    findings.push({ code: 'DURATION_EXCESSIVE', severity: 'warning', message: 'Project duration exceeds one hour.' });
  }

  for (const font of project.brand.fonts) {
    const asset = resolveProjectAsset(projectDir, font.file);
    try { await access(asset); } catch {
      findings.push({ code: 'FONT_MISSING', severity: 'error', message: `Font file does not exist: ${font.file}`, location: 'brand.fonts' });
    }
  }

  for (const [sceneIndex, scene] of project.scenes.entries()) {
    if (ids.has(scene.id)) findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate id: ${scene.id}`, location: `scenes.${sceneIndex}` });
    ids.add(scene.id);
    if (scene.transitionIn.duration > scene.duration / 2 || scene.transitionOut.duration > scene.duration / 2) findings.push({ code: 'TRANSITION_TOO_LONG', severity: 'error', message: `${scene.id} transition consumes more than half the scene.`, location: `scenes.${sceneIndex}` });
    const previousScene = project.scenes[sceneIndex - 1];
    if (previousScene) {
      const outgoing = previousScene.transitionOut;
      const incoming = scene.transitionIn;
      const hasOutgoing = outgoing.type !== 'cut' && outgoing.duration > 0;
      const hasIncoming = incoming.type !== 'cut' && incoming.duration > 0;
      if (hasOutgoing && hasIncoming && (outgoing.type !== incoming.type || JSON.stringify(outgoing.ease) !== JSON.stringify(incoming.ease))) {
        findings.push({
          code: 'TRANSITION_BOUNDARY_MISMATCH',
          severity: 'error',
          message: `${previousScene.id} transitionOut and ${scene.id} transitionIn must use the same type and easing when both sides are active.`,
          location: `scenes.${sceneIndex}.transitionIn`,
        });
      }
    }
    for (const decision of scene.referenceDecisions) {
      if (!referenceIds.has(decision.referenceId)) findings.push({ code: 'REFERENCE_UNKNOWN', severity: 'error', message: `Unknown taste reference: ${decision.referenceId}`, location: `scenes.${sceneIndex}.referenceDecisions` });
      if (decision.borrow.length === 0 || decision.avoid.length === 0 || decision.transform.length === 0) findings.push({ code: 'REFERENCE_DECISION_INCOMPLETE', severity: 'warning', message: `${decision.referenceId} should state borrow, avoid, and transform decisions.`, location: `scenes.${sceneIndex}.referenceDecisions` });
    }

    const zCounts = new Map<number, number>();
    for (const [layerIndex, layer] of scene.layers.entries()) {
      const location = `scenes.${sceneIndex}.layers.${layerIndex}`;
      if (ids.has(layer.id)) findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate id: ${layer.id}`, location });
      ids.add(layer.id);
      zCounts.set(layer.z, (zCounts.get(layer.z) ?? 0) + 1);

      if (layer.start >= scene.duration) findings.push({ code: 'LAYER_OUTSIDE_SCENE', severity: 'error', message: `${layer.id} starts after its scene ends.`, location });
      if (layer.duration && layer.start + layer.duration > scene.duration + 0.001) findings.push({ code: 'LAYER_OVERRUN', severity: 'warning', message: `${layer.id} extends beyond its scene and will be clipped.`, location });
      if (animatedValues(layer.transform.opacity).some((value) => value < 0 || value > 1)) findings.push({ code: 'OPACITY_RANGE', severity: 'error', message: `${layer.id} opacity must remain between 0 and 1.`, location });
      for (const property of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'blur'] as const) validateAnimated(layer.transform[property], `${location}.transform.${property}`, findings);
      if (animatedValues(layer.transform.scaleX).some((value) => value <= 0) || animatedValues(layer.transform.scaleY).some((value) => value <= 0)) findings.push({ code: 'SCALE_NON_POSITIVE', severity: 'error', message: `${layer.id} scale must stay greater than zero.`, location });
      if (layerIsAlwaysOutsideFrame(layer, scene.duration, project.width, project.height)) findings.push({ code: 'LAYER_ALWAYS_OUTSIDE_FRAME', severity: 'error', message: `${layer.id} remains outside the delivery frame at every authored transform keyframe. Layer x/y are absolute layout coordinates; transform x/y are additional offsets.`, location });
      const trackIds = new Set<string>();
      for (const [trackIndex, track] of layer.tracks.entries()) {
        const trackLocation = `${location}.tracks.${trackIndex}`;
        if (trackIds.has(track.id)) findings.push({ code: 'DUPLICATE_TRACK_ID', severity: 'error', message: `Duplicate animation track id on ${layer.id}: ${track.id}`, location: trackLocation });
        trackIds.add(track.id);
        validateAnimated({ keyframes: track.keyframes }, trackLocation, findings);
        const visibleDuration = layer.duration ?? scene.duration - layer.start;
        if ((track.keyframes.at(-1)?.at ?? 0) > visibleDuration + 0.001 && track.extrapolate === 'clamp') findings.push({ code: 'TRACK_OVERRUN', severity: 'warning', message: `${track.id} extends past ${layer.id}'s visible duration.`, location: trackLocation });
        if (track.operation === 'replace' && track.target === 'transform.opacity' && track.keyframes.some((keyframe) => keyframe.value < 0 || keyframe.value > 1)) findings.push({ code: 'OPACITY_RANGE', severity: 'error', message: `${track.id} drives opacity outside 0..1.`, location: trackLocation });
        if (track.operation === 'replace' && ['transform.scaleX', 'transform.scaleY', 'width', 'height', 'fontSize', 'lineHeight', 'playbackRate'].includes(track.target) && track.keyframes.some((keyframe) => keyframe.value <= 0)) findings.push({ code: 'TRACK_NON_POSITIVE', severity: 'error', message: `${track.id} drives ${track.target} to a non-positive value.`, location: trackLocation });
      }

      const assetPath = collectAsset(layer);
      if (assetPath) {
        const asset = resolveProjectAsset(projectDir, assetPath);
        try { await access(asset); } catch {
          findings.push({ code: 'ASSET_MISSING', severity: 'error', message: `Asset does not exist: ${assetPath}`, location });
        }
      }

      if (layer.type === 'text') {
        if (layer.fontSize < project.height * 0.015) findings.push({ code: 'TEXT_TOO_SMALL', severity: 'warning', message: `${layer.id} may be unreadable at delivery size.`, location });
        if (layer.width + layer.x > project.width || layer.height + layer.y > project.height) findings.push({ code: 'TEXT_OUTSIDE_FRAME', severity: 'error', message: `${layer.id} extends beyond the frame.`, location });
        const ratio = contrast(layer.color, scene.background);
        if (ratio !== undefined && ratio < 3) findings.push({ code: 'TEXT_CONTRAST', severity: 'warning', message: `${layer.id} has only ${ratio.toFixed(2)}:1 contrast against the scene background. Verify its actual backing surface.`, location });
        if (layer.x < project.width * 0.02 || layer.y < project.height * 0.02 || layer.x + layer.width > project.width * 0.98 || layer.y + layer.height > project.height * 0.98) findings.push({ code: 'TEXT_SAFE_AREA', severity: 'warning', message: `${layer.id} approaches the delivery safe edge.`, location });
      }
    }
    for (const [z, count] of zCounts) {
      if (count > 5) findings.push({ code: 'DENSE_Z_PLANE', severity: 'warning', message: `${count} layers share z=${z} in ${scene.id}; ordering depends on declaration order.` });
    }
  }

  for (const [audioIndex, track] of project.audio.entries()) {
    const asset = resolveProjectAsset(projectDir, track.src);
    try { await access(asset); } catch {
      findings.push({ code: 'AUDIO_MISSING', severity: 'error', message: `Audio file does not exist: ${track.src}`, location: `audio.${audioIndex}` });
    }
    if (track.fadeIn + track.fadeOut > (track.duration ?? projectDuration(project))) {
      findings.push({ code: 'AUDIO_FADE_OVERLAP', severity: 'error', message: `${track.id} fades overlap its playable duration.`, location: `audio.${audioIndex}` });
    }
  }

  return findings;
}

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}

export function summarizeProject(project: GenmotionProject): Record<string, number | string> {
  return {
    scenes: project.scenes.length,
    layers: project.scenes.reduce((sum, scene) => sum + scene.layers.length, 0),
    audioTracks: project.audio.length,
    duration: projectDuration(project),
    frames: Math.ceil(projectDuration(project) * project.fps),
    resolution: `${project.width}x${project.height}`,
    fps: project.fps,
  };
}
