import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { access } from 'node:fs/promises';
import type { GenmotionProject, ImageLayer, Layer, Scene, ShapeLayer, TextLayer, VideoLayer } from '../ir/schema.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { loadCachedImage, registerProjectFonts, videoFramePath } from './assets.js';
import { evaluateNumber, layerIsActive, locateScene } from './timeline.js';
import { ease } from './easing.js';

interface Box { x: number; y: number; width: number; height: number }

function layerBox(layer: Layer): Box {
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

function fontString(layer: TextLayer, size: number): string {
  return `${layer.fontStyle} ${String(layer.fontWeight)} ${String(size)}px "${layer.fontFamily}"`;
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

  if (layer.shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width * progress / 2, layer.height * progress / 2, 0, 0, Math.PI * 2);
  } else if (layer.shape === 'line') {
    ctx.beginPath();
    ctx.moveTo(layer.x, layer.y);
    ctx.lineTo(layer.x + layer.width * progress, layer.y + layer.height * progress);
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
  if (layer.fill && layer.shape !== 'line') ctx.fill();
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
  const alpha = incoming ? p : 1 - p;
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

async function drawScene(ctx: SKRSContext2D, scene: Scene, project: GenmotionProject, projectDir: string, time: number, pose: ScenePose): Promise<void> {
  ctx.save();
  ctx.globalAlpha = pose.alpha;
  ctx.filter = `blur(${String(pose.blur)}px)`;
  ctx.translate(project.width / 2 + pose.x, project.height / 2 + pose.y);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(-project.width / 2, -project.height / 2);
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, project.width, project.height);
  for (const layer of [...scene.layers].sort((a, b) => a.z - b.z)) await drawLayer(ctx, layer, scene, project, projectDir, time);
  ctx.restore();
}

export async function renderFrame(project: GenmotionProject, projectDir: string, frame: number): Promise<Buffer> {
  registerProjectFonts(project, projectDir);
  const canvas = createCanvas(project.width, project.height);
  const ctx = canvas.getContext('2d');
  const globalTime = frame / project.fps;
  const active = locateScene(project, globalTime);
  const identity: ScenePose = { alpha: 1, x: 0, y: 0, scale: 1, blur: 0 };

  const outgoingDuration = active.scene.transitionOut.duration;
  const inOutgoing = outgoingDuration > 0 && active.index < project.scenes.length - 1 && active.localTime >= active.scene.duration - outgoingDuration;
  const incomingDuration = active.scene.transitionIn.duration;
  const inIncoming = incomingDuration > 0 && active.index > 0 && active.localTime < incomingDuration;

  if (inOutgoing) {
    const next = project.scenes[active.index + 1];
    if (!next) throw new Error('Missing next scene.');
    const raw = (active.localTime - (active.scene.duration - outgoingDuration)) / outgoingDuration;
    const progress = ease(active.scene.transitionOut.ease, raw);
    await drawScene(ctx, active.scene, project, projectDir, active.localTime, transitionPose(active.scene.transitionOut.type, progress, project.width, project.height, false));
    await drawScene(ctx, next, project, projectDir, raw * next.transitionIn.duration, transitionPose(active.scene.transitionOut.type, progress, project.width, project.height, true));
  } else if (inIncoming) {
    const previous = project.scenes[active.index - 1];
    if (!previous) throw new Error('Missing previous scene.');
    const progress = ease(active.scene.transitionIn.ease, active.localTime / incomingDuration);
    await drawScene(ctx, previous, project, projectDir, Math.max(0, previous.duration - 0.5 / project.fps), transitionPose(active.scene.transitionIn.type, progress, project.width, project.height, false));
    await drawScene(ctx, active.scene, project, projectDir, active.localTime, transitionPose(active.scene.transitionIn.type, progress, project.width, project.height, true));
  } else {
    await drawScene(ctx, active.scene, project, projectDir, active.localTime, identity);
  }

  return Buffer.from(ctx.getImageData(0, 0, project.width, project.height).data.buffer);
}

export async function renderFramePng(project: GenmotionProject, projectDir: string, frame: number): Promise<Buffer> {
  registerProjectFonts(project, projectDir);
  const rgba = await renderFrame(project, projectDir, frame);
  const canvas = createCanvas(project.width, project.height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(project.width, project.height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
}
