import { createCanvas, Path2D, type SKRSContext2D } from '@napi-rs/canvas';
import { access } from 'node:fs/promises';
import type { GenmotionProject, ImageLayer, Layer, Scene, ShapeLayer, TextLayer, VideoLayer } from '../ir/schema.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { loadCachedImage, registerProjectFonts, videoFramePath } from './assets.js';
import { evaluateNumber, layerIsActive, locateScene } from './timeline.js';
import { ease } from './easing.js';
import { evaluateLayerTracks } from './animation.js';
import { bezierPrefix, resolveAnchoredShape, shapeBounds } from './geometry.js';

interface Box { x: number; y: number; width: number; height: number }

export interface RenderDimensions { width: number; height: number }

function layerBox(layer: Layer): Box {
  if (layer.type === 'shape') return shapeBounds(layer);
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}

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
    const [left, top, right, bottom] = vector.getBounds();
    const sourceWidth = Math.max(1, right - left);
    const sourceHeight = Math.max(1, bottom - top);
    ctx.scale(layer.width / sourceWidth, layer.height / sourceHeight);
    ctx.translate(-left, -top);
    if (layer.fill) ctx.fill(vector);
    if (layer.stroke && layer.strokeWidth > 0) ctx.stroke(vector);
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

async function drawLayer(ctx: SKRSContext2D, layer: Layer, scene: Scene, project: GenmotionProject, projectDir: string, sceneTime: number): Promise<void> {
  if (!layer.visible || !layerIsActive(layer.start, layer.duration, scene.duration, sceneTime)) return;
  const localTime = sceneTime - layer.start;
  layer = evaluateLayerTracks(layer, localTime);
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
  ctx.translate(centerX + evaluateNumber(transform.x, localTime), centerY + evaluateNumber(transform.y, localTime));
  ctx.rotate(evaluateNumber(transform.rotation, localTime) * Math.PI / 180);
  ctx.scale(evaluateNumber(transform.scaleX, localTime), evaluateNumber(transform.scaleY, localTime));
  ctx.translate(-centerX, -centerY);
  if (layer.clip) {
    roundedPath(ctx, layer.clip.x, layer.clip.y, layer.clip.width, layer.clip.height, layer.clip.radius);
    ctx.clip();
  }
  if (layer.type === 'text') drawText(ctx, layer, localTime);
  else if (layer.type === 'shape') drawShape(ctx, layer, localTime);
  else if (layer.type === 'image') await drawImageLayer(ctx, layer, projectDir);
  else await drawVideoLayer(ctx, layer, projectDir, localTime, project.fps);
  ctx.restore();
}

interface ScenePose { alpha: number; x: number; y: number; scale: number; blur: number }

function transitionPose(type: Scene['transitionIn']['type'], progress: number, width: number, height: number, incoming: boolean): ScenePose {
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
  }
}

interface BoundaryTransition {
  previous: Scene;
  next: Scene;
  previousTime: number;
  nextTime: number;
  type: Scene['transitionIn']['type'];
  progress: number;
}

function locateBoundaryTransition(project: GenmotionProject, active: ReturnType<typeof locateScene>, globalTime: number): BoundaryTransition | undefined {
  const candidates = active.index > 0 ? [active.index - 1, active.index] : [active.index];
  for (const previousIndex of candidates) {
    const previous = project.scenes[previousIndex];
    const next = project.scenes[previousIndex + 1];
    if (!previous || !next) continue;

    const boundary = previousIndex === active.index ? active.globalStart + previous.duration : active.globalStart;
    const outgoingDuration = previous.transitionOut.type === 'cut' ? 0 : previous.transitionOut.duration;
    const incomingDuration = next.transitionIn.type === 'cut' ? 0 : next.transitionIn.duration;
    const duration = outgoingDuration + incomingDuration;
    const start = boundary - outgoingDuration;
    const end = boundary + incomingDuration;
    if (duration <= 0 || globalTime < start || globalTime >= end) continue;

    const transition = outgoingDuration > 0 && previous.transitionOut.type !== 'cut'
      ? previous.transitionOut
      : next.transitionIn;
    const raw = (globalTime - start) / duration;
    const previousLastFrame = Math.max(0, previous.duration - 1 / project.fps);
    return {
      previous,
      next,
      previousTime: Math.max(0, Math.min(previousLastFrame, globalTime - (boundary - previous.duration))),
      nextTime: Math.max(0, Math.min(next.duration, globalTime - boundary)),
      type: transition.type,
      progress: ease(transition.ease, raw),
    };
  }
  return undefined;
}

async function drawSceneContents(ctx: SKRSContext2D, scene: Scene, project: GenmotionProject, projectDir: string, time: number): Promise<void> {
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, project.width, project.height);
  for (const layer of [...scene.layers].sort((a, b) => a.z - b.z)) await drawLayer(ctx, layer, scene, project, projectDir, time);
}

async function drawScene(ctx: SKRSContext2D, scene: Scene, project: GenmotionProject, projectDir: string, time: number, pose: ScenePose, output: RenderDimensions): Promise<void> {
  if (pose.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = pose.alpha;
  ctx.filter = `blur(${String(pose.blur)}px)`;
  ctx.translate(project.width / 2 + pose.x, project.height / 2 + pose.y);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(-project.width / 2, -project.height / 2);
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
