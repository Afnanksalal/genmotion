import type { RenderView } from './render-view.js';
import { captionWordRanges, captionLineRanges } from './caption-layout.js';
import { mediaSourceCrop, mediaRoundedPath } from './media-geometry.js';
import { imageSourceFrame, spriteFrameRect } from './image-animation.js';
import { warpCanvasQuad, perspectiveQuad, cubeTransitionQuads, type Quad } from './projective.js';
import { applyLayerMasks } from './masks.js';
import { canvasFontWeight, fontString, resolveTextLayout } from './text-layout.js';
import { revealUnicodeText } from './text-unicode.js';
export { canvasFontWeight };
import { createCanvas, Path2D, type SKRSContext2D } from '@napi-rs/canvas';
import { access } from 'node:fs/promises';
import type { CaptionLayer, GenmotionProject, ImageLayer, Layer, Scene, ShapeLayer, TextLayer, VideoLayer } from '../ir/schema.js';
import { DEFAULT_TRANSFORM, shapeLayerSchema } from '../ir/schema.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { loadCachedImage, registerProjectFonts, videoFramePath } from './assets.js';
import { evaluateNumber, layerIsActive, locateScene } from './timeline.js';
import { ease } from './easing.js';
import { evaluateLayerTracks } from './animation.js';
import { bezierPrefix, layerBox, resolveAnchoredShape } from './geometry.js';
import { pathMetrics, samplePath } from './path.js';
import { applyPathOperations } from './path-operations.js';
import { effectiveLayerStart, resolveLayerGraph } from './constraints.js';
import { compositionTime } from './composition-time.js';
import { nativePrimitivePath } from './primitives.js';
import { createGradient } from './paint.js';
import { applyVisualEffects } from './effects.js';

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

function drawText(ctx: SKRSContext2D, original: TextLayer, time: number): void {
  ctx.save();
  try {
  let content = original.text;
  if (original.countFrom !== undefined) {
    const target = Number(original.text.replace(/[^0-9.+-]/g, ''));
    if (Number.isFinite(target)) {
      const progress = Math.max(0, Math.min(1, evaluateNumber(original.countProgress, time)));
      const value = original.countFrom + (target - original.countFrom) * progress;
      const format = original.numberFormat ?? { decimals: 0, prefix: '', suffix: '', grouping: true };
      content = `${format.prefix}${value.toLocaleString(original.locale ?? 'en-US', { useGrouping: format.grouping, minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals })}${format.suffix}`;
    }
  }
  let layer = { ...original, text: revealUnicodeText(content, original.reveal, evaluateNumber(original.revealProgress, time), original.locale) };
  const layout = resolveTextLayout(ctx, layer);
  const { lines, fontSize } = layout;
  layer = { ...layer, width: layout.boxWidth, height: layout.boxHeight };
  ctx.font = fontString(layer, fontSize);
  ctx.fillStyle = layer.gradientFill ? createGradient(ctx, layer.gradientFill, layer) : layer.color;
  ctx.textBaseline = layout.textBaseline;
  ctx.textAlign = 'left';
  ctx.letterSpacing = `${layer.letterSpacing}px`;
  applyShadow(ctx, layer.shadow);
  for (const [index, line] of lines.entries()) {
    ctx.direction = layout.directions[index]!;
    ctx.fillText(line, layer.x + layout.xOffsets[index]!, layer.y + layout.yOffsets[index]!);
  }
  applyShadow(ctx, undefined);
  } finally { ctx.restore(); }
}

