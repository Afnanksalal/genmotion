import { createCanvas, Path2D, type SKRSContext2D } from '@napi-rs/canvas';
import { access } from 'node:fs/promises';
import type { CaptionLayer, GenmotionProject, ImageLayer, Layer, Scene, ShapeLayer, TextLayer, VideoLayer } from '../ir/schema.js';
import { DEFAULT_TRANSFORM } from '../ir/schema.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { loadCachedImage, registerProjectFonts, videoFramePath } from './assets.js';
import { evaluateNumber, layerIsActive, locateScene } from './timeline.js';
import { ease } from './easing.js';
import { evaluateLayerTracks } from './animation.js';
import { bezierPrefix, layerBox, resolveAnchoredShape } from './geometry.js';
import { flattenPath, pathMetrics, samplePath } from './path.js';
import { effectiveLayerStart, resolveLayerGraph } from './constraints.js';

export interface RenderDimensions { width: number; height: number }

function roundedPath(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function applyShadow(ctx: SKRSContext2D, shadow: { color: string; blur: number; offsetX: number; offsetY: number } | undefined): void {
  ctx.shadowColor = shadow?.color ?? 'rgba(0,0,0,0)';
  ctx.shadowBlur = shadow?.blur ?? 0;
  ctx.shadowOffsetX = shadow?.offsetX ?? 0;
  ctx.shadowOffsetY = shadow?.offsetY ?? 0;
}

function wrapText(ctx: SKRSContext2D, text: string, width: number, letterSpacing: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(''); continue; }
    let line = words[0] ?? '';
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      const measured = ctx.measureText(candidate).width + Math.max(0, candidate.length - 1) * letterSpacing;
      if (measured <= width) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

export function canvasFontWeight(weight: TextLayer['fontWeight']): TextLayer['fontWeight'] {
  if (typeof weight !== 'number') return weight;
  // Skia's CSS font shorthand parser accepts the CSS2 weight ladder. Passing
  // intermediate values such as 450, 650, or 850 can be misread as a size and
  // draw glyphs at enormous dimensions even though measurement used the
  // requested size. Preserve the closest supported visual weight explicitly.
  return Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
}

function fontString(layer: TextLayer, size: number): string {
  return `${layer.fontStyle} ${String(canvasFontWeight(layer.fontWeight))} ${String(size)}px "${layer.fontFamily}"`;
}

function resolveTextLayout(ctx: SKRSContext2D, layer: TextLayer): { lines: string[]; fontSize: number; lineHeight: number } {
  let fontSize = layer.fontSize;
  let lines: string[] = [];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    ctx.font = fontString(layer, fontSize);
    lines = wrapText(ctx, layer.text, layer.width, layer.letterSpacing);
    if (layer.maxLines) lines = lines.slice(0, layer.maxLines);
    const lineHeight = fontSize * layer.lineHeight;
    const fits = lines.length * lineHeight <= layer.height;
    if (fits || layer.fit === 'none' || fontSize <= 8) return { lines, fontSize, lineHeight };
    fontSize -= 1;
  }
  return { lines, fontSize, lineHeight: fontSize * layer.lineHeight };
}

function revealText(text: string, mode: TextLayer['reveal'], progress: number): string {
  const p = Math.max(0, Math.min(1, progress));
  if (mode === 'none') return text;
  if (mode === 'characters') return text.slice(0, Math.ceil(text.length * p));
  const separator = mode === 'lines' ? '\n' : ' ';
  const parts = text.split(separator);
  return parts.slice(0, Math.ceil(parts.length * p)).join(separator);
}

