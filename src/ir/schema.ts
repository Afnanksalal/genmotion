import { z } from 'zod';

const finite = z.number().finite();
const nonNegative = finite.nonnegative();
const positive = finite.positive();
const color = z.string().regex(/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()/, 'Expected a CSS color');

const namedEasingSchema = z.enum([
  'linear',
  'sine-in', 'sine-out', 'sine-in-out',
  'quad-in', 'quad-out', 'quad-in-out',
  'cubic-in', 'cubic-out', 'cubic-in-out',
  'quart-in', 'quart-out', 'quart-in-out',
  'expo-in', 'expo-out', 'expo-in-out',
  'back-in', 'back-out', 'back-in-out',
]);

export const easingSchema = z.union([
  namedEasingSchema,
  z.object({ type: z.literal('cubic-bezier'), x1: finite.min(0).max(1), y1: finite, x2: finite.min(0).max(1), y2: finite }).strict(),
  z.object({ type: z.literal('spring'), mass: positive.default(1), stiffness: positive.default(170), damping: positive.default(26), velocity: finite.default(0) }).strict(),
]);

export const keyframeSchema = z.object({
  at: nonNegative,
  value: finite,
  ease: easingSchema.default('linear'),
});

export const animatedNumberSchema = z.union([
  finite,
  z.object({
    keyframes: z.array(keyframeSchema).min(1),
  }),
]);

export const DEFAULT_TRANSFORM = {
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, anchorX: 0.5, anchorY: 0.5,
} as const;

export const transformSchema = z.object({
  x: animatedNumberSchema.default(0),
  y: animatedNumberSchema.default(0),
  scaleX: animatedNumberSchema.default(1),
  scaleY: animatedNumberSchema.default(1),
  rotation: animatedNumberSchema.default(0),
  opacity: animatedNumberSchema.default(1),
  blur: animatedNumberSchema.default(0),
  anchorX: finite.min(0).max(1).default(0.5),
  anchorY: finite.min(0).max(1).default(0.5),
});

export const motionDirectiveSchema = z.object({
  recipe: z.string().min(1),
  start: nonNegative.default(0),
  duration: positive,
  intensity: finite.min(0).max(2).default(1),
  direction: z.enum(['left', 'right', 'up', 'down', 'in', 'out']).optional(),
});

export const animationTargetSchema = z.enum([
  'x', 'y', 'width', 'height', 'z', 'fontSize', 'letterSpacing', 'lineHeight',
  'strokeWidth', 'radius', 'progress', 'revealProgress', 'countProgress',
  'trimStart', 'playbackRate', 'volume',
  'transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY',
  'transform.rotation', 'transform.opacity', 'transform.blur',
  'shadow.blur', 'shadow.offsetX', 'shadow.offsetY',
]);

export const animationTrackSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  target: animationTargetSchema,
  keyframes: z.array(keyframeSchema).min(2),
  operation: z.enum(['replace', 'add', 'multiply']).default('replace'),
  extrapolate: z.enum(['clamp', 'loop', 'ping-pong']).default('clamp'),
  enabled: z.boolean().default(true),
}).strict();

const baseLayerSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  start: nonNegative.default(0),
  duration: positive.optional(),
  z: finite.int().default(0),
  visible: z.boolean().default(true),
  transform: transformSchema.default(DEFAULT_TRANSFORM),
  blendMode: z.enum(['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten']).default('source-over'),
  clip: z.object({ x: finite, y: finite, width: positive, height: positive, radius: nonNegative.default(0) }).optional(),
  tags: z.array(z.string()).default([]),
  motion: z.array(motionDirectiveSchema).default([]),
  tracks: z.array(animationTrackSchema).default([]),
});

export const textLayerSchema = baseLayerSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  x: finite,
  y: finite,
  width: positive,
  height: positive,
  fontFamily: z.string().min(1),
  fontFile: z.string().optional(),
  fontSize: positive,
  fontWeight: z.union([z.number().int().min(100).max(900), z.enum(['normal', 'bold'])]).default(400),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  color: color,
  align: z.enum(['left', 'center', 'right']).default('left'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  lineHeight: positive.default(1.15),
  letterSpacing: finite.default(0),
  maxLines: z.number().int().positive().optional(),
  fit: z.enum(['none', 'shrink']).default('shrink'),
  reveal: z.enum(['none', 'words', 'characters', 'lines']).default('none'),
  revealProgress: animatedNumberSchema.default(1),
  countFrom: finite.optional(),
  countProgress: animatedNumberSchema.default(1),
  numberFormat: z.object({
    decimals: z.number().int().min(0).max(6).default(0),
    prefix: z.string().default(''),
    suffix: z.string().default(''),
    grouping: z.boolean().default(true),
  }).optional(),
  shadow: z.object({ color, blur: nonNegative, offsetX: finite.default(0), offsetY: finite.default(0) }).optional(),
});

