import type { AnimatedNumber, GenmotionProject, Layer, Transform } from '../ir/schema.js';
import { motionRecipes } from '../catalog/motions.js';
import { GenmotionError } from '../errors.js';

type NumericProperty = keyof Pick<Transform, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity' | 'blur'>;

function track(values: Array<{ at: number; value: number; ease?: 'linear' | 'sine-in-out' | 'cubic-out' | 'expo-out' | 'back-out' | 'cubic-in' }>): AnimatedNumber {
  return { keyframes: values.map((value) => ({ ease: 'linear', ...value })) };
}

function directionOffset(direction: string | undefined, distance: number): { x: number; y: number } {
  if (direction === 'right') return { x: distance, y: 0 };
  if (direction === 'up') return { x: 0, y: -distance };
  if (direction === 'down') return { x: 0, y: distance };
  return { x: -distance, y: 0 };
}

function recipeTracks(id: string, start: number, duration: number, intensity: number, direction: string | undefined): Partial<Record<NumericProperty, AnimatedNumber>> {
  const end = start + duration;
  const offset = directionOffset(direction, 90 * intensity);
  switch (id) {
    case 'masked-rise':
      return { y: track([{ at: start, value: 45 * intensity }, { at: end, value: 0, ease: 'cubic-out' }]), opacity: track([{ at: start, value: 0 }, { at: end * 0.75 + start * 0.25, value: 1, ease: 'cubic-out' }]) };
    case 'confident-slide':
      return { x: track([{ at: start, value: offset.x }, { at: end, value: 0, ease: 'expo-out' }]), y: track([{ at: start, value: offset.y }, { at: end, value: 0, ease: 'expo-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.55, value: 1, ease: 'cubic-out' }]) };
    case 'scale-lock':
      return { scaleX: track([{ at: start, value: 0.82 }, { at: start + duration * 0.72, value: 1.06, ease: 'back-out' }, { at: end, value: 1, ease: 'sine-in-out' }]), scaleY: track([{ at: start, value: 0.82 }, { at: start + duration * 0.72, value: 1.06, ease: 'back-out' }, { at: end, value: 1, ease: 'sine-in-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.45, value: 1, ease: 'cubic-out' }]) };
    case 'editorial-wipe':
      return { scaleX: track([{ at: start, value: 0.001 }, { at: end, value: 1, ease: 'cubic-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.15, value: 1 }]) };
    case 'word-cascade':
      return { y: track([{ at: start, value: 36 * intensity }, { at: end, value: 0, ease: 'cubic-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.6, value: 1, ease: 'cubic-out' }]) };
    case 'character-decode':
      return { opacity: track([{ at: start, value: 0.35 }, { at: end, value: 1, ease: 'cubic-out' }]) };
    case 'metric-count':
      return { scaleX: track([{ at: start, value: 0.94 }, { at: end, value: 1, ease: 'cubic-out' }]), scaleY: track([{ at: start, value: 0.94 }, { at: end, value: 1, ease: 'cubic-out' }]) };
    case 'line-route':
      return {};
    case 'camera-push':
      return { scaleX: track([{ at: start, value: 0.92 }, { at: end, value: 1, ease: 'sine-in-out' }]), scaleY: track([{ at: start, value: 0.92 }, { at: end, value: 1, ease: 'sine-in-out' }]) };
    case 'camera-pull':
      return { scaleX: track([{ at: start, value: 1.14 }, { at: end, value: 1, ease: 'sine-in-out' }]), scaleY: track([{ at: start, value: 1.14 }, { at: end, value: 1, ease: 'sine-in-out' }]) };
    case 'ambient-breathe':
      return { scaleX: track([{ at: start, value: 1 }, { at: start + duration / 2, value: 1 + 0.035 * intensity, ease: 'sine-in-out' }, { at: end, value: 1, ease: 'sine-in-out' }]), scaleY: track([{ at: start, value: 1 }, { at: start + duration / 2, value: 1 + 0.035 * intensity, ease: 'sine-in-out' }, { at: end, value: 1, ease: 'sine-in-out' }]) };
    case 'parallax-drift':
      return { x: track([{ at: start, value: -20 * intensity }, { at: end, value: 20 * intensity, ease: 'sine-in-out' }]), y: track([{ at: start, value: 8 * intensity }, { at: end, value: -8 * intensity, ease: 'sine-in-out' }]) };
    case 'kinetic-slam':
      return { scaleX: track([{ at: start, value: 1.55 }, { at: end, value: 1, ease: 'expo-out' }]), scaleY: track([{ at: start, value: 1.55 }, { at: end, value: 1, ease: 'expo-out' }]), rotation: track([{ at: start, value: -4 * intensity }, { at: end, value: 0, ease: 'expo-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.25, value: 1, ease: 'cubic-out' }]) };
    case 'focus-rack':
      return { blur: track([{ at: start, value: 18 * intensity }, { at: end, value: 0, ease: 'sine-in-out' }]), opacity: track([{ at: start, value: 0.6 }, { at: end, value: 1, ease: 'sine-in-out' }]) };
    case 'split-reveal':
      return { scaleX: track([{ at: start, value: 0.001 }, { at: end, value: 1, ease: 'expo-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.25, value: 1 }]) };
    case 'orbit-settle':
      return { x: track([{ at: start, value: 70 * intensity }, { at: start + duration * 0.55, value: -18 * intensity, ease: 'cubic-out' }, { at: end, value: 0, ease: 'sine-in-out' }]), y: track([{ at: start, value: -55 * intensity }, { at: end, value: 0, ease: 'cubic-out' }]), rotation: track([{ at: start, value: 12 * intensity }, { at: end, value: 0, ease: 'cubic-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.45, value: 1 }]) };
    case 'list-stagger':
      return { x: track([{ at: start, value: -45 * intensity }, { at: end, value: 0, ease: 'cubic-out' }]), opacity: track([{ at: start, value: 0 }, { at: end, value: 1, ease: 'cubic-out' }]) };
    case 'slow-dissolve':
      return { opacity: track([{ at: start, value: 0 }, { at: end, value: 1, ease: 'sine-in-out' }]), blur: track([{ at: start, value: 8 * intensity }, { at: end, value: 0, ease: 'sine-in-out' }]) };
    case 'glitch-lock':
      return { x: track([{ at: start, value: -18 }, { at: start + duration * 0.22, value: 14 }, { at: start + duration * 0.48, value: -7 }, { at: end, value: 0 }]), opacity: track([{ at: start, value: 0.7 }, { at: end, value: 1, ease: 'cubic-out' }]) };
    case 'hard-register-cut':
      return { opacity: track([{ at: start, value: 0 }, { at: end, value: 1 }]) };
    case 'path-follow':
      return { x: track([{ at: start, value: -80 * intensity }, { at: start + duration * 0.5, value: 25 * intensity, ease: 'sine-in-out' }, { at: end, value: 0, ease: 'cubic-out' }]), y: track([{ at: start, value: 55 * intensity }, { at: start + duration * 0.5, value: -35 * intensity, ease: 'sine-in-out' }, { at: end, value: 0, ease: 'cubic-out' }]), rotation: track([{ at: start, value: -8 }, { at: end, value: 0, ease: 'sine-in-out' }]) };
    case 'panel-stack':
      return { x: track([{ at: start, value: 65 * intensity }, { at: end, value: 0, ease: 'expo-out' }]), y: track([{ at: start, value: 45 * intensity }, { at: end, value: 0, ease: 'expo-out' }]), scaleX: track([{ at: start, value: 0.88 }, { at: end, value: 1, ease: 'cubic-out' }]), scaleY: track([{ at: start, value: 0.88 }, { at: end, value: 1, ease: 'cubic-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.5, value: 1 }]) };
    case 'cursor-confirm':
      return { scaleX: track([{ at: start, value: 1 }, { at: start + duration * 0.62, value: 1 }, { at: start + duration * 0.72, value: 0.82 }, { at: start + duration * 0.84, value: 1.08, ease: 'back-out' }, { at: end, value: 1 }]), scaleY: track([{ at: start, value: 1 }, { at: start + duration * 0.62, value: 1 }, { at: start + duration * 0.72, value: 0.82 }, { at: start + duration * 0.84, value: 1.08, ease: 'back-out' }, { at: end, value: 1 }]) };
    case 'scan-reveal':
      return { opacity: track([{ at: start, value: 0.15 }, { at: end, value: 1, ease: 'linear' }]) };
    case 'depth-assemble':
      return { x: track([{ at: start, value: offset.x * 1.4 }, { at: end, value: 0, ease: 'expo-out' }]), y: track([{ at: start, value: offset.y * 1.4 + 50 }, { at: end, value: 0, ease: 'expo-out' }]), scaleX: track([{ at: start, value: 0.55 }, { at: end, value: 1, ease: 'back-out' }]), scaleY: track([{ at: start, value: 0.55 }, { at: end, value: 1, ease: 'back-out' }]), rotation: track([{ at: start, value: 10 * intensity }, { at: end, value: 0, ease: 'cubic-out' }]), opacity: track([{ at: start, value: 0 }, { at: start + duration * 0.55, value: 1 }]) };
    default:
      throw new GenmotionError('MOTION_RECIPE_UNIMPLEMENTED', `Motion recipe ${id} has no renderer implementation.`);
  }
}

function defaultValue(property: NumericProperty): number {
  return property === 'scaleX' || property === 'scaleY' || property === 'opacity' ? 1 : 0;
}

function compileLayer(layer: Layer): Layer {
  if (layer.motion.length === 0) return layer;
  const transform = { ...layer.transform };
  const claimed = new Set<NumericProperty>();
  for (const directive of layer.motion) {
    const recipe = motionRecipes.find((candidate) => candidate.id === directive.recipe);
    if (!recipe) throw new GenmotionError('MOTION_RECIPE_UNKNOWN', `Unknown motion recipe ${directive.recipe} on ${layer.id}`);
    const tracks = recipeTracks(recipe.id, directive.start, directive.duration, directive.intensity, directive.direction);
    for (const [key, value] of Object.entries(tracks) as Array<[NumericProperty, AnimatedNumber]>) {
      if (claimed.has(key)) throw new GenmotionError('MOTION_PROPERTY_CONFLICT', `${layer.id} has multiple motion recipes controlling ${key}. Split the visual into nested layers or choose one owner.`);
      if (typeof transform[key] !== 'number' || transform[key] !== defaultValue(key)) throw new GenmotionError('MOTION_PROPERTY_CONFLICT', `${layer.id} manually controls ${key} and also assigns it to ${directive.recipe}.`);
      transform[key] = value;
      claimed.add(key);
    }
    const progressTrack = track([{ at: directive.start, value: 0 }, { at: directive.start + directive.duration, value: 1, ease: 'cubic-out' }]);
    if (recipe.id === 'line-route' || recipe.id === 'scan-reveal') {
      if (layer.type !== 'shape') throw new GenmotionError('MOTION_LAYER_MISMATCH', `${recipe.id} requires a shape layer: ${layer.id}`);
      layer = { ...layer, progress: progressTrack };
    }
    if (recipe.id === 'character-decode' || recipe.id === 'word-cascade') {
      if (layer.type !== 'text') throw new GenmotionError('MOTION_LAYER_MISMATCH', `${recipe.id} requires a text layer: ${layer.id}`);
      layer = { ...layer, reveal: recipe.id === 'character-decode' ? 'characters' : 'words', revealProgress: progressTrack };
    }
    if (recipe.id === 'metric-count') {
      if (layer.type !== 'text' || !Number.isFinite(Number(layer.text.replace(/[^0-9.+-]/g, '')))) throw new GenmotionError('MOTION_LAYER_MISMATCH', `metric-count requires a numeric text layer: ${layer.id}`);
      layer = { ...layer, countFrom: layer.countFrom ?? 0, countProgress: progressTrack };
    }
  }
  return { ...layer, transform };
}

export function compileProjectMotions(project: GenmotionProject): GenmotionProject {
  return { ...project, scenes: project.scenes.map((scene) => ({ ...scene, layers: scene.layers.map(compileLayer) })) };
}