function drawText(ctx: SKRSContext2D, original: TextLayer, time: number): void {
  let content = original.text;
  if (original.countFrom !== undefined) {
    const target = Number(original.text.replace(/[^0-9.+-]/g, ''));
    if (Number.isFinite(target)) {
      const progress = Math.max(0, Math.min(1, evaluateNumber(original.countProgress, time)));
      const value = original.countFrom + (target - original.countFrom) * progress;
      const format = original.numberFormat ?? { decimals: 0, prefix: '', suffix: '', grouping: true };
      content = `${format.prefix}${value.toLocaleString('en-US', { useGrouping: format.grouping, minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals })}${format.suffix}`;
    }
  }
  const layer = { ...original, text: revealText(content, original.reveal, evaluateNumber(original.revealProgress, time)) };
  const { lines, fontSize, lineHeight } = resolveTextLayout(ctx, layer);
  ctx.font = fontString(layer, fontSize);
  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'top';
  applyShadow(ctx, layer.shadow);
  const blockHeight = lines.length * lineHeight;
  const yOffset = layer.verticalAlign === 'middle' ? (layer.height - blockHeight) / 2 : layer.verticalAlign === 'bottom' ? layer.height - blockHeight : 0;
  for (const [index, line] of lines.entries()) {
    const measured = ctx.measureText(line).width + Math.max(0, line.length - 1) * layer.letterSpacing;
    const xOffset = layer.align === 'center' ? (layer.width - measured) / 2 : layer.align === 'right' ? layer.width - measured : 0;
    if (layer.letterSpacing === 0) ctx.fillText(line, layer.x + xOffset, layer.y + yOffset + index * lineHeight);
    else {
      let cursor = layer.x + xOffset;
      for (const character of line) {
        ctx.fillText(character, cursor, layer.y + yOffset + index * lineHeight);
        cursor += ctx.measureText(character).width + layer.letterSpacing;
      }
    }
  }
  applyShadow(ctx, undefined);
}

function drawCaption(ctx: SKRSContext2D, layer: CaptionLayer, time: number): void {
  const cue = layer.cues.find((candidate) => time >= candidate.start && time < candidate.end);
  if (!cue) return;
  const textLayer: TextLayer = {
    ...layer, type: 'text', text: cue.speaker ? `${cue.speaker}: ${cue.text}` : cue.text,
    fit: 'shrink', reveal: 'none', revealProgress: 1, countProgress: 1,
    verticalAlign: 'middle', lineHeight: 1.12, letterSpacing: 0, fontStyle: 'normal', shadow: undefined,
  };
  if (layer.background) {
    ctx.fillStyle = layer.background;
    roundedPath(ctx, layer.x, layer.y, layer.width, layer.height, layer.radius);
    ctx.fill();
  }
  const inset = { ...textLayer, x: layer.x + layer.padding, y: layer.y + layer.padding, width: Math.max(1, layer.width - layer.padding * 2), height: Math.max(1, layer.height - layer.padding * 2) };
  if (layer.outlineColor && layer.outlineWidth > 0) {
    const layout = resolveTextLayout(ctx, inset);
    ctx.save(); ctx.font = fontString(inset, layout.fontSize); ctx.textBaseline = 'top'; ctx.strokeStyle = layer.outlineColor; ctx.lineWidth = layer.outlineWidth * 2; ctx.lineJoin = 'round';
    const blockHeight = layout.lines.length * layout.lineHeight;
    for (const [index, line] of layout.lines.entries()) {
      const measured = ctx.measureText(line).width;
      const x = inset.x + (inset.align === 'center' ? (inset.width - measured) / 2 : inset.align === 'right' ? inset.width - measured : 0);
      ctx.strokeText(line, x, inset.y + (inset.height - blockHeight) / 2 + index * layout.lineHeight);
    }
    ctx.restore();
  }
  drawText(ctx, inset, time);
  const current = layer.highlightColor ? cue.words.find((word) => time >= word.start && time < word.end) : undefined;
  if (current && !cue.text.includes('\n')) {
    const index = cue.text.indexOf(current.text);
    if (index >= 0) {
      const layout = resolveTextLayout(ctx, inset);
      if (layout.lines.length === 1) {
        const prefix = `${cue.speaker ? `${cue.speaker}: ` : ''}${cue.text.slice(0, index)}`;
        const full = inset.text;
        ctx.save(); ctx.font = fontString(inset, layout.fontSize); ctx.textBaseline = 'top'; ctx.fillStyle = layer.highlightColor!;
        const left = inset.x + (inset.align === 'center' ? (inset.width - ctx.measureText(full).width) / 2 : inset.align === 'right' ? inset.width - ctx.measureText(full).width : 0);
        ctx.fillText(current.text, left + ctx.measureText(prefix).width, inset.y + (inset.height - layout.lineHeight) / 2);
        ctx.restore();
      }
    }
  }
}