export const shapeLayerSchema = baseLayerSchema.extend({
  type: z.literal('shape'),
  shape: z.enum(['rect', 'round-rect', 'ellipse', 'line', 'polygon', 'path']),
  x: finite,
  y: finite,
  width: nonNegative,
  height: nonNegative,
  fill: color.optional(),
  stroke: color.optional(),
  strokeWidth: nonNegative.default(0),
  radius: nonNegative.default(0),
  points: z.array(z.tuple([finite, finite])).optional(),
  path: z.string().min(1).optional(),
  progress: animatedNumberSchema.default(1),
  shadow: z.object({ color, blur: nonNegative, offsetX: finite.default(0), offsetY: finite.default(0) }).optional(),
}).refine((shape) => shape.width > 0 || shape.height > 0, { message: 'A shape needs a non-zero width or height.' })
  .refine((shape) => shape.shape !== 'path' || Boolean(shape.path), { message: 'A path shape requires SVG path data.' });

export const imageLayerSchema = baseLayerSchema.extend({
  type: z.literal('image'),
  src: z.string().min(1),
  x: finite,
  y: finite,
  width: positive,
  height: positive,
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  radius: nonNegative.default(0),
  crop: z.object({ x: nonNegative, y: nonNegative, width: positive, height: positive }).optional(),
});

export const videoLayerSchema = baseLayerSchema.extend({
  type: z.literal('video'),
  src: z.string().min(1),
  x: finite,
  y: finite,
  width: positive,
  height: positive,
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  radius: nonNegative.default(0),
  trimStart: nonNegative.default(0),
  playbackRate: positive.default(1),
  volume: finite.min(0).max(2).default(1),
});

export const layerSchema = z.discriminatedUnion('type', [
  textLayerSchema,
  shapeLayerSchema,
  imageLayerSchema,
  videoLayerSchema,
]);

export const transitionSchema = z.object({
  type: z.enum(['cut', 'crossfade', 'slide-left', 'slide-right', 'push-up', 'zoom', 'blur']),
  duration: nonNegative.max(3).default(0.4),
  ease: easingSchema.default('cubic-in-out'),
});

export const sceneSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  purpose: z.string().min(1),
  duration: positive,
  background: color,
  layers: z.array(layerSchema).min(1),
  transitionIn: transitionSchema.default({ type: 'cut', duration: 0, ease: 'linear' }),
  transitionOut: transitionSchema.default({ type: 'cut', duration: 0, ease: 'linear' }),
  referenceDecisions: z.array(z.object({
    referenceId: z.string().min(1),
    borrow: z.array(z.string()).default([]),
    avoid: z.array(z.string()).default([]),
    transform: z.array(z.string()).default([]),
  })).default([]),
  notes: z.array(z.string()).default([]),
});

export const audioTrackSchema = z.object({
  id: z.string().min(1),
  src: z.string().min(1),
  start: nonNegative.default(0),
  trimStart: nonNegative.default(0),
  duration: positive.optional(),
  volume: finite.min(0).max(2).default(1),
  fadeIn: nonNegative.default(0),
  fadeOut: nonNegative.default(0),
  loop: z.boolean().default(false),
  duckUnderVoice: z.boolean().default(false),
  kind: z.enum(['music', 'voice', 'sfx', 'source']).default('music'),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  width: z.number().int().min(64).max(8192),
  height: z.number().int().min(64).max(8192),
  fps: z.number().int().min(1).max(120),
  seed: z.number().int().default(1),
  brand: z.object({
    background: color,
    foreground: color,
    accent: color,
    muted: color,
    fonts: z.array(z.object({ family: z.string().min(1), file: z.string().min(1) })).default([]),
    radius: nonNegative.default(20),
    tone: z.array(z.string()).default([]),
  }),
  scenes: z.array(sceneSchema).min(1),
  audio: z.array(audioTrackSchema).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type EasingName = z.infer<typeof easingSchema>;
export type AnimatedNumber = z.infer<typeof animatedNumberSchema>;
export type AnimationTrack = z.infer<typeof animationTrackSchema>;
export type Transform = z.infer<typeof transformSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type ShapeLayer = z.infer<typeof shapeLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type VideoLayer = z.infer<typeof videoLayerSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type GenmotionProject = z.infer<typeof projectSchema>;

export function projectDuration(project: GenmotionProject): number {
  return project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
}
