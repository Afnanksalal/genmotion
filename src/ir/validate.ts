import { captionWordRanges } from '../engine/caption-layout.js';
import { validateLayerMasks } from '../engine/masks.js';
import { access } from 'node:fs/promises';
import { parse as parseColor } from 'culori';
import type { AnimationTrack, GenmotionProject, Layer } from './schema.js';
import { projectDuration } from './schema.js';
import { resolveProjectAsset, type LoadedProject } from './loader.js';
import { tasteReferences } from '../catalog/references.js';
import { evaluateLayerTracks } from '../engine/animation.js';
import { evaluateNumber } from '../engine/timeline.js';
import { resolveAnchoredShape, shapeBounds } from '../engine/geometry.js';
import { pathMetrics } from '../engine/path.js';
import { applyPathOperations } from '../engine/path-operations.js';
import { compatiblePaths } from '../engine/path-editing.js';
import { gradientSchema } from './paint.js';
import { interpolateGradient } from '../engine/paint.js';
import { compositionCycles } from './compositions.js';
import { effectiveLayerStart, layerDependencyCycles, resolveLayerGraph } from '../engine/constraints.js';
import { measureTextLayer } from '../engine/text-layout.js';
import { registerProjectFonts } from '../engine/assets.js';

export type Severity = 'error' | 'warning';

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  location?: string;
}

function validateMediaGeometry(layer: Layer, location: string, findings: Finding[]): void {
  if (layer.type !== 'image' && layer.type !== 'video') return;
  if (layer.crop) for (const key of ['x', 'y', 'width', 'height'] as const) {
    const value = layer.crop[key]; validateAnimated(value, location + '.crop.' + key, findings);
    if (animatedValues(value).some((number) => (key === 'width' || key === 'height' ? number <= 0 : number < 0) || (layer.crop!.unit === 'ratio' && number > 1))) findings.push({ code: 'MEDIA_CROP_INVALID', severity: 'error', message: 'Crop coordinates must be nonnegative with positive dimensions; ratio values cannot exceed one.', location: location + '.crop.' + key });
  }
  if (layer.border) {
    validateAnimated(layer.border.width, location + '.border.width', findings);
    if (animatedValues(layer.border.width).some((width) => width < 0) || !parseColor(layer.border.color)) findings.push({ code: 'MEDIA_BORDER_INVALID', severity: 'error', message: 'Media border needs a nonnegative width and valid color.', location: location + '.border' });
  }
  if (layer.type === 'image' && layer.sourceFrame !== undefined && !layer.sourceAnimation) findings.push({ code: 'SOURCE_FRAME_WITHOUT_ANIMATION', severity: 'error', message: 'Explicit source frames require a sequence or sprite animation.', location: location + '.sourceFrame' });
}
function collectAssets(layer: Layer): string[] {
  const primary = layer.type === 'image' || layer.type === 'video' ? layer.src : layer.type === 'text' || layer.type === 'caption' ? layer.fontFile : undefined;
  return [...new Set([...(primary ? [primary] : []), ...(layer.type === 'image' && layer.sourceAnimation?.type === 'sequence' ? layer.sourceAnimation.frames : [])])];
}

function animatedValues(value: Layer['transform']['opacity']): number[] {
  return typeof value === 'number' ? [value] : value.keyframes.map((keyframe) => keyframe.value);
}