function drawShape(ctx: SKRSContext2D, layer: ShapeLayer, time: number): void {
  const progress = Math.max(0, Math.min(1, evaluateNumber(layer.progress, time)));
  applyShadow(ctx, layer.shadow);
  if (layer.fill) ctx.fillStyle = layer.fill;
  if (layer.stroke) ctx.strokeStyle = layer.stroke;
  ctx.lineWidth = layer.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (layer.shape === 'path' && layer.path) {
    const vector = new Path2D(layer.path);
    ctx.save();
    ctx.translate(layer.x, layer.y);
    const metrics = pathMetrics(layer.path);
    const left = metrics.bounds.x; const top = metrics.bounds.y;
    const sourceWidth = Math.max(1, metrics.bounds.width);
    const sourceHeight = Math.max(1, metrics.bounds.height);
    ctx.scale(layer.width / sourceWidth, layer.height / sourceHeight);
    ctx.translate(-left, -top);
    if (layer.fill && progress >= 1) ctx.fill(vector);
    if (layer.stroke && layer.strokeWidth > 0) {
      if (progress >= 1) ctx.stroke(vector);
      else {
        const points = flattenPath(layer.path, 0, progress, 0.75);
        const first = points[0];
        if (first) {
          ctx.beginPath(); ctx.moveTo(first[0], first[1]);
          for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    applyShadow(ctx, undefined);
    return;
  }
  if (layer.shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width * progress / 2, layer.height * progress / 2, 0, 0, Math.PI * 2);
  } else if (layer.shape === 'line') {
    ctx.beginPath();
    ctx.moveTo(layer.x, layer.y);
    ctx.lineTo(layer.x + layer.width * progress, layer.y + layer.height * progress);
  } else if (layer.shape === 'bezier' && layer.control1 && layer.control2) {
    const [start, control1, control2, end] = bezierPrefix(
      [layer.x, layer.y], layer.control1, layer.control2,
      [layer.x + layer.width, layer.y + layer.height], progress,
    );
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.bezierCurveTo(control1[0], control1[1], control2[0], control2[1], end[0], end[1]);
  } else if (layer.shape === 'polygon' && layer.points && layer.points.length > 1) {
    const count = Math.max(2, Math.ceil(layer.points.length * progress));
    const first = layer.points[0];
    if (!first) return;
    ctx.beginPath();
    ctx.moveTo(layer.x + first[0], layer.y + first[1]);
    for (const point of layer.points.slice(1, count)) ctx.lineTo(layer.x + point[0], layer.y + point[1]);
    if (progress >= 1) ctx.closePath();
  } else {
    roundedPath(ctx, layer.x, layer.y, layer.width * progress, layer.height, layer.shape === 'round-rect' ? layer.radius : 0);
  }
  if (layer.fill && layer.shape !== 'line' && layer.shape !== 'bezier') ctx.fill();
  if (layer.stroke && layer.strokeWidth > 0) ctx.stroke();
  applyShadow(ctx, undefined);
}

function drawFittedImage(ctx: SKRSContext2D, image: Awaited<ReturnType<typeof loadCachedImage>>, layer: ImageLayer | VideoLayer): void {
  const source = 'crop' in layer && layer.crop ? layer.crop : { x: 0, y: 0, width: image.width, height: image.height };
  let dx = layer.x;
  let dy = layer.y;
  let dw = layer.width;
  let dh = layer.height;
  if (layer.fit !== 'fill') {
    const sourceRatio = source.width / source.height;
    const targetRatio = layer.width / layer.height;
    const contain = layer.fit === 'contain';
    if ((sourceRatio > targetRatio) === contain) {
      dh = layer.width / sourceRatio;
      dy += (layer.height - dh) / 2;
    } else {
      dw = layer.height * sourceRatio;
      dx += (layer.width - dw) / 2;
    }
  }
  ctx.save();
  roundedPath(ctx, layer.x, layer.y, layer.width, layer.height, layer.radius);
  ctx.clip();
  ctx.drawImage(image, source.x, source.y, source.width, source.height, dx, dy, dw, dh);
  ctx.restore();
}

async function drawImageLayer(ctx: SKRSContext2D, layer: ImageLayer, projectDir: string): Promise<void> {
  const image = await loadCachedImage(resolveProjectAsset(projectDir, layer.src));
  drawFittedImage(ctx, image, layer);
}

async function drawVideoLayer(ctx: SKRSContext2D, layer: VideoLayer, projectDir: string, localLayerTime: number, fps: number): Promise<void> {
  const framePath = videoFramePath(projectDir, layer, localLayerTime, fps);
  await access(framePath);
  const image = await loadCachedImage(framePath);
  drawFittedImage(ctx, image, layer);
}

async function drawLayer(ctx: SKRSContext2D, layer: Layer, scene: Scene, project: GenmotionProject, projectDir: string, sceneTime: number, compositionStack: string[] = [], evaluated = false): Promise<void> {
  const effectiveStart = effectiveLayerStart(layer);
  if (!layer.visible || !layerIsActive(effectiveStart, layer.duration, scene.duration, sceneTime)) return;
  const localTime = sceneTime - effectiveStart;
  if (!evaluated) layer = evaluateLayerTracks(layer, localTime, project.seed);
  if (layer.type === 'shape') layer = resolveAnchoredShape(layer, project);
  const box = layerBox(layer);
  const transform = layer.transform;
  const centerX = box.x + box.width * transform.anchorX;
  const centerY = box.y + box.height * transform.anchorY;
  const opacity = evaluateNumber(transform.opacity, localTime);
  if (opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.globalCompositeOperation = layer.blendMode;
  ctx.filter = `blur(${String(Math.max(0, evaluateNumber(transform.blur, localTime)))}px)`;
  const pathPose = layer.followPath ? samplePath(layer.followPath.path, evaluateNumber(layer.followPath.progress, localTime)) : undefined;
  ctx.translate(centerX + evaluateNumber(transform.x, localTime) + (pathPose?.x ?? 0) + (layer.followPath?.offsetX ?? 0), centerY + evaluateNumber(transform.y, localTime) + (pathPose?.y ?? 0) + (layer.followPath?.offsetY ?? 0));
  ctx.rotate((evaluateNumber(transform.rotation, localTime) + (layer.followPath?.orient ? pathPose?.angle ?? 0 : 0)) * Math.PI / 180);
  ctx.scale(evaluateNumber(transform.scaleX, localTime), evaluateNumber(transform.scaleY, localTime));
  ctx.translate(-centerX, -centerY);
  if (layer.clip) {
    roundedPath(ctx, layer.clip.x, layer.clip.y, layer.clip.width, layer.clip.height, layer.clip.radius);
    ctx.clip();
  }
  if (layer.type === 'text') drawText(ctx, layer, localTime);
  else if (layer.type === 'caption') drawCaption(ctx, layer, localTime);
  else if (layer.type === 'shape') drawShape(ctx, layer, localTime);
  else if (layer.type === 'image') await drawImageLayer(ctx, layer, projectDir);
  else if (layer.type === 'video') await drawVideoLayer(ctx, layer, projectDir, localTime, project.fps);
  else await drawCompositionLayer(ctx, layer, project, projectDir, localTime, compositionStack);
  ctx.restore();
}

async function drawCompositionLayer(ctx: SKRSContext2D, layer: Extract<Layer, { type: 'composition' }>, project: GenmotionProject, projectDir: string, localTime: number, compositionStack: string[]): Promise<void> {
  const composition = project.compositions.find((candidate) => candidate.id === layer.compositionId);
  if (!composition) return;
  if (compositionStack.includes(composition.id)) throw new Error(`Composition cycle while rendering: ${[...compositionStack, composition.id].join(' -> ')}`);
  const mapped = (localTime * layer.timeScale + layer.timeOffset);
  const time = layer.loop ? ((mapped % composition.duration) + composition.duration) % composition.duration : Math.max(0, Math.min(composition.duration, mapped));
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.scale(layer.width / composition.width, layer.height / composition.height);
  if (composition.background) { ctx.fillStyle = composition.background; ctx.fillRect(0, 0, composition.width, composition.height); }
  const scene = { id: composition.id, purpose: composition.id, duration: composition.duration, background: composition.background ?? 'rgba(0,0,0,0)', layers: composition.layers, transitionIn: { type: 'cut' as const, duration: 0, ease: 'linear' as const, mode: 'symmetric' as const }, transitionOut: { type: 'cut' as const, duration: 0, ease: 'linear' as const, mode: 'symmetric' as const }, referenceDecisions: [], notes: [] };
  const children = resolveLayerGraph(composition.layers, time, project.seed);
  for (const child of [...children].sort((a, b) => a.z - b.z)) await drawLayer(ctx, child, scene, project, projectDir, time, [...compositionStack, composition.id], true);
  ctx.restore();
}

interface ScenePose { alpha: number; x: number; y: number; scale: number; blur: number; clip?: 'wipe-left' | 'wipe-right' | 'iris'; clipProgress?: number }

type TransitionPresentation = NonNullable<Scene['transitionIn']['presentation']>;

function transitionPose(type: TransitionPresentation, progress: number, width: number, height: number, incoming: boolean): ScenePose {
  const p = Math.max(0, Math.min(1, progress));
  // Scenes always paint an opaque background. Keeping the outgoing scene fully
  // opaque and compositing the incoming scene over it produces a true crossfade
  // without the luminance dip caused by fading both canvases over black.
  const alpha = incoming ? p : 1;
  switch (type) {
    case 'cut': return { alpha: incoming ? 1 : 0, x: 0, y: 0, scale: 1, blur: 0 };
    case 'crossfade': return { alpha, x: 0, y: 0, scale: 1, blur: 0 };
    case 'slide-left': return { alpha: 1, x: incoming ? width * (1 - p) : -width * p, y: 0, scale: 1, blur: 0 };
    case 'slide-right': return { alpha: 1, x: incoming ? -width * (1 - p) : width * p, y: 0, scale: 1, blur: 0 };
    case 'push-up': return { alpha: 1, x: 0, y: incoming ? height * (1 - p) : -height * p, scale: 1, blur: 0 };
    case 'zoom': return { alpha, x: 0, y: 0, scale: incoming ? 0.88 + 0.12 * p : 1 + 0.08 * p, blur: 0 };
    case 'blur': return { alpha, x: 0, y: 0, scale: 1, blur: incoming ? 20 * (1 - p) : 20 * p };
    case 'wipe-left': return { alpha: 1, x: 0, y: 0, scale: 1, blur: 0, ...(incoming ? { clip: 'wipe-left' as const, clipProgress: p } : {}) };
    case 'wipe-right': return { alpha: 1, x: 0, y: 0, scale: 1, blur: 0, ...(incoming ? { clip: 'wipe-right' as const, clipProgress: p } : {}) };
    case 'iris': return { alpha: 1, x: 0, y: 0, scale: 1, blur: 0, ...(incoming ? { clip: 'iris' as const, clipProgress: p } : {}) };
  }
}

interface BoundaryTransition {
  previous: Scene;
  next: Scene;
  previousTime: number;
  nextTime: number;
  type: TransitionPresentation;
  progress: number;
  overlayCompositionId?: string;
}

function locateBoundaryTransition(project: GenmotionProject, active: ReturnType<typeof locateScene>, globalTime: number): BoundaryTransition | undefined {
  const candidates = active.index > 0 ? [active.index - 1, active.index] : [active.index];
  for (const previousIndex of candidates) {
    const previous = project.scenes[previousIndex];
    const next = project.scenes[previousIndex + 1];
    if (!previous || !next) continue;

    const boundary = previousIndex === active.index ? active.globalStart + previous.duration : active.globalStart;
    const outgoingType = previous.transitionOut.presentation ?? previous.transitionOut.type;
    const incomingType = next.transitionIn.presentation ?? next.transitionIn.type;
    let outgoingDuration = outgoingType === 'cut' ? 0 : previous.transitionOut.duration;
    let incomingDuration = incomingType === 'cut' ? 0 : next.transitionIn.duration;
    const configured = outgoingDuration > 0 && outgoingType !== 'cut' ? previous.transitionOut : next.transitionIn;
    if (configured.mode) {
      const span = configured.duration;
      outgoingDuration = configured.mode === 'incoming' ? 0 : configured.mode === 'symmetric' ? span / 2 : span;
      incomingDuration = configured.mode === 'outgoing' ? 0 : configured.mode === 'symmetric' ? span / 2 : span;
    }
    const duration = outgoingDuration + incomingDuration;
    const start = boundary - outgoingDuration;
    const end = boundary + incomingDuration;
    if (duration <= 0 || globalTime < start || globalTime >= end) continue;

    const transition = configured;
    const raw = (globalTime - start) / duration;
    const previousLastFrame = Math.max(0, previous.duration - 1 / project.fps);
    return {
      previous,
      next,
      previousTime: Math.max(0, Math.min(previousLastFrame, globalTime - (boundary - previous.duration))),
      nextTime: Math.max(0, Math.min(next.duration, globalTime - boundary)),
      type: transition.presentation ?? transition.type,
      progress: ease(transition.timing ?? transition.ease, raw),
      ...(transition.overlayCompositionId ? { overlayCompositionId: transition.overlayCompositionId } : {}),
    };
  }
  return undefined;
}

async function drawSceneContents(ctx: SKRSContext2D, scene: Scene, project: GenmotionProject, projectDir: string, time: number): Promise<void> {
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, project.width, project.height);
  const layers = resolveLayerGraph(scene.layers, time, project.seed);
  for (const layer of [...layers].sort((a, b) => a.z - b.z)) await drawLayer(ctx, layer, scene, project, projectDir, time, [], true);
}

async function drawScene(ctx: SKRSContext2D, scene: Scene, project: GenmotionProject, projectDir: string, time: number, pose: ScenePose, output: RenderDimensions): Promise<void> {
  if (pose.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = pose.alpha;
  ctx.filter = `blur(${String(pose.blur)}px)`;
  ctx.translate(project.width / 2 + pose.x, project.height / 2 + pose.y);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(-project.width / 2, -project.height / 2);
  if (pose.clip) {
    const progress = pose.clipProgress ?? 1;
    ctx.beginPath();
    if (pose.clip === 'iris') {
      const radius = Math.hypot(project.width, project.height) * progress / 2;
      ctx.arc(project.width / 2, project.height / 2, radius, 0, Math.PI * 2);
    } else if (pose.clip === 'wipe-left') ctx.rect(0, 0, project.width * progress, project.height);
    else ctx.rect(project.width * (1 - progress), 0, project.width * progress, project.height);
    ctx.clip();
  }
  if (pose.alpha < 1 || pose.blur > 0) {
    const sceneCanvas = createCanvas(output.width, output.height);
    const sceneContext = sceneCanvas.getContext('2d');
    sceneContext.scale(output.width / project.width, output.height / project.height);
    await drawSceneContents(sceneContext, scene, project, projectDir, time);
    ctx.drawImage(sceneCanvas, 0, 0, project.width, project.height);
  } else {
    await drawSceneContents(ctx, scene, project, projectDir, time);
  }
  ctx.restore();
}

function checkedDimensions(project: GenmotionProject, dimensions?: RenderDimensions): RenderDimensions {
  const width = dimensions?.width ?? project.width;
  const height = dimensions?.height ?? project.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new Error('Render dimensions must be integers greater than one.');
  return { width, height };
}

export async function renderFrame(project: GenmotionProject, projectDir: string, frame: number, dimensions?: RenderDimensions): Promise<Buffer> {
  registerProjectFonts(project, projectDir);
  const output = checkedDimensions(project, dimensions);
  const canvas = createCanvas(output.width, output.height);
  const ctx = canvas.getContext('2d');
  ctx.scale(output.width / project.width, output.height / project.height);
  const globalTime = frame / project.fps;
  const active = locateScene(project, globalTime);
  const identity: ScenePose = { alpha: 1, x: 0, y: 0, scale: 1, blur: 0 };

  const boundary = locateBoundaryTransition(project, active, globalTime);
  if (boundary) {
    await drawScene(ctx, boundary.previous, project, projectDir, boundary.previousTime, transitionPose(boundary.type, boundary.progress, project.width, project.height, false), output);
    await drawScene(ctx, boundary.next, project, projectDir, boundary.nextTime, transitionPose(boundary.type, boundary.progress, project.width, project.height, true), output);
    if (boundary.overlayCompositionId) {
      const composition = project.compositions.find((candidate) => candidate.id === boundary.overlayCompositionId);
      if (composition) await drawCompositionLayer(ctx, {
        id: `transition-overlay-${composition.id}`, type: 'composition', compositionId: composition.id,
        x: 0, y: 0, width: project.width, height: project.height, timeOffset: 0, timeScale: composition.duration,
        loop: false, start: 0, z: 0, visible: true, transform: DEFAULT_TRANSFORM, blendMode: 'source-over', tags: [], motion: [], tracks: [], bindings: {},
        constraints: [],
      }, project, projectDir, boundary.progress, []);
    }
  } else {
    await drawScene(ctx, active.scene, project, projectDir, active.localTime, identity, output);
  }

  return Buffer.from(ctx.getImageData(0, 0, output.width, output.height).data.buffer);
}

export async function renderFramePng(project: GenmotionProject, projectDir: string, frame: number, dimensions?: RenderDimensions): Promise<Buffer> {
  registerProjectFonts(project, projectDir);
  const output = checkedDimensions(project, dimensions);
  const rgba = await renderFrame(project, projectDir, frame, output);
  const canvas = createCanvas(output.width, output.height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(output.width, output.height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
}
