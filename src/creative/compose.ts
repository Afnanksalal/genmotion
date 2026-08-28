import path from 'node:path';
import { DEFAULT_TRANSFORM, projectSchema, type GenmotionProject, type Layer } from '../ir/schema.js';
import type { CreativeBrief, CreativeConcept } from './types.js';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const videoExtensions = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);

function safeMotion(ids: string[], layer: 'text' | 'shape' | 'media'): string {
  const allowed = layer === 'text'
    ? ['masked-rise', 'confident-slide', 'scale-lock', 'word-cascade', 'character-decode', 'metric-count', 'camera-push', 'camera-pull', 'ambient-breathe', 'parallax-drift', 'kinetic-slam', 'focus-rack', 'orbit-settle', 'list-stagger', 'glitch-lock', 'slow-dissolve', 'hard-register-cut', 'path-follow', 'panel-stack', 'cursor-confirm', 'depth-assemble']
    : layer === 'shape' ? ['line-route', 'scan-reveal', 'editorial-wipe', 'split-reveal', 'confident-slide', 'scale-lock', 'ambient-breathe']
    : ['confident-slide', 'scale-lock', 'camera-push', 'camera-pull', 'ambient-breathe', 'parallax-drift', 'kinetic-slam', 'focus-rack', 'orbit-settle', 'list-stagger', 'glitch-lock', 'slow-dissolve', 'hard-register-cut', 'path-follow', 'panel-stack', 'cursor-confirm', 'depth-assemble'];
  return ids.find((id) => allowed.includes(id)) ?? (layer === 'shape' ? 'editorial-wipe' : layer === 'text' ? 'masked-rise' : 'camera-push');
}

function copyForScene(brief: CreativeBrief, index: number, total: number): { eyebrow: string; headline: string; detail: string } {
  if (index === 0) return { eyebrow: brief.title.toUpperCase(), headline: brief.promise, detail: brief.audience };
  if (index === total - 1) return { eyebrow: 'READY WHEN YOU ARE', headline: brief.desiredAction, detail: brief.proof.at(-1) ?? brief.promise };
  const proof = brief.proof[(index - 1) % brief.proof.length] ?? brief.promise;
  return { eyebrow: `PROOF ${String(index).padStart(2, '0')}`, headline: proof, detail: brief.requiredScenes[index - 1] ?? brief.promise };
}

function buildMediaLayer(brief: CreativeBrief, index: number, duration: number, motionIds: string[]): Layer | undefined {
  const asset = brief.assets[index % Math.max(1, brief.assets.length)];
  if (!asset) return undefined;
  const extension = path.extname(asset.path).toLowerCase();
  const common = {
    id: `media-${String(index)}`,
    x: 1050, y: 135, width: 720, height: 810,
    start: 0.25, duration: Math.max(0.5, duration - 0.5), z: 10, visible: true,
    transform: { ...DEFAULT_TRANSFORM }, blendMode: 'source-over' as const, tags: ['proof', asset.role],
    motion: [{ recipe: safeMotion(motionIds, 'media'), start: 0.25, duration: Math.min(1.1, duration * 0.28), intensity: 1 }],
    tracks: [],
    fit: 'cover' as const, radius: 34,
  };
  if (imageExtensions.has(extension)) return { ...common, type: 'image', src: asset.path };
  if (videoExtensions.has(extension)) return { ...common, type: 'video', src: asset.path, trimStart: 0, playbackRate: 1, volume: 1 };
  return undefined;
}