function validateVisualStack(layer: Pick<Layer, 'effects' | 'masks'>, location: string, findings: Finding[]): void {
  for (const [index, effect] of (layer.effects ?? []).entries()) {
    const address = `${location}.effects.${index}`;
    for (const [name, value] of Object.entries(effect.kernelUniforms ?? {})) validateAnimated(value, address + '.kernelUniforms.' + name, findings);
    for (const name of ['amount', 'radius', 'angle', 'frequency', 'speed', 'temperature', 'tint', 'shadows', 'highlights'] as const) {
      const value = effect[name]; if (value !== undefined) validateAnimated(value, `${address}.${name}`, findings);
    }
    for (const name of ['color', 'secondaryColor'] as const) if (effect[name] && !parseColor(effect[name])) findings.push({ code: 'EFFECT_COLOR_INVALID', severity: 'error', message: `${effect.id} has an invalid ${name}.`, location: address });
    if (effect.type === 'levels' && (effect.inputWhite ?? 1) <= (effect.inputBlack ?? 0)) findings.push({ code: 'EFFECT_LEVELS_INVALID', severity: 'error', message: 'Levels inputWhite must exceed inputBlack.', location: address });
  }
  for (const [index, mask] of (layer.masks ?? []).entries()) for (const name of ['opacity', 'feather', 'expansion'] as const) validateAnimated(mask[name], `${location}.masks.${index}.${name}`, findings);
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

function validateAnimated(value: Layer['transform']['opacity'] | { keyframes: Array<{ at: number }> }, location: string, findings: Finding[]): void {
  if (typeof value === 'number') return;
  for (let index = 1; index < value.keyframes.length; index += 1) {
    const previous = value.keyframes[index - 1];
    const current = value.keyframes[index];
    if (previous && current && current.at <= previous.at) findings.push({ code: 'KEYFRAMES_UNORDERED', severity: 'error', message: 'Keyframe times must be strictly increasing.', location });
  }
}

function validateAnimationTrack(track: AnimationTrack, visibleDuration: number, location: string, findings: Finding[], layer: Layer): void {
  validateAnimated({ keyframes: track.keyframes }, location, findings);
  if ((track.keyframes.at(-1)?.at ?? 0) > visibleDuration + 0.001 && track.extrapolate === 'clamp') findings.push({ code: 'TRACK_OVERRUN', severity: 'warning', message: `${track.id} extends past its layer's visible duration.`, location });
  const values = track.keyframes.map((keyframe) => keyframe.value);
  const colorTargets = ['color', 'fill', 'stroke', 'background', 'highlightColor', 'outlineColor', 'shadow.color'];
  const pointTargets = ['control1', 'control2'];
  const expected = ['gradientFill', 'gradientStroke'].includes(track.target) ? 'gradient' : track.target === 'path' ? 'path' : colorTargets.includes(track.target) ? 'color' : pointTargets.includes(track.target) ? 'point' : 'number';
  const invalid = values.some((value) => expected === 'gradient' ? !gradientSchema.safeParse(value).success : expected === 'path' ? typeof value !== 'string' : expected === 'color' ? typeof value !== 'string' || !parseColor(value) : expected === 'point' ? !Array.isArray(value) || value.length !== 2 : typeof value !== 'number');
  if (invalid) findings.push({ code: 'TRACK_VALUE_TYPE', severity: 'error', message: `${track.id} requires ${expected} keyframe values for ${track.target}.`, location });
  if (expected === 'gradient') {
    if ((layer.type !== 'shape' && layer.type !== 'text') || (track.target === 'gradientStroke' && layer.type !== 'shape')) findings.push({ code: 'TRACK_TARGET_TYPE', severity: 'error', message: 'Gradient fill requires text or shape; gradient stroke requires a shape.', location });
    if (track.operation !== 'replace') findings.push({ code: 'TRACK_OPERATION_TYPE', severity: 'error', message: 'Gradient tracks require replace operations.', location });
    if (!invalid && track.interpolation !== 'discrete') try {
      for (let index = 1; index < values.length; index++) interpolateGradient(gradientSchema.parse(values[index - 1]), gradientSchema.parse(values[index]), 0.5);
    } catch (error) { findings.push({ code: 'TRACK_GRADIENT_INVALID', severity: 'error', message: error instanceof Error ? error.message : String(error), location }); }
  }
  if (track.interpolation === 'path' && track.target !== 'path') findings.push({ code: 'TRACK_INTERPOLATION_TYPE', severity: 'error', message: 'Path interpolation requires a path target.', location });
  if (track.target === 'path') {
    if (layer.type !== 'shape' || layer.shape !== 'path') findings.push({ code: 'TRACK_TARGET_TYPE', severity: 'error', message: 'Path animation requires a path shape layer.', location });
    if (track.interpolation && !['path', 'discrete'].includes(track.interpolation)) findings.push({ code: 'TRACK_INTERPOLATION_TYPE', severity: 'error', message: 'Path tracks require path or discrete interpolation.', location });
    try {
      for (const value of values) { if (typeof value !== 'string') throw new Error('Path keyframes must contain SVG strings'); pathMetrics(value); }
      if (track.interpolation !== 'discrete') for (let index = 1; index < values.length; index++) compatiblePaths(values[index - 1] as string, values[index] as string);
    } catch (error) { findings.push({ code: 'TRACK_PATH_INVALID', severity: 'error', message: error instanceof Error ? error.message : String(error), location }); }
  }
  if (track.operation !== 'replace' && values.some((value) => typeof value === 'string')) findings.push({ code: 'TRACK_OPERATION_TYPE', severity: 'error', message: `${track.id} cannot ${track.operation} color values.`, location });
  if (track.interpolation === 'shortest-angle' && values.some((value) => typeof value !== 'number')) findings.push({ code: 'TRACK_INTERPOLATION_TYPE', severity: 'error', message: `${track.id} shortest-angle interpolation requires numeric values.`, location });
  if (track.noise && values.some((value) => typeof value !== 'number' && !Array.isArray(value))) findings.push({ code: 'TRACK_NOISE_TYPE', severity: 'error', message: `${track.id} procedural noise requires numeric or vector values.`, location });
  const numericValues = values.filter((value): value is number => typeof value === 'number');
  if (track.operation === 'replace' && track.target === 'transform.opacity' && numericValues.some((value) => value < 0 || value > 1)) findings.push({ code: 'OPACITY_RANGE', severity: 'error', message: `${track.id} drives opacity outside 0..1.`, location });
  if (track.operation === 'replace' && ['transform.scaleX', 'transform.scaleY', 'width', 'height', 'fontSize', 'lineHeight', 'playbackRate'].includes(track.target) && numericValues.some((value) => value <= 0)) findings.push({ code: 'TRACK_NON_POSITIVE', severity: 'error', message: `${track.id} drives ${track.target} to a non-positive value.`, location });
}

function layerBox(layer: Layer): { x: number; y: number; width: number; height: number } {
  if (layer.type === 'shape') return shapeBounds(layer);
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}

function validateStagger(layer: Layer, duration: number, location: string, findings: Finding[]): void {
  if (!layer.stagger) return;
  try {
    if (effectiveLayerStart(layer) >= duration) findings.push({ code: 'STAGGER_OUTSIDE_CONTAINER', severity: 'warning', message: `${layer.id} starts after its container ends once stagger delay is applied.`, location });
  } catch (error) { findings.push({ code: 'STAGGER_INVALID', severity: 'error', message: error instanceof Error ? error.message : String(error), location }); }
}

function layerIsAlwaysOutsideFrame(layer: Layer, sceneDuration: number, project: GenmotionProject): boolean {
  const visibleDuration = layer.duration ?? sceneDuration - layer.start;
  const times = new Set([0, Math.max(0, visibleDuration - 0.001)]);
  for (const property of [layer.transform.x, layer.transform.y]) {
    if (typeof property !== 'number') for (const keyframe of property.keyframes) times.add(Math.min(visibleDuration, keyframe.at));
  }
  for (const track of layer.tracks) for (const keyframe of track.keyframes) times.add(Math.min(visibleDuration, keyframe.at));
  let resolved = layer;
  if (layer.type === 'shape') {
    try { resolved = resolveAnchoredShape(layer, project); } catch { /* ANCHOR_UNKNOWN is reported separately. */ }
  }
  const box = layerBox(resolved);
  return [...times].every((time) => {
    const evaluated = evaluateLayerTracks({ ...layer, tracks: layer.tracks.filter((track) => ['transform.x', 'transform.y'].includes(track.target)) }, time);
    const x = box.x + evaluateNumber(evaluated.transform.x, time);
    const y = box.y + evaluateNumber(evaluated.transform.y, time);
    return x >= project.width || y >= project.height || x + box.width <= 0 || y + box.height <= 0;
  });
}

export async function validateProject(loaded: LoadedProject): Promise<Finding[]> {
  const findings: Finding[] = [];
  const { project, projectDir } = loaded;
  if (project.productionBrief?.duration && Math.abs(project.productionBrief.duration.value - projectDuration(project)) > 1 / project.fps) findings.push({ code: 'BRIEF_DURATION_MISMATCH', severity: 'warning', message: 'The composition duration differs from the persisted production brief.', location: 'productionBrief.duration' });
  if (project.productionBrief?.aspect) {
    const [width, height] = project.productionBrief.aspect.value;
    if (Math.abs(width / height - project.width / project.height) > 1e-6) findings.push({ code: 'BRIEF_ASPECT_MISMATCH', severity: 'warning', message: 'The delivery aspect differs from the persisted production brief.', location: 'productionBrief.aspect' });
  }
  let fontsReady = true;
  try { registerProjectFonts(project, projectDir); }
  catch (error) { fontsReady = false; findings.push({ code: 'FONT_REGISTRATION_FAILED', severity: 'error', message: error instanceof Error ? error.message : String(error) }); }
  const validateText = (layer: Layer, location: string): void => {
    if (layer.type !== 'text' || !fontsReady) return;
    try {
      const layout = measureTextLayer(layer);
      if (!layout.fits) findings.push({ code: 'TEXT_OVERFLOW', severity: 'warning', message: `${layer.id} cannot fit its complete text at ${layout.fontSize}px: ${[layout.overflowX ? 'width' : '', layout.overflowY ? 'height' : '', layout.overflowLines ? 'line limit' : ''].filter(Boolean).join(', ')}.`, location });
    } catch (error) { findings.push({ code: 'TEXT_LAYOUT_INVALID', severity: 'error', message: error instanceof Error ? error.message : String(error), location }); }
  };
  for (const container of [...project.scenes, ...project.compositions]) {
    for (const layer of container.layers) {
      if (layer.type === 'caption') {
        const cueIds = new Set<string>();
        for (const cue of layer.cues) {
          if (cueIds.has(cue.id)) findings.push({ code: 'CAPTION_ID_DUPLICATE', severity: 'error', message: 'Caption cue IDs must be unique within a layer.', location: layer.id + '.' + cue.id });
          cueIds.add(cue.id);
          for (const [index, word] of cue.words.entries()) if (word.start < cue.start || word.end > cue.end || (index > 0 && word.start < cue.words[index - 1]!.end)) findings.push({ code: 'CAPTION_WORD_TIMING', severity: 'error', message: 'Word timing must be ordered, non-overlapping and inside its caption cue.', location: layer.id + '.' + cue.id });
          if (captionWordRanges(cue).length !== cue.words.length) findings.push({ code: 'CAPTION_WORD_ALIGNMENT', severity: 'warning', message: 'Some timed words cannot be aligned with caption text; correct offsets or text before word highlighting.', location: layer.id + '.' + cue.id });
        }
      }
      const groups = layer.trackGroups ?? [];
      if (new Set(groups.map((group) => group.id)).size !== groups.length) findings.push({ code: 'TRACK_GROUP_DUPLICATE', severity: 'error', message: 'Track group IDs must be unique', location: layer.id });
      for (const track of layer.tracks) if (track.group && !groups.some((group) => group.id === track.group)) findings.push({ code: 'TRACK_GROUP_UNKNOWN', severity: 'error', message: 'Track references an unknown group', location: layer.id + '.' + track.id });
      const links = (layer.propertyLinks ?? []).filter((link) => link.enabled);
      if (new Set(links.map((link) => link.target)).size !== links.length) findings.push({ code: 'PROPERTY_LINK_DUPLICATE', severity: 'error', message: 'Only one active property link may own a target', location: layer.id });
    }
    if (container.layers.some((layer) => layer.propertyLinks?.some((link) => link.enabled))) {
      try { resolveLayerGraph(container.layers, 0, project.seed); }
      catch (error) { findings.push({ code: 'PROPERTY_LINK_INVALID', severity: 'error', message: error instanceof Error ? error.message : String(error), location: container.id }); }
    }
  }
  const ids = new Set<string>();
  const anchorIds = new Set<string>();
  const referenceIds = new Set(tasteReferences.map((reference) => reference.id));
  const parameterIds = new Set(project.parameters.map((parameter) => parameter.id));
  const captionPresetIds = new Set(project.captionStylePresets.map((preset) => preset.id));
  const compositionIds = new Set(project.compositions.map((composition) => composition.id));
  const totalDuration = projectDuration(project);
  for (const marker of project.markers ?? []) {
    const scene = marker.sceneId ? project.scenes.find((candidate) => candidate.id === marker.sceneId) : undefined;
    if (marker.sceneId && !scene || marker.time >= (scene?.duration ?? totalDuration)) findings.push({ code: 'MARKER_OUTSIDE_TIMELINE', severity: 'warning', message: `Marker ${marker.id} is outside its timeline or references a missing scene.`, location: `markers.${marker.id}` });
  }
  for (const range of project.ranges ?? []) if (range.end > totalDuration) findings.push({ code: 'RANGE_OUTSIDE_TIMELINE', severity: 'warning', message: `Range ${range.id} extends beyond the project.`, location: `ranges.${range.id}` });
  for (const [index, shot] of (project.productionWorkflow?.shots ?? []).entries()) {
    const location = `productionWorkflow.shots.${index}`, scene = project.scenes.find((candidate) => candidate.id === shot.sceneId);
    if (shot.sceneId && !scene) findings.push({ code: 'STORYBOARD_SCENE_MISSING', severity: 'warning', message: `${shot.id} is linked to a missing scene. Its build and review must be revisited.`, location });
    if (shot.build === 'built' && !shot.sceneId) findings.push({ code: 'STORYBOARD_BUILD_UNLINKED', severity: 'warning', message: `${shot.id} is marked built without a native scene link.`, location });
    for (const id of shot.layerIds) if (!scene?.layers.some((layer) => layer.id === id)) findings.push({ code: 'STORYBOARD_LAYER_MISSING', severity: 'warning', message: `${shot.id} references missing layer ${id}.`, location });
    for (const reference of shot.references) {
      try { await access(resolveProjectAsset(projectDir, reference.path)); }
      catch (error) { findings.push({ code: 'STORYBOARD_REFERENCE_MISSING', severity: 'warning', message: `${shot.id}: ${error instanceof Error ? error.message : 'Reference is unavailable'}`, location }); }
    }
    if (scene && Math.abs(scene.duration - shot.duration) > 1 / project.fps) findings.push({ code: 'STORYBOARD_DURATION_DRIFT', severity: 'warning', message: `${shot.id} plans ${shot.duration}s but its linked scene is ${scene.duration}s.`, location });
  }

  if (parameterIds.size !== project.parameters.length) findings.push({ code: 'DUPLICATE_PARAMETER_ID', severity: 'error', message: 'Project parameter ids must be unique.', location: 'parameters' });
  if (compositionIds.size !== project.compositions.length) findings.push({ code: 'DUPLICATE_COMPOSITION_ID', severity: 'error', message: 'Composition ids must be unique.', location: 'compositions' });
  for (const cycle of compositionCycles(project)) findings.push({ code: 'COMPOSITION_CYCLE', severity: 'error', message: `Composition cycle: ${cycle.join(' -> ')}`, location: 'compositions' });
  for (const [index, variant] of project.variants.entries()) for (const id of Object.keys(variant.values)) if (!parameterIds.has(id)) findings.push({ code: 'VARIANT_PARAMETER_UNKNOWN', severity: 'error', message: `${variant.id} references unknown parameter ${id}.`, location: `variants.${index}` });

  for (const [anchorIndex, anchor] of project.anchors.entries()) {
    const location = `anchors.${anchorIndex}`;
    if (anchorIds.has(anchor.id)) findings.push({ code: 'DUPLICATE_ANCHOR_ID', severity: 'error', message: `Duplicate geometry anchor: ${anchor.id}`, location });
    anchorIds.add(anchor.id);
    if (anchor.x < 0 || anchor.y < 0 || anchor.x > project.width || anchor.y > project.height) {
      findings.push({ code: 'ANCHOR_OUTSIDE_FRAME', severity: 'warning', message: `${anchor.id} lies outside the delivery frame.`, location });
    }
  }

  if (projectDuration(project) > 3_600) {
    findings.push({ code: 'DURATION_EXCESSIVE', severity: 'warning', message: 'Project duration exceeds one hour.' });
  }

  for (const font of project.brand.fonts) {
    const asset = resolveProjectAsset(projectDir, font.file);
    try { await access(asset); } catch {
      findings.push({ code: 'FONT_MISSING', severity: 'error', message: `Font file does not exist: ${font.file}`, location: 'brand.fonts' });
    }
  }

  for (const [compositionIndex, composition] of project.compositions.entries()) {
    validateVisualStack(composition, `compositions.${compositionIndex}`, findings);
    if (ids.has(composition.id)) findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate id: ${composition.id}`, location: `compositions.${compositionIndex}` });
    ids.add(composition.id);
    const localIds = new Set(composition.layers.map((layer) => layer.id));
    const seenLocalIds = new Set<string>();
    const scopedParameterIds = new Set([...parameterIds, ...(composition.parameters ?? []).map((parameter) => parameter.id)]);
    for (const cycle of layerDependencyCycles(composition.layers)) findings.push({ code: 'LAYER_DEPENDENCY_CYCLE', severity: 'error', message: `Layer dependency cycle: ${cycle.join(' -> ')}`, location: `compositions.${compositionIndex}.layers` });
    for (const [layerIndex, layer] of composition.layers.entries()) {
      const location = `compositions.${compositionIndex}.layers.${layerIndex}`;
      validateStagger(layer, composition.duration, location, findings);
      validateText(layer, location);
      if (seenLocalIds.has(layer.id)) findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate local layer id: ${layer.id}`, location });
      seenLocalIds.add(layer.id);
      for (const target of [layer.parentId, ...layer.constraints.map((constraint) => constraint.target), ...(layer.propertyLinks ?? []).filter((link) => link.enabled).map((link) => link.sourceLayerId)]) if (target && !localIds.has(target)) findings.push({ code: 'LAYER_DEPENDENCY_UNKNOWN', severity: 'error', message: `${layer.id} references unknown local layer ${target}.`, location });
      if (layer.start >= composition.duration) findings.push({ code: 'LAYER_OUTSIDE_COMPOSITION', severity: 'error', message: `${layer.id} starts after its composition ends.`, location });
      if (layer.duration && layer.start + layer.duration > composition.duration + 0.001) findings.push({ code: 'LAYER_OVERRUN', severity: 'warning', message: `${layer.id} extends beyond its composition.`, location });
      if (layer.type === 'composition' && !compositionIds.has(layer.compositionId)) findings.push({ code: 'COMPOSITION_UNKNOWN', severity: 'error', message: `${layer.id} references unknown composition ${layer.compositionId}.`, location });
      for (const parameterId of Object.values(layer.bindings)) if (!scopedParameterIds.has(parameterId)) findings.push({ code: 'BINDING_PARAMETER_UNKNOWN', severity: 'error', message: `${layer.id} binds unknown parameter ${parameterId}.`, location: `${location}.bindings` });
      const trackIds = new Set<string>();
      for (const [trackIndex, track] of layer.tracks.entries()) {
        const trackLocation = `${location}.tracks.${trackIndex}`;
        if (trackIds.has(track.id)) findings.push({ code: 'DUPLICATE_TRACK_ID', severity: 'error', message: `Duplicate animation track id on ${layer.id}: ${track.id}`, location: trackLocation });
        trackIds.add(track.id);
        validateAnimationTrack(track, layer.duration ?? composition.duration - layer.start, trackLocation, findings, layer);
      }
      validateVisualStack(layer, location, findings);
      validateMediaGeometry(layer, location, findings);
      if (layer.masks) try { validateLayerMasks(layer.masks); } catch (error) { findings.push({ code: 'MASK_INVALID', severity: 'error', message: `${layer.id}: ${error instanceof Error ? error.message : 'Invalid masks'}`, location: `${location}.masks` }); }
      if (layer.followPath) try { pathMetrics(layer.followPath.path); } catch { findings.push({ code: 'MOTION_PATH_INVALID', severity: 'error', message: `${layer.id} has invalid SVG motion-path data.`, location: `${location}.followPath` }); }
      if (layer.type === 'shape' && layer.shape === 'path' && layer.path) try { pathMetrics(layer.pathOperations?.length ? applyPathOperations(layer.path, layer.pathOperations) : layer.path); } catch { findings.push({ code: 'PATH_INVALID', severity: 'error', message: `${layer.id} has invalid SVG path data or geometry operations.`, location: `${location}.path` }); }
      if (layer.type === 'caption') for (let cueIndex = 1; cueIndex < layer.cues.length; cueIndex += 1) if (layer.cues[cueIndex]!.start < layer.cues[cueIndex - 1]!.end) findings.push({ code: 'CAPTION_CUE_OVERLAP', severity: 'warning', message: `${layer.cues[cueIndex - 1]!.id} and ${layer.cues[cueIndex]!.id} overlap.`, location: `${location}.cues.${cueIndex}` });
      if (layer.type === 'image' && layer.sourceFrame !== undefined) validateAnimated(layer.sourceFrame, location + '.sourceFrame', findings);
      for (const assetPath of collectAssets(layer)) try { await access(resolveProjectAsset(projectDir, assetPath)); } catch { findings.push({ code: 'ASSET_MISSING', severity: 'error', message: `Asset does not exist: ${assetPath}`, location }); }
    }
  }

  for (const [sceneIndex, scene] of project.scenes.entries()) {
    validateVisualStack(scene, `scenes.${sceneIndex}`, findings);
    if (ids.has(scene.id)) findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate id: ${scene.id}`, location: `scenes.${sceneIndex}` });
    ids.add(scene.id);
    const localIds = new Set(scene.layers.map((layer) => layer.id));
    for (const cycle of layerDependencyCycles(scene.layers)) findings.push({ code: 'LAYER_DEPENDENCY_CYCLE', severity: 'error', message: `Layer dependency cycle: ${cycle.join(' -> ')}`, location: `scenes.${sceneIndex}.layers` });
    if (scene.transitionIn.duration > scene.duration / 2 || scene.transitionOut.duration > scene.duration / 2) findings.push({ code: 'TRANSITION_TOO_LONG', severity: 'error', message: `${scene.id} transition consumes more than half the scene.`, location: `scenes.${sceneIndex}` });
    for (const [side, transition] of [['transitionIn', scene.transitionIn], ['transitionOut', scene.transitionOut]] as const) if (transition.overlayCompositionId && !compositionIds.has(transition.overlayCompositionId)) findings.push({ code: 'TRANSITION_OVERLAY_UNKNOWN', severity: 'error', message: `${scene.id} references unknown transition overlay ${transition.overlayCompositionId}.`, location: `scenes.${sceneIndex}.${side}` });
    const previousScene = project.scenes[sceneIndex - 1];
    if (previousScene) {
      const outgoing = previousScene.transitionOut;
      const incoming = scene.transitionIn;
      const hasOutgoing = (outgoing.presentation ?? outgoing.type) !== 'cut' && outgoing.duration > 0;
      const hasIncoming = (incoming.presentation ?? incoming.type) !== 'cut' && incoming.duration > 0;
      if (hasOutgoing && hasIncoming && ((outgoing.presentation ?? outgoing.type) !== (incoming.presentation ?? incoming.type) || JSON.stringify(outgoing.timing ?? outgoing.ease) !== JSON.stringify(incoming.timing ?? incoming.ease))) {
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
      validateStagger(layer, scene.duration, location, findings);
      validateText(layer, location);
      if (ids.has(layer.id)) findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate id: ${layer.id}`, location });
      ids.add(layer.id);
      for (const target of [layer.parentId, ...layer.constraints.map((constraint) => constraint.target), ...(layer.propertyLinks ?? []).filter((link) => link.enabled).map((link) => link.sourceLayerId)]) if (target && !localIds.has(target)) findings.push({ code: 'LAYER_DEPENDENCY_UNKNOWN', severity: 'error', message: `${layer.id} references unknown local layer ${target}.`, location });
      zCounts.set(layer.z, (zCounts.get(layer.z) ?? 0) + 1);
      for (const parameterId of Object.values(layer.bindings)) if (!parameterIds.has(parameterId)) findings.push({ code: 'BINDING_PARAMETER_UNKNOWN', severity: 'error', message: `${layer.id} binds unknown parameter ${parameterId}.`, location: `${location}.bindings` });
      if (layer.type === 'composition' && !compositionIds.has(layer.compositionId)) findings.push({ code: 'COMPOSITION_UNKNOWN', severity: 'error', message: `${layer.id} references unknown composition ${layer.compositionId}.`, location });
      validateVisualStack(layer, location, findings);
      validateMediaGeometry(layer, location, findings);
      if (layer.masks) try { validateLayerMasks(layer.masks); } catch (error) { findings.push({ code: 'MASK_INVALID', severity: 'error', message: `${layer.id}: ${error instanceof Error ? error.message : 'Invalid masks'}`, location: `${location}.masks` }); }
      if (layer.followPath) try { pathMetrics(layer.followPath.path); } catch { findings.push({ code: 'MOTION_PATH_INVALID', severity: 'error', message: `${layer.id} has invalid SVG motion-path data.`, location: `${location}.followPath` }); }

      if (layer.start >= scene.duration) findings.push({ code: 'LAYER_OUTSIDE_SCENE', severity: 'error', message: `${layer.id} starts after its scene ends.`, location });
      if (layer.duration && layer.start + layer.duration > scene.duration + 0.001) findings.push({ code: 'LAYER_OVERRUN', severity: 'warning', message: `${layer.id} extends beyond its scene and will be clipped.`, location });
      if (animatedValues(layer.transform.opacity).some((value) => value < 0 || value > 1)) findings.push({ code: 'OPACITY_RANGE', severity: 'error', message: `${layer.id} opacity must remain between 0 and 1.`, location });
      for (const property of ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'blur'] as const) validateAnimated(layer.transform[property], `${location}.transform.${property}`, findings);
      if (animatedValues(layer.transform.scaleX).some((value) => value <= 0) || animatedValues(layer.transform.scaleY).some((value) => value <= 0)) findings.push({ code: 'SCALE_NON_POSITIVE', severity: 'error', message: `${layer.id} scale must stay greater than zero.`, location });
      if (!layer.parentId && layer.constraints.length === 0 && layerIsAlwaysOutsideFrame(layer, scene.duration, project)) findings.push({ code: 'LAYER_ALWAYS_OUTSIDE_FRAME', severity: 'error', message: `${layer.id} remains outside the delivery frame at every authored transform keyframe. Layer x/y are absolute layout coordinates; transform x/y are additional offsets.`, location });
      const trackIds = new Set<string>();
      for (const [trackIndex, track] of layer.tracks.entries()) {
        const trackLocation = `${location}.tracks.${trackIndex}`;
        if (trackIds.has(track.id)) findings.push({ code: 'DUPLICATE_TRACK_ID', severity: 'error', message: `Duplicate animation track id on ${layer.id}: ${track.id}`, location: trackLocation });
        trackIds.add(track.id);
        const visibleDuration = layer.duration ?? scene.duration - layer.start;
        validateAnimationTrack(track, visibleDuration, trackLocation, findings, layer);
      }

      if (layer.type === 'image' && layer.sourceFrame !== undefined) validateAnimated(layer.sourceFrame, location + '.sourceFrame', findings);
      for (const assetPath of collectAssets(layer)) {
        const asset = resolveProjectAsset(projectDir, assetPath);
        try { await access(asset); } catch {
          findings.push({ code: 'ASSET_MISSING', severity: 'error', message: `Asset does not exist: ${assetPath}`, location });
        }
      }

      if (layer.type === 'text' || layer.type === 'caption') {
        if (layer.type === 'text' && layer.textPath) try { pathMetrics(layer.textPath.path); } catch { findings.push({ code: 'TEXT_PATH_INVALID', severity: 'error', message: `${layer.id} has invalid text-path geometry.`, location: `${location}.textPath.path` }); }
        if (layer.fontSize < project.height * 0.015) findings.push({ code: 'TEXT_TOO_SMALL', severity: 'warning', message: `${layer.id} may be unreadable at delivery size.`, location });
        let positioned: Layer = layer;
        const hasDependency = Boolean(layer.parentId || layer.constraints.length);
        const inspectionTime = (layer.duration ?? scene.duration - layer.start) / 2;
        if (hasDependency) try { positioned = resolveLayerGraph(scene.layers, inspectionTime, project.seed).find((candidate) => candidate.id === layer.id) ?? layer; } catch { /* Dependency diagnostics are emitted above. */ }
        const box = layerBox(positioned);
        const positionedX = box.x + (hasDependency ? evaluateNumber(positioned.transform.x, inspectionTime) : 0);
        const positionedY = box.y + (hasDependency ? evaluateNumber(positioned.transform.y, inspectionTime) : 0);
        if (box.width + positionedX > project.width || box.height + positionedY > project.height || positionedX < 0 || positionedY < 0) findings.push({ code: 'TEXT_OUTSIDE_FRAME', severity: 'error', message: `${layer.id} extends beyond the frame.`, location });
        const backingTarget = layer.constraints.find((constraint) => constraint.type === 'anchor-to')?.target;
        const backing = backingTarget ? scene.layers.find((candidate) => candidate.id === backingTarget) : undefined;
        const ratio = contrast(layer.color, backing?.type === 'shape' && backing.fill ? backing.fill : scene.background);
        if (ratio !== undefined && ratio < 3) findings.push({ code: 'TEXT_CONTRAST', severity: 'warning', message: `${layer.id} has only ${ratio.toFixed(2)}:1 contrast against the scene background. Verify its actual backing surface.`, location });
        if (positionedX < project.width * 0.02 || positionedY < project.height * 0.02 || positionedX + box.width > project.width * 0.98 || positionedY + box.height > project.height * 0.98) findings.push({ code: 'TEXT_SAFE_AREA', severity: 'warning', message: `${layer.id} approaches the delivery safe edge.`, location });
        if (layer.type === 'caption') {
          if (layer.stylePresetId && !captionPresetIds.has(layer.stylePresetId)) findings.push({ code: 'CAPTION_PRESET_UNKNOWN', severity: 'error', message: `${layer.id} references unknown caption style preset ${layer.stylePresetId}.`, location: `${location}.stylePresetId` });
          for (let cueIndex = 0; cueIndex < layer.cues.length; cueIndex += 1) {
            const cue = layer.cues[cueIndex]!;
            if (cue.end > (layer.duration ?? scene.duration - layer.start) + 0.001) findings.push({ code: 'CAPTION_CUE_OVERRUN', severity: 'warning', message: `${cue.id} extends beyond the caption layer.`, location: `${location}.cues.${cueIndex}` });
            const previous = layer.cues[cueIndex - 1];
            if (previous && cue.start < previous.end) findings.push({ code: 'CAPTION_CUE_OVERLAP', severity: 'warning', message: `${previous.id} and ${cue.id} overlap.`, location: `${location}.cues.${cueIndex}` });
          }
          if (layer.safeArea && (layer.x < project.width * 0.05 || layer.x + layer.width > project.width * 0.95 || layer.y + layer.height > project.height * 0.95)) findings.push({ code: 'CAPTION_SAFE_AREA', severity: 'warning', message: `${layer.id} leaves the 5% caption safe area.`, location });
        }
      } else if (layer.type === 'shape') {
        if (layer.shape === 'path' && layer.path) try { pathMetrics(layer.pathOperations?.length ? applyPathOperations(layer.path, layer.pathOperations) : layer.path); } catch { findings.push({ code: 'PATH_INVALID', severity: 'error', message: `${layer.id} has invalid SVG path data or geometry operations.`, location: `${location}.path` }); }
        for (const [property, anchorId] of [['startAnchor', layer.startAnchor], ['endAnchor', layer.endAnchor], ['centerAnchor', layer.centerAnchor]] as const) {
          if (anchorId && !anchorIds.has(anchorId)) findings.push({ code: 'ANCHOR_UNKNOWN', severity: 'error', message: `${layer.id} references unknown geometry anchor ${anchorId}.`, location: `${location}.${property}` });
        }
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