function drawCaption(ctx: SKRSContext2D, layer: CaptionLayer, time: number): void {
  const cue = layer.cues.find((candidate) => time >= candidate.start && time < candidate.end);
  if (!cue) return;
  layer = Object.assign({}, layer, Object.fromEntries(Object.entries({ ...(cue.speaker ? layer.speakerStyles?.[cue.speaker] : {}), ...cue.style }).filter(([, value]) => value !== undefined)));
  ctx.save(); ctx.direction = layer.direction;
  const speakerPrefix = layer.showSpeaker && cue.speaker ? cue.speaker + ': ' : '';
  const textLayer: TextLayer = {
    ...layer, type: 'text', text: speakerPrefix + cue.text,
    fit: 'shrink', reveal: 'none', revealProgress: 1, countProgress: 1,
    verticalAlign: 'middle', lineHeight: 1.12, letterSpacing: 0, fontStyle: 'normal',
  };
  if (layer.background) {
    ctx.fillStyle = layer.background;
    roundedPath(ctx, layer.x, layer.y, layer.width, layer.height, layer.radius);
    ctx.fill();
  }
  const inset = { ...textLayer, x: layer.x + layer.padding, y: layer.y + layer.padding, width: Math.max(1, layer.width - layer.padding * 2), height: Math.max(1, layer.height - layer.padding * 2) };
  if (layer.outlineColor && layer.outlineWidth > 0) {
    const layout = resolveTextLayout(ctx, inset);
    ctx.save(); ctx.font = fontString(inset, layout.fontSize); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.strokeStyle = layer.outlineColor; ctx.lineWidth = layer.outlineWidth * 2; ctx.lineJoin = 'round';
    const blockHeight = layout.lines.length * layout.lineHeight;
    for (const [index, line] of layout.lines.entries()) {
      const measured = ctx.measureText(line).width;
      const x = inset.x + (inset.align === 'center' ? (inset.width - measured) / 2 : inset.align === 'right' ? inset.width - measured : 0);
      ctx.strokeText(line, x, inset.y + (inset.height - blockHeight) / 2 + index * layout.lineHeight);
    }
    ctx.restore();
  }
  drawText(ctx, inset, time);
  if (layer.highlightColor && layer.highlightMode !== 'none') {
    const layout = resolveTextLayout(ctx, inset), lineRanges = captionLineRanges(inset.text, layout.lines), words = captionWordRanges(cue);
    ctx.save(); ctx.font = fontString(inset, layout.fontSize); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = layer.highlightColor;
    for (const wordRange of words) {
      const word = cue.words[wordRange.index]!;
      const progress = layer.highlightMode === 'karaoke' ? Math.max(0, Math.min(1, (time - word.start) / (word.end - word.start))) : time >= word.start && time < word.end ? 1 : 0;
      if (progress <= 0) continue;
      const start = speakerPrefix.length + wordRange.start, end = speakerPrefix.length + wordRange.end;
      for (const [lineIndex, line] of layout.lines.entries()) {
        const mapping = lineRanges[lineIndex]!, first = mapping.indices.findIndex((offset) => offset >= start && offset < end);
        if (first < 0) continue;
        let last = first + 1; while (last < mapping.indices.length && mapping.indices[last]! < end) last += 1;
        const measured = ctx.measureText(line).width, prefixWidth = ctx.measureText(line.slice(0, first)).width, throughWidth = ctx.measureText(line.slice(0, last)).width;
        const left = inset.x + (inset.align === 'center' ? (inset.width - measured) / 2 : inset.align === 'right' ? inset.width - measured : 0), top = inset.y + (inset.height - layout.lines.length * layout.lineHeight) / 2 + lineIndex * layout.lineHeight;
        const width = Math.max(0, throughWidth - prefixWidth), highlightedWidth = width * progress;
        const x = layer.direction === 'rtl' ? left + measured - prefixWidth - highlightedWidth : left + prefixWidth;
        ctx.save(); ctx.beginPath(); ctx.rect(x, top - layout.fontSize * .3, highlightedWidth, layout.lineHeight + layout.fontSize * .6); ctx.clip(); ctx.fillText(line, left, top); ctx.restore();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawShape(ctx: SKRSContext2D, layer: ShapeLayer, time: number): void {
  const progress = Math.max(0, Math.min(1, evaluateNumber(layer.progress, time)));
  applyShadow(ctx, layer.shadow);
  const hasFill = Boolean(layer.fill || layer.gradientFill), hasStroke = Boolean(layer.stroke || layer.gradientStroke);
  if (layer.gradientFill) ctx.fillStyle = createGradient(ctx, layer.gradientFill, layer); else if (layer.fill) ctx.fillStyle = layer.fill;
  if (layer.gradientStroke) ctx.strokeStyle = createGradient(ctx, layer.gradientStroke, layer); else if (layer.stroke) ctx.strokeStyle = layer.stroke;
  ctx.lineWidth = layer.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const sourcePath = layer.shape === 'path' ? layer.path : nativePrimitivePath(layer);
  if (sourcePath !== undefined) {
    if (!sourcePath) { applyShadow(ctx, undefined); return; }
    const data = layer.pathOperations?.length ? applyPathOperations(sourcePath, layer.pathOperations) : sourcePath;
    if (!data) { applyShadow(ctx, undefined); return; }
    let vector = new Path2D(data);
    ctx.save();
    const metrics = layer.shape === 'path' ? pathMetrics(data) : { bounds: { x: 0, y: 0, width: 1000, height: 1000 } };
    const left = metrics.bounds.x; const top = metrics.bounds.y;
    const sourceWidth = Math.max(1, metrics.bounds.width);
    const sourceHeight = Math.max(1, metrics.bounds.height);
    const scaleX = layer.width / sourceWidth, scaleY = layer.height / sourceHeight;
    vector = vector.transform({ a: scaleX, b: 0, c: 0, d: scaleY, e: layer.x - left * scaleX, f: layer.y - top * scaleY });
    if (hasFill && progress >= 1) ctx.fill(vector);
    if (hasStroke && layer.strokeWidth > 0) {
      if (progress >= 1) ctx.stroke(vector);
      else {
        ctx.stroke(new Path2D(vector).trim(0, progress));
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
  if (hasFill && layer.shape !== 'line' && layer.shape !== 'bezier') ctx.fill();
  if (hasStroke && layer.strokeWidth > 0) ctx.stroke();
  applyShadow(ctx, undefined);
}

function drawFittedImage(ctx: SKRSContext2D, image: Awaited<ReturnType<typeof loadCachedImage>>, layer: ImageLayer | VideoLayer, time: number): void {
  const source = mediaSourceCrop(layer, image.width, image.height, time);
  let dx = layer.x;
  let dy = layer.y;
  let dw = layer.width;
  let dh = layer.height;
  if (layer.fit !== 'fill' && layer.fit !== 'stretch') {
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
  const radii: [number, number, number, number] = layer.cornerRadii ?? [layer.radius, layer.radius, layer.radius, layer.radius];
  mediaRoundedPath(ctx, layer.x, layer.y, layer.width, layer.height, radii);
  ctx.clip();
  ctx.drawImage(image, source.x, source.y, source.width, source.height, dx, dy, dw, dh);
  if (layer.border) {
    const width = Math.min(Math.max(0, evaluateNumber(layer.border.width, time)), Math.min(layer.width, layer.height));
    if (width > 0) {
      ctx.strokeStyle = layer.border.color; ctx.lineWidth = width;
      mediaRoundedPath(ctx, layer.x + width / 2, layer.y + width / 2, Math.max(0, layer.width - width), Math.max(0, layer.height - width), radii.map((radius) => Math.max(0, radius - width / 2)) as [number, number, number, number]); ctx.stroke();
    }
  }
  ctx.restore();
}

async function drawImageLayer(ctx: SKRSContext2D, layer: ImageLayer, projectDir: string, time: number): Promise<void> {
  const animation = layer.sourceAnimation, frame = animation ? imageSourceFrame(animation, time, layer.sourceFrame === undefined ? undefined : evaluateNumber(layer.sourceFrame, time)) : 0;
  const image = await loadCachedImage(resolveProjectAsset(projectDir, animation?.type === 'sequence' ? animation.frames[frame]! : layer.src));
  if (animation?.type === 'sprite') {
    const cell = spriteFrameRect(animation, frame, image.width, image.height), crop = mediaSourceCrop(layer, cell.width, cell.height, time);
    if (crop.x + crop.width > cell.width || crop.y + crop.height > cell.height) throw new Error('Sprite source crop exceeds its frame cell');
    drawFittedImage(ctx, image, { ...layer, crop: { ...crop, x: cell.x + crop.x, y: cell.y + crop.y } }, time);
  } else drawFittedImage(ctx, image, layer, time);
}

async function drawVideoLayer(ctx: SKRSContext2D, layer: VideoLayer, projectDir: string, localLayerTime: number, fps: number, containerDuration: number): Promise<void> {
  const framePath = videoFramePath(projectDir, layer, localLayerTime, fps, containerDuration);
  await access(framePath);
  const image = await loadCachedImage(framePath);
  drawFittedImage(ctx, image, layer, localLayerTime);
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

  if (layer.type === 'adjustment') {
    if (!layer.effects?.some((effect) => effect.enabled)) return;
    const width = ctx.canvas.width, height = ctx.canvas.height;
    const original = createCanvas(width, height), originalContext = original.getContext('2d');
    originalContext.drawImage(ctx.canvas, 0, 0);
    const processed = applyVisualEffects(original, layer.effects, localTime, project.seed);
    const coverage = createCanvas(width, height), coverageContext = coverage.getContext('2d');
    coverageContext.setTransform(ctx.getTransform());
    const coverageLayer = shapeLayerSchema.parse({ ...layer, type: 'shape', shape: 'rect', fill: '#ffffff', effects: [], transform: { ...transform, opacity: 1 } });
    await drawLayer(coverageContext, coverageLayer, scene, project, projectDir, sceneTime, compositionStack, true);
    const before = originalContext.getImageData(0, 0, width, height), after = processed.getContext('2d').getImageData(0, 0, width, height).data, mask = coverageContext.getImageData(0, 0, width, height).data;
    for (let index = 0; index < before.data.length; index += 4) {
      const weight = Math.max(0, Math.min(1, opacity * ctx.globalAlpha * mask[index + 3]! / 255));
      const oldAlpha = before.data[index + 3]! / 255, newAlpha = after[index + 3]! / 255, alpha = oldAlpha * (1 - weight) + newAlpha * weight;
      for (let channel = 0; channel < 3; channel += 1) before.data[index + channel] = alpha ? (before.data[index + channel]! * oldAlpha * (1 - weight) + after[index + channel]! * newAlpha * weight) / alpha : 0;
      before.data[index + 3] = alpha * 255;
    }
    originalContext.putImageData(before, 0, 0);
    ctx.save(); ctx.resetTransform(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.clearRect(0, 0, width, height); ctx.drawImage(original, 0, 0); ctx.restore();
    return;
  }

  if (layer.effects?.some((effect) => effect.enabled) || layer.masks?.some((mask) => mask.enabled)) {
    const isolated = createCanvas(ctx.canvas.width, ctx.canvas.height);
    const isolatedContext = isolated.getContext('2d');
    isolatedContext.setTransform(ctx.getTransform());
    await drawLayer(isolatedContext, { ...layer, effects: [], masks: [], blendMode: 'source-over', transform: { ...transform, opacity: 1 } }, scene, project, projectDir, sceneTime, compositionStack, true);
    isolatedContext.save();
    const maskPose = layer.followPath ? samplePath(layer.followPath.path, evaluateNumber(layer.followPath.progress, localTime)) : undefined;
    isolatedContext.translate(centerX + evaluateNumber(transform.x, localTime) + (maskPose?.x ?? 0) + (layer.followPath?.offsetX ?? 0), centerY + evaluateNumber(transform.y, localTime) + (maskPose?.y ?? 0) + (layer.followPath?.offsetY ?? 0));
    isolatedContext.rotate((evaluateNumber(transform.rotation, localTime) + (layer.followPath?.orient ? maskPose?.angle ?? 0 : 0)) * Math.PI / 180);
    isolatedContext.scale(evaluateNumber(transform.scaleX, localTime), evaluateNumber(transform.scaleY, localTime));
    isolatedContext.translate(-centerX, -centerY);
    const masked = applyLayerMasks(isolated, layer.masks ?? [], localTime, isolatedContext.getTransform());
    isolatedContext.restore();
    const processed = applyVisualEffects(masked, layer.effects ?? [], localTime, project.seed);
    ctx.save();
    ctx.resetTransform();
    ctx.globalAlpha *= opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    ctx.filter = 'none';
    ctx.drawImage(processed, 0, 0);
    ctx.restore();
    return;
  }

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
  else if (layer.type === 'image') await drawImageLayer(ctx, layer, projectDir, localTime);
  else if (layer.type === 'video') await drawVideoLayer(ctx, layer, projectDir, localTime, project.fps, scene.duration);
  else await drawCompositionLayer(ctx, layer, project, projectDir, localTime, compositionStack);
  ctx.restore();
}

async function drawCompositionLayer(ctx: SKRSContext2D, layer: Extract<Layer, { type: 'composition' }>, project: GenmotionProject, projectDir: string, localTime: number, compositionStack: string[], isolated = false): Promise<void> {
  const composition = project.compositions.find((candidate) => candidate.id === layer.compositionId);
  if (!composition) return;
  if (compositionStack.includes(composition.id)) throw new Error(`Composition cycle while rendering: ${[...compositionStack, composition.id].join(' -> ')}`);
  const time = compositionTime(layer, composition, localTime, project.fps);
  if (!isolated) {
    const surface = createCanvas(ctx.canvas.width, ctx.canvas.height), surfaceContext = surface.getContext('2d');
    surfaceContext.setTransform(ctx.getTransform());
    await drawCompositionLayer(surfaceContext, layer, project, projectDir, localTime, compositionStack, true);
    const processed = applyVisualEffects(surface, composition.effects ?? [], time, project.seed);
    ctx.save(); ctx.resetTransform(); ctx.drawImage(processed, 0, 0); ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.scale(layer.width / composition.width, layer.height / composition.height);
  if (layer.clipToBounds) { ctx.beginPath(); ctx.rect(0, 0, composition.width, composition.height); ctx.clip(); }
  if (composition.background) { ctx.fillStyle = composition.background; ctx.fillRect(0, 0, composition.width, composition.height); }
  const scene = { id: composition.id, purpose: composition.id, duration: composition.duration, background: composition.background ?? 'rgba(0,0,0,0)', layers: composition.layers, transitionIn: { type: 'cut' as const, duration: 0, ease: 'linear' as const, mode: 'symmetric' as const }, transitionOut: { type: 'cut' as const, duration: 0, ease: 'linear' as const, mode: 'symmetric' as const }, referenceDecisions: [], notes: [] };
  const children = resolveLayerGraph(composition.layers, time, project.seed);
  for (const child of [...children].sort((a, b) => a.z - b.z)) await drawLayer(ctx, child, scene, project, projectDir, time, [...compositionStack, composition.id], true);
  ctx.restore();
}

interface ScenePose { alpha: number; x: number; y: number; scale: number; blur: number; quad?: Quad; clip?: 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'clock' | 'iris'; clipProgress?: number }

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
    case 'slide-up':
    case 'push-up': return { alpha: 1, x: 0, y: incoming ? height * (1 - p) : -height * p, scale: 1, blur: 0 };
    case 'slide-down': return { alpha: 1, x: 0, y: incoming ? -height * (1 - p) : height * p, scale: 1, blur: 0 };
    case 'flip': return { alpha: incoming ? (p < .5 ? 0 : 1) : (p >= .5 ? 0 : 1), x: 0, y: 0, scale: 1, blur: 0, quad: perspectiveQuad(width, height, (incoming ? (p - 1) : p) * 180) };
    case 'cube': { const quads = cubeTransitionQuads(width, height, p); return { alpha: 1, x: 0, y: 0, scale: 1, blur: 0, quad: incoming ? quads[1] : quads[0] }; }
    case 'door': return { alpha: 1, x: 0, y: 0, scale: 1, blur: 0, ...(incoming ? { quad: perspectiveQuad(width, height, (1 - p) * 90, 0, [.5, .5], true) } : {}) };
    case 'wipe-up': case 'wipe-down': case 'clock': return { alpha: 1, x: 0, y: 0, scale: 1, blur: 0, ...(incoming ? { clip: type, clipProgress: p } : {}) };
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

async function drawSceneContents(ctx: SKRSContext2D, scene: Scene, project: GenmotionProject, projectDir: string, time: number, view?: RenderView): Promise<void> {
  ctx.fillStyle = view ? 'rgba(0,0,0,0)' : scene.background;
  ctx.fillRect(0, 0, project.width, project.height);
  const layers = resolveLayerGraph(scene.layers, time, project.seed);
  const included = view ? new Set(view.layerIds) : undefined;
  for (const layer of [...layers].sort((a, b) => a.z - b.z)) if (!included || included.has(layer.id)) await drawLayer(ctx, layer, scene, project, projectDir, time, [], true);
}

async function drawScene(ctx: SKRSContext2D, scene: Scene, project: GenmotionProject, projectDir: string, time: number, pose: ScenePose, output: RenderDimensions, view?: RenderView): Promise<void> {
  if (view && scene.id !== view.sceneId) return;
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
    else if (pose.clip === 'wipe-right') ctx.rect(project.width * (1 - progress), 0, project.width * progress, project.height);
    else if (pose.clip === 'wipe-up') ctx.rect(0, project.height * (1 - progress), project.width, project.height * progress);
    else if (pose.clip === 'wipe-down') ctx.rect(0, 0, project.width, project.height * progress);
    else { ctx.moveTo(project.width / 2, project.height / 2); ctx.arc(project.width / 2, project.height / 2, Math.hypot(project.width, project.height), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.closePath(); }
    ctx.clip();
  }
  if (pose.quad || pose.alpha < 1 || pose.blur > 0 || scene.effects?.some((effect) => effect.enabled)) {
    const sceneCanvas = createCanvas(output.width, output.height);
    const sceneContext = sceneCanvas.getContext('2d');
    sceneContext.scale(output.width / project.width, output.height / project.height);
    await drawSceneContents(sceneContext, scene, project, projectDir, time, view);
    const processed = applyVisualEffects(sceneCanvas, scene.effects ?? [], time, project.seed);
    ctx.drawImage(pose.quad ? warpCanvasQuad(processed, pose.quad) : processed, 0, 0, project.width, project.height);
  } else {
    await drawSceneContents(ctx, scene, project, projectDir, time, view);
  }
  ctx.restore();
}

function checkedDimensions(project: GenmotionProject, dimensions?: RenderDimensions): RenderDimensions {
  const width = dimensions?.width ?? project.width;
  const height = dimensions?.height ?? project.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new Error('Render dimensions must be integers greater than one.');
  return { width, height };
}

export async function renderFrame(project: GenmotionProject, projectDir: string, frame: number, dimensions?: RenderDimensions, view?: RenderView): Promise<Buffer> {
  if (!Number.isFinite(frame) || frame < 0 || !Number.isFinite(project.fps) || project.fps <= 0 || !Number.isFinite(frame / project.fps)) throw new Error('Rendering requires a finite nonnegative frame and positive FPS.');
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
    await drawScene(ctx, boundary.previous, project, projectDir, boundary.previousTime, transitionPose(boundary.type, boundary.progress, project.width, project.height, false), output, view);
    await drawScene(ctx, boundary.next, project, projectDir, boundary.nextTime, transitionPose(boundary.type, boundary.progress, project.width, project.height, true), output, view);
    if (boundary.overlayCompositionId && !view) {
      const composition = project.compositions.find((candidate) => candidate.id === boundary.overlayCompositionId);
      if (composition) await drawCompositionLayer(ctx, {
        id: `transition-overlay-${composition.id}`, type: 'composition', compositionId: composition.id,
        x: 0, y: 0, width: project.width, height: project.height, timeOffset: 0, timeScale: composition.duration,
        loop: false, start: 0, z: 0, visible: true, transform: DEFAULT_TRANSFORM, blendMode: 'source-over', tags: [], motion: [], tracks: [], bindings: {},
        constraints: [],
      }, project, projectDir, boundary.progress, []);
    }
  } else {
    await drawScene(ctx, active.scene, project, projectDir, active.localTime, identity, output, view);
  }

  return Buffer.from(ctx.getImageData(0, 0, output.width, output.height).data.buffer);
}

export async function renderFramePng(project: GenmotionProject, projectDir: string, frame: number, dimensions?: RenderDimensions, view?: RenderView): Promise<Buffer> {
  registerProjectFonts(project, projectDir);
  const output = checkedDimensions(project, dimensions);
  const rgba = await renderFrame(project, projectDir, frame, output, view);
  const canvas = createCanvas(output.width, output.height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(output.width, output.height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
}