export function composeProject(brief: CreativeBrief, concept: CreativeConcept): GenmotionProject {
  const count = concept.sceneDirections.length;
  const baseDuration = brief.duration / count;
  const scenes = concept.sceneDirections.map((direction, index) => {
    const duration = index === count - 1 ? brief.duration - baseDuration * (count - 1) : baseDuration;
    const copy = copyForScene(brief, index, count);
    const hasMedia = brief.assets.length > 0;
    const textWidth = hasMedia ? 820 : 1480;
    const layers: Layer[] = [
      {
        id: `accent-field-${String(index)}`, type: 'shape', shape: 'ellipse', x: index % 2 === 0 ? -240 : 1410, y: -220, width: 760, height: 760,
        fill: brief.brand.accent, strokeWidth: 0, radius: 0, progress: 1,
        start: 0, duration, z: 0, visible: true, transform: { ...DEFAULT_TRANSFORM, opacity: 0.14 }, blendMode: 'screen', tags: ['atmosphere'],
        motion: [{ recipe: 'ambient-breathe', start: 0, duration: Math.max(1, duration), intensity: 0.7 }],
        tracks: [],
      },
      {
        id: `eyebrow-${String(index)}`, type: 'text', text: copy.eyebrow, x: 130, y: 150, width: textWidth, height: 55,
        fontFamily: brief.brand.primaryFont, fontSize: 22, fontWeight: 700, fontStyle: 'normal', color: brief.brand.accent,
        align: 'left', verticalAlign: 'top', lineHeight: 1, letterSpacing: 4, fit: 'shrink', reveal: 'none', revealProgress: 1, countProgress: 1,
        start: 0.1, duration: duration - 0.1, z: 20, visible: true, transform: { ...DEFAULT_TRANSFORM }, blendMode: 'source-over', tags: ['label'],
        motion: [{ recipe: 'confident-slide', start: 0.1, duration: Math.min(0.55, duration * 0.2), intensity: 0.6, direction: 'left' }],
        tracks: [],
      },
      {
        id: `headline-${String(index)}`, type: 'text', text: copy.headline, x: 130, y: 260, width: textWidth, height: 430,
        fontFamily: brief.brand.displayFont, fontSize: hasMedia ? 82 : 112, fontWeight: 800, fontStyle: 'normal', color: brief.brand.foreground,
        align: 'left', verticalAlign: 'middle', lineHeight: 0.98, letterSpacing: -2.2, fit: 'shrink', reveal: 'none', revealProgress: 1, countProgress: 1,
        start: 0.15, duration: duration - 0.15, z: 21, visible: true, transform: { ...DEFAULT_TRANSFORM }, blendMode: 'source-over', tags: ['headline'],
        motion: [{ recipe: safeMotion(direction.motion, 'text'), start: 0.15, duration: Math.min(0.9, duration * 0.28), intensity: 1 }],
        tracks: [],
      },
      {
        id: `detail-${String(index)}`, type: 'text', text: copy.detail, x: 134, y: 760, width: Math.min(textWidth, 900), height: 130,
        fontFamily: brief.brand.primaryFont, fontSize: 30, fontWeight: 400, fontStyle: 'normal', color: brief.brand.muted,
        align: 'left', verticalAlign: 'top', lineHeight: 1.25, letterSpacing: 0, fit: 'shrink', reveal: 'none', revealProgress: 1, countProgress: 1,
        start: 0.55, duration: Math.max(0.2, duration - 0.55), z: 21, visible: true, transform: { ...DEFAULT_TRANSFORM }, blendMode: 'source-over', tags: ['detail'],
        motion: [{ recipe: 'masked-rise', start: 0.55, duration: Math.min(0.65, duration * 0.2), intensity: 0.65, direction: 'up' }],
        tracks: [],
      },
      {
        id: `rule-${String(index)}`, type: 'shape', shape: 'line', x: 130, y: 930, width: hasMedia ? 820 : 1660, height: 0,
        stroke: brief.brand.accent, strokeWidth: 3, radius: 0, progress: 1,
        start: 0.35, duration: duration - 0.35, z: 18, visible: true, transform: { ...DEFAULT_TRANSFORM }, blendMode: 'source-over', tags: ['structure'],
        motion: [{ recipe: 'line-route', start: 0.35, duration: Math.min(0.85, duration * 0.25), intensity: 1 }],
        tracks: [],
      },
    ];
    const media = buildMediaLayer(brief, index, duration, direction.motion);
    if (media) layers.push(media);
    return {
      id: `scene-${String(index + 1)}`,
      purpose: direction.purpose,
      duration,
      background: brief.brand.background,
      layers,
      transitionIn: { type: index === 0 ? 'cut' as const : index % 3 === 0 ? 'blur' as const : 'crossfade' as const, duration: index === 0 ? 0 : Math.min(0.45, duration * 0.15), ease: 'cubic-in-out' as const },
      transitionOut: { type: index === count - 1 ? 'cut' as const : index % 3 === 1 ? 'slide-left' as const : 'crossfade' as const, duration: index === count - 1 ? 0 : Math.min(0.45, duration * 0.15), ease: 'cubic-in-out' as const },
      referenceDecisions: concept.referenceIds.map((referenceId) => ({ referenceId, borrow: concept.borrow, avoid: concept.avoid, transform: concept.transform })),
      notes: [direction.composition, ...concept.negativeConstraints],
    };
  });

  return projectSchema.parse({
    schemaVersion: 1,
    id: brief.id,
    title: brief.title,
    width: 1920,
    height: 1080,
    fps: 30,
    seed: 1,
    brand: { background: brief.brand.background, foreground: brief.brand.foreground, accent: brief.brand.accent, muted: brief.brand.muted, fonts: [], radius: 24, tone: brief.brand.tone },
    scenes,
    audio: [],
    metadata: { mode: brief.mode, audience: brief.audience, desiredAction: brief.desiredAction, conceptId: concept.id },
  });
}
