import { nativeKernelSchema } from './native-kernel.js';
import { imageAnimationSchema } from './image-animation.js';
import { lookupTableSchema } from './lut.js';
import { timelineMarkersSchema, timelineRangesSchema } from './markers.js';
import { z } from 'zod';
import { pathOperationsSchema } from './path-operations.js';
import { audioEffectsSchema, audioNormalizationSchema } from './audio-effects.js';
import { gradientSchema } from './paint.js';
import { productionBriefSchema } from './brief.js';
import { productionWorkflowSchema } from './production.js';

const finite = z.number().finite();
const nonNegative = finite.nonnegative();
const positive = finite.positive();
const color = z.string().regex(/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()/, 'Expected a CSS color');
const identifier = z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const pointSchema = z.tuple([finite, finite]);

export const geometryAnchorSchema = z.object({
  id: identifier,
  x: finite,
  y: finite,
}).strict();

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
  z.object({
    type: z.literal('spring'), mass: positive.default(1), stiffness: positive.default(170), damping: positive.default(26), velocity: finite.default(0),
    duration: positive.optional(), clamp: z.boolean().optional(),
  }).strict(),
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

export const visualEffectTypeSchema = z.enum(['brightness', 'contrast', 'saturation', 'exposure', 'grayscale', 'invert', 'hue', 'sepia', 'tint', 'duotone', 'gamma', 'posterize', 'threshold', 'vignette', 'noise', 'scanlines', 'pixelate', 'dither', 'edge-detect', 'emboss', 'halftone', 'mirror', 'wave', 'twirl', 'bulge', 'kaleidoscope', 'barrel', 'chromatic-aberration', 'chroma-key', 'gaussian-blur', 'directional-blur', 'zoom-blur', 'glow', 'bloom', 'drop-shadow', 'vibrance', 'white-balance', 'shadows-highlights', 'levels', 'channel-mixer', 'curves', 'lift-gamma-gain', 'gradient-map', 'thermal', 'box-blur', 'radial-blur', 'outline', 'inner-shadow', 'lut', 'corner-pin', 'perspective', 'linear-reveal', 'clock-reveal', 'iris-reveal', 'blinds', 'noise-reveal', 'pixel-dissolve', 'luma-reveal', 'scale', 'tile', 'translate', 'skew', 'turbulence', 'custom']);
export function visualEffectParameters(type: z.infer<typeof visualEffectTypeSchema>): string[] {
  const fields = ['amount'];
  if (['glow', 'bloom', 'drop-shadow', 'inner-shadow', 'chroma-key'].includes(type)) fields.push('radius');
  if (['directional-blur', 'drop-shadow', 'inner-shadow', 'chromatic-aberration', 'kaleidoscope'].includes(type)) fields.push('angle');
  if (['wave', 'scanlines'].includes(type)) fields.push('frequency');
  if (type === 'wave') fields.push('speed');
  if (type === 'white-balance') fields.push('temperature', 'tint');
  if (type === 'shadows-highlights') fields.push('shadows', 'highlights');
  if (type === 'levels') fields.push('inputBlack', 'inputWhite', 'outputBlack', 'outputWhite');
  if (['tint', 'duotone', 'chroma-key', 'outline', 'drop-shadow', 'inner-shadow'].includes(type)) fields.push('color');
  if (type === 'duotone') fields.push('secondaryColor');
  if (['twirl', 'bulge', 'kaleidoscope', 'barrel', 'vignette', 'zoom-blur', 'radial-blur'].includes(type)) fields.push('center');
  if (type === 'channel-mixer') fields.push('channelMatrix');
  if (type === 'curves') fields.push('curve');
  if (type === 'lift-gamma-gain') fields.push('lift', 'gamma', 'gain');
  if (type === 'gradient-map') fields.push('gradient');
  if (type === 'noise') fields.push('seed');
  if (type === 'lut') fields.push('lut');
  if (type === 'custom') fields.push('kernel', 'kernelUniforms');
  if (type === 'corner-pin') fields.push('quad');
  if (type === 'perspective') fields.push('angle', 'center');
  if (['linear-reveal', 'clock-reveal', 'iris-reveal', 'blinds', 'noise-reveal', 'luma-reveal'].includes(type)) fields.push('radius');
  if (['linear-reveal', 'clock-reveal', 'blinds', 'translate', 'skew'].includes(type)) fields.push('angle');
  if (['blinds', 'noise-reveal', 'pixel-dissolve', 'turbulence'].includes(type)) fields.push('frequency');
  if (['noise-reveal', 'pixel-dissolve', 'turbulence'].includes(type)) fields.push('seed');
  if (type === 'turbulence') fields.push('speed');
  if (['clock-reveal', 'iris-reveal', 'scale', 'tile', 'skew'].includes(type)) fields.push('center');
  return fields;
}
export const visualEffectSchema = z.object({
  id: identifier, type: visualEffectTypeSchema, enabled: z.boolean().default(true),
  amount: animatedNumberSchema.optional(), radius: animatedNumberSchema.optional(), angle: animatedNumberSchema.optional(),
  frequency: animatedNumberSchema.optional(), speed: animatedNumberSchema.optional(),
  inputBlack: finite.min(0).max(1).optional(), inputWhite: finite.min(0).max(1).optional(), outputBlack: finite.min(0).max(1).optional(), outputWhite: finite.min(0).max(1).optional(),
  temperature: animatedNumberSchema.optional(), tint: animatedNumberSchema.optional(), shadows: animatedNumberSchema.optional(), highlights: animatedNumberSchema.optional(),
  channelMatrix: z.array(finite.min(-8).max(8)).length(12).optional(),
  curve: z.array(z.tuple([finite.min(0).max(1), finite.min(0).max(1)])).min(2).max(256).refine((points) => points.every((point, index) => index === 0 || point[0] > points[index - 1]![0]), 'Curve inputs must increase').optional(),
  lift: z.tuple([finite, finite, finite]).optional(), gamma: z.tuple([positive, positive, positive]).optional(), gain: z.tuple([finite, finite, finite]).optional(),
  kernel: nativeKernelSchema.optional(), kernelUniforms: z.record(z.string(), animatedNumberSchema).optional(),
  gradient: gradientSchema.optional(), lut: lookupTableSchema.optional(),
  quad: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]).optional(),
  center: pointSchema.optional(), color: color.optional(), secondaryColor: color.optional(), seed: z.number().int().optional(),
}).strict().superRefine((effect, context) => {
  const allowed = new Set(['id', 'type', 'enabled', ...visualEffectParameters(effect.type)]);
  if (effect.type === 'custom') {
    if (!effect.kernel) context.addIssue({ code: 'custom', path: ['kernel'], message: 'Custom effects require a validated native kernel' });
    for (const name of Object.keys(effect.kernelUniforms ?? {})) if (!effect.kernel || !Object.hasOwn(effect.kernel.uniforms, name)) context.addIssue({ code: 'custom', path: ['kernelUniforms', name], message: 'Uniform is not declared by the kernel' });
  }
  if (effect.type === 'lut' && !effect.lut) context.addIssue({ code: 'custom', path: ['lut'], message: 'A LUT effect requires a compiled lookup table' });
  for (const [key, value] of Object.entries(effect)) if (value !== undefined && !allowed.has(key)) context.addIssue({ code: 'custom', path: [key], message: `${effect.type} does not support ${key}` });
});
export const visualEffectsSchema = z.array(visualEffectSchema).max(32).refine((effects) => new Set(effects.map((effect) => effect.id)).size === effects.length, 'Visual effect IDs must be unique within a stack');
export const layerMaskSchema = z.object({
  id: identifier, enabled: z.boolean().default(true),
  path: z.union([z.string().min(1).max(10_000_000), z.object({ keyframes: z.array(z.object({ at: nonNegative, value: z.string().min(1).max(10_000_000), ease: easingSchema.default('linear') }).strict()).min(1).max(4096) }).strict()]),
  mode: z.enum(['add', 'subtract', 'intersect', 'exclude']).default('add'),
  inverted: z.boolean().default(false), fillRule: z.enum(['nonzero', 'evenodd']).default('nonzero'),
  opacity: animatedNumberSchema.default(1), feather: animatedNumberSchema.default(0), expansion: animatedNumberSchema.default(0),
}).strict();
export const layerMasksSchema = z.array(layerMaskSchema).max(32).refine((masks) => new Set(masks.map((mask) => mask.id)).size === masks.length, 'Mask IDs must be unique within a layer');

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
  'trimStart', 'playbackRate', 'volume', 'sourceFrame', 'crop.x', 'crop.y', 'crop.width', 'crop.height', 'border.width',
  'color', 'fill', 'stroke', 'background', 'highlightColor', 'outlineColor',
  'control1', 'control2',
  'transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY',
  'transform.rotation', 'transform.opacity', 'transform.blur',
  'shadow.blur', 'shadow.offsetX', 'shadow.offsetY',
  'shadow.color',
  'followPath.progress',
  'path', 'innerRadius', 'startAngle', 'endAngle', 'headSize', 'turns',
  'gradientFill', 'gradientStroke',
]);

export const animationValueSchema = z.union([
  finite,
  color,
  z.string().max(10_000_000).regex(/^\s*[Mm]/, 'Expected SVG path data'),
  gradientSchema,
  z.tuple([finite, finite]),
  z.tuple([finite, finite, finite, finite]),
]);

export const animationKeyframeSchema = z.object({
  at: nonNegative,
  value: animationValueSchema,
  ease: easingSchema.default('linear'),
  hold: z.boolean().optional(),
}).strict();

export const extrapolationSchema = z.enum(['clamp', 'extend', 'wrap', 'identity', 'loop', 'ping-pong']);

export const proceduralNoiseSchema = z.object({
  seed: z.number().int().default(0),
  amplitude: positive,
  frequency: positive.default(1),
  octaves: z.number().int().min(1).max(8).default(1),
  lacunarity: positive.default(2),
  gain: finite.min(0).max(1).default(0.5),
}).strict();

export const animationTrackSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  target: animationTargetSchema,
  keyframes: z.array(animationKeyframeSchema).min(2),
  operation: z.enum(['replace', 'add', 'multiply']).default('replace'),
  extrapolate: extrapolationSchema.default('clamp'),
  extrapolateLeft: extrapolationSchema.optional(),
  extrapolateRight: extrapolationSchema.optional(),
  interpolation: z.enum(['linear', 'shortest-angle', 'discrete', 'path']).optional(),
  noise: proceduralNoiseSchema.optional(),
  enabled: z.boolean().default(true),
  group: identifier.optional(),
  solo: z.boolean().optional(),
  locked: z.boolean().optional(),
}).strict();

export const trackGroupSchema = z.object({ id: identifier, muted: z.boolean().optional(), solo: z.boolean().optional(), locked: z.boolean().optional() }).strict();
export const propertyLinkSchema = z.object({ target: animationTargetSchema, sourceLayerId: identifier, sourceProperty: animationTargetSchema, scale: finite.default(1), offset: finite.default(0), enabled: z.boolean().default(true) }).strict();

export const layerConstraintSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('follow'), target: identifier, offsetX: finite.default(0), offsetY: finite.default(0) }).strict(),
  z.object({ type: z.literal('look-at'), target: identifier, angleOffset: finite.default(0) }).strict(),
  z.object({ type: z.literal('maintain-distance'), target: identifier, distance: nonNegative, angle: finite.default(0) }).strict(),
  z.object({
    type: z.literal('anchor-to'), target: identifier,
    ownAnchor: z.enum(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']).default('center'),
    targetAnchor: z.enum(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']).default('center'),
    offsetX: finite.default(0), offsetY: finite.default(0),
  }).strict(),
]);

export const staggerSchema = z.object({
  index: z.number().int().nonnegative(),
  count: z.number().int().positive().max(100_000),
  each: nonNegative.default(0.08),
  from: z.enum(['start', 'end', 'center', 'edges', 'random', 'distance']).default('start'),
  position: pointSchema.optional(),
  origin: pointSchema.optional(),
  distanceUnit: positive.optional(),
  delay: nonNegative.optional(),
  seed: z.number().int().default(0),
  trail: nonNegative.default(0),
}).strict().refine((value) => value.index < value.count, { message: 'Stagger index must be smaller than count.' });

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
  trackGroups: z.array(trackGroupSchema).max(256).optional(),
  propertyLinks: z.array(propertyLinkSchema).max(256).optional(),
  effects: visualEffectsSchema.optional(),
  masks: layerMasksSchema.optional(),
  parentId: identifier.optional(),
  constraints: z.array(layerConstraintSchema).default([]),
  stagger: staggerSchema.optional(),
  bindings: z.record(z.string(), identifier).default({}),
  followPath: z.object({
    path: z.string().min(1),
    progress: animatedNumberSchema.default(0),
    orient: z.boolean().default(true),
    offsetX: finite.default(0),
    offsetY: finite.default(0),
  }).strict().optional(),
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
  gradientFill: gradientSchema.optional(),
  align: z.enum(['left', 'center', 'right']).default('left'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  lineHeight: positive.default(1.15),
  letterSpacing: finite.default(0),
  maxLines: z.number().int().positive().optional(),
  fit: z.enum(['none', 'shrink']).default('shrink'),
  minFontSize: positive.optional(),
  maxFontSize: positive.optional(),
  autoSize: z.enum(['none', 'height', 'both']).optional(),
  breakWords: z.boolean().optional(),
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
  shape: z.enum(['rect', 'round-rect', 'ellipse', 'line', 'bezier', 'polygon', 'path', 'arc', 'pie', 'callout', 'arrow', 'star', 'spark', 'heart', 'regular-polygon', 'triangle', 'donut', 'ring', 'spiral', 'waveform', 'line-chart', 'area-chart']),
  x: finite,
  y: finite,
  width: nonNegative,
  height: nonNegative,
  fill: color.optional(),
  gradientFill: gradientSchema.optional(),
  gradientStroke: gradientSchema.optional(),
  stroke: color.optional(),
  strokeWidth: nonNegative.default(0),
  radius: nonNegative.default(0),
  points: z.array(pointSchema).optional(),
  path: z.string().min(1).optional(),
  pathOperations: pathOperationsSchema.optional(),
  sides: z.number().int().min(3).max(256).optional(),
  innerRadius: finite.min(0).max(1).optional(),
  startAngle: finite.optional(),
  endAngle: finite.optional(),
  clockwise: z.boolean().optional(),
  headSize: finite.min(0.01).max(0.99).optional(),
  turns: finite.min(0.1).max(50).optional(),
  samples: z.array(finite).min(2).max(10_000).optional(),
  startAnchor: identifier.optional(),
  endAnchor: identifier.optional(),
  centerAnchor: identifier.optional(),
  control1: pointSchema.optional(),
  control2: pointSchema.optional(),
  progress: animatedNumberSchema.default(1),
  shadow: z.object({ color, blur: nonNegative, offsetX: finite.default(0), offsetY: finite.default(0) }).optional(),
}).refine((shape) => shape.width > 0 || shape.height > 0 || Boolean(shape.endAnchor), { message: 'A shape needs a non-zero width or height, or an anchored endpoint.' })
  .refine((shape) => shape.shape !== 'path' || Boolean(shape.path), { message: 'A path shape requires SVG path data.' })
  .refine((shape) => !shape.pathOperations?.length || shape.shape === 'path', { message: 'Path operations require a path shape.' })
  .refine((shape) => shape.shape !== 'bezier' || Boolean(shape.control1 && shape.control2), { message: 'A bezier shape requires control1 and control2.' })
  .refine((shape) => !shape.centerAnchor || shape.shape === 'ellipse', { message: 'centerAnchor is only valid on ellipse shapes.' })
  .refine((shape) => !(shape.startAnchor || shape.endAnchor) || shape.shape === 'line' || shape.shape === 'bezier', { message: 'startAnchor and endAnchor are only valid on line or bezier shapes.' })
  .refine((shape) => !(shape.control1 || shape.control2) || shape.shape === 'bezier', { message: 'Bezier control points are only valid on bezier shapes.' });

export const mediaCropSchema = z.object({ x: animatedNumberSchema, y: animatedNumberSchema, width: animatedNumberSchema, height: animatedNumberSchema, unit: z.enum(['pixels', 'ratio']).optional() }).strict();
const mediaBorderSchema = z.object({ width: animatedNumberSchema, color }).strict();
export const imageLayerSchema = baseLayerSchema.extend({
  type: z.literal('image'),
  sourceAnimation: imageAnimationSchema.optional(), sourceFrame: animatedNumberSchema.optional(),
  src: z.string().min(1),
  x: finite,
  y: finite,
  width: positive,
  height: positive,
  fit: z.enum(['cover', 'contain', 'fill', 'stretch']).default('cover'),
  radius: nonNegative.default(0),
  crop: mediaCropSchema.optional(),
  cornerRadii: z.tuple([nonNegative, nonNegative, nonNegative, nonNegative]).optional(), border: mediaBorderSchema.optional(),
});

export const videoLayerSchema = baseLayerSchema.extend({
  type: z.literal('video'),
  loop: z.boolean().default(false),
  crop: mediaCropSchema.optional(),
  cornerRadii: z.tuple([nonNegative, nonNegative, nonNegative, nonNegative]).optional(), border: mediaBorderSchema.optional(),
  src: z.string().min(1),
  x: finite,
  y: finite,
  width: positive,
  height: positive,
  fit: z.enum(['cover', 'contain', 'fill', 'stretch']).default('cover'),
  radius: nonNegative.default(0),
  trimStart: nonNegative.default(0),
  playbackRate: positive.default(1),
  volume: finite.min(0).max(2).default(1),
});

export const compositionLayerSchema = baseLayerSchema.extend({
  type: z.literal('composition'),
  compositionId: identifier,
  parameterValues: z.record(z.string(), z.lazy(() => parameterValueSchema)).optional(),
  x: finite,
  y: finite,
  width: positive,
  height: positive,
  timeOffset: finite.default(0),
  timeScale: finite.refine((value) => value !== 0, 'Time scale cannot be zero; use freeze for frame holds').default(1),
  loop: z.boolean().default(false),
  loopMode: z.enum(['repeat', 'ping-pong']).optional(),
  loopCount: z.number().int().positive().optional(),
  trimBefore: nonNegative.optional(),
  trimAfter: nonNegative.optional(),
  timeRemap: animatedNumberSchema.optional(),
  freeze: z.object({ frame: z.number().int().nonnegative(), from: nonNegative.optional(), to: positive.optional() }).strict().refine((value) => value.to === undefined || value.to > (value.from ?? 0), 'Freeze interval must have positive duration').optional(),
  clipToBounds: z.boolean().optional(),
});

export const captionStyleSchema = z.object({ color: color.optional(), highlightColor: color.optional(), background: color.optional(), outlineColor: color.optional(), outlineWidth: nonNegative.optional(), fontSize: positive.optional(), fontWeight: z.union([z.number().int().min(100).max(900), z.enum(['normal', 'bold'])]).optional(), direction: z.enum(['ltr', 'rtl']).optional() }).strict();
export const captionCueSchema = z.object({
  id: identifier,
  start: nonNegative,
  end: positive,
  text: z.string().min(1),
  speaker: z.string().min(1).optional(),
  style: captionStyleSchema.optional(),
  words: z.array(z.object({ text: z.string(), start: nonNegative, end: positive, startOffset: z.number().int().nonnegative().optional(), endOffset: z.number().int().nonnegative().optional(), breakBefore: z.boolean().optional() }).strict().refine((word) => word.end > word.start, 'Word end must follow start')).default([]),
}).strict().refine((cue) => cue.end > cue.start, { message: 'Caption cue end must be after start.' });

export const captionLayerSchema = baseLayerSchema.extend({
  type: z.literal('caption'),
  direction: z.enum(['ltr', 'rtl']).default('ltr'), highlightMode: z.enum(['current-word', 'karaoke', 'none']).default('current-word'),
  showSpeaker: z.boolean().default(true), speakerStyles: z.record(z.string().min(1), captionStyleSchema).optional(),
  shadow: z.object({ color, blur: nonNegative, offsetX: finite.default(0), offsetY: finite.default(0) }).optional(),
  x: finite,
  y: finite,
  width: positive,
  height: positive,
  cues: z.array(captionCueSchema).min(1),
  fontFamily: z.string().min(1),
  fontFile: z.string().optional(),
  fontSize: positive,
  fontWeight: z.union([z.number().int().min(100).max(900), z.enum(['normal', 'bold'])]).default(700),
  color,
  highlightColor: color.optional(),
  background: color.optional(),
  outlineColor: color.optional(),
  outlineWidth: nonNegative.default(0),
  radius: nonNegative.default(16),
  padding: nonNegative.default(18),
  align: z.enum(['left', 'center', 'right']).default('center'),
  maxLines: z.number().int().positive().default(2),
  safeArea: z.boolean().default(true),
});

export const adjustmentLayerSchema = baseLayerSchema.extend({
  type: z.literal('adjustment'), x: finite, y: finite, width: positive, height: positive,
  blendMode: z.literal('source-over').default('source-over'),
});

export const layerSchema = z.discriminatedUnion('type', [
  adjustmentLayerSchema,
  textLayerSchema,
  shapeLayerSchema,
  imageLayerSchema,
  videoLayerSchema,
  compositionLayerSchema,
  captionLayerSchema,
]);

export const transitionSchema = z.object({
  type: z.enum(['cut', 'crossfade', 'slide-left', 'slide-right', 'push-up', 'zoom', 'blur']),
  duration: nonNegative.max(3).default(0.4),
  ease: easingSchema.default('cubic-in-out'),
  presentation: z.enum(['cut', 'crossfade', 'slide-left', 'slide-right', 'push-up', 'zoom', 'blur', 'wipe-left', 'wipe-right', 'iris', 'slide-up', 'slide-down', 'wipe-up', 'wipe-down', 'clock', 'flip', 'cube', 'door']).optional(),
  timing: easingSchema.optional(),
  mode: z.enum(['symmetric', 'incoming', 'outgoing']).optional(),
  overlayCompositionId: identifier.optional(),
});

export const compositionSchema = z.object({
  id: identifier,
  parameters: z.array(z.lazy(() => parameterSchema)).optional(),
  fps: z.number().int().min(1).max(120).optional(),
  width: positive,
  height: positive,
  duration: positive,
  background: color.optional(),
  layers: z.array(layerSchema).min(1),
  effects: visualEffectsSchema.optional(),
}).strict();

export type ParameterValue = string | number | boolean | null | ParameterValue[] | { [key: string]: ParameterValue };
export const parameterValueSchema: z.ZodType<ParameterValue> = z.lazy(() => z.preprocess((value, context) => {
  if (value && typeof value === 'object' && Object.keys(value).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))) context.addIssue({ code: 'custom', message: 'Unsafe property' });
  return value;
}, z.union([
  finite, z.boolean(), z.string(), z.null(), z.array(parameterValueSchema),
  z.record(z.string().refine((key) => !['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe property'), parameterValueSchema),
])));

export interface ParameterDefinition {
  id: string;
  label: string;
  type: 'number' | 'boolean' | 'string' | 'color' | 'enum' | 'file' | 'asset' | 'font' | 'dimension' | 'duration' | 'object' | 'array';
  default: ParameterValue;
  optional?: boolean | undefined;
  description?: string | undefined;
  group?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  options?: string[] | undefined;
  properties?: Record<string, ParameterDefinition> | undefined;
  items?: ParameterDefinition | undefined;
}

export const parameterSchema: z.ZodType<ParameterDefinition> = z.lazy(() => z.object({
  id: identifier.refine((id) => !['__proto__', 'prototype', 'constructor'].includes(id), 'Unsafe parameter identifier'),
  label: z.string().min(1),
  type: z.enum(['number', 'boolean', 'string', 'color', 'enum', 'file', 'asset', 'font', 'dimension', 'duration', 'object', 'array']),
  default: parameterValueSchema,
  optional: z.boolean().optional(), description: z.string().optional(), group: z.string().optional(),
  min: finite.optional(), max: finite.optional(), step: positive.optional(),
  minLength: z.number().int().nonnegative().optional(), maxLength: z.number().int().nonnegative().optional(),
  options: z.array(z.string()).min(1).optional(),
  properties: z.record(identifier, parameterSchema).optional(), items: parameterSchema.optional(),
}).strict().superRefine((definition, context) => {
  if (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max) context.addIssue({ code: 'custom', message: 'Minimum exceeds maximum' });
  if (definition.minLength !== undefined && definition.maxLength !== undefined && definition.minLength > definition.maxLength) context.addIssue({ code: 'custom', message: 'Minimum length exceeds maximum length' });
  if (definition.type === 'enum' && !definition.options) context.addIssue({ code: 'custom', message: 'Enum requires options' });
  if (definition.type === 'object' && !definition.properties) context.addIssue({ code: 'custom', message: 'Object requires properties' });
  if (definition.type === 'array' && !definition.items) context.addIssue({ code: 'custom', message: 'Array requires items' });
}));

export const variantSchema = z.object({ id: identifier, label: z.string().min(1), values: z.record(z.string(), parameterValueSchema) }).strict();

export const sceneSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  purpose: z.string().min(1),
  duration: positive,
  background: color,
  layers: z.array(layerSchema).min(1),
  effects: visualEffectsSchema.optional(),
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
  gainDb: finite.min(-96).max(24).optional(),
  playbackRate: finite.min(0.0625).max(16).optional(),
  reverse: z.boolean().optional(),
  preservePitch: z.boolean().optional(),
  effects: audioEffectsSchema.optional(),
  fadeIn: nonNegative.default(0),
  fadeOut: nonNegative.default(0),
  loop: z.boolean().default(false),
  duckUnderVoice: z.boolean().default(false),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false),
  pan: z.number().finite().min(-1).max(1).default(0),
  kind: z.enum(['music', 'voice', 'sfx', 'source']).default('music'),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  productionBrief: productionBriefSchema.optional(),
  productionWorkflow: productionWorkflowSchema.optional(),
  markers: timelineMarkersSchema.optional(), ranges: timelineRangesSchema.optional(),
  width: z.number().int().min(64).max(8192),
  height: z.number().int().min(64).max(8192),
  fps: z.number().int().min(1).max(120),
  seed: z.number().int().default(1),
  anchors: z.array(geometryAnchorSchema).default([]),
  parameters: z.array(parameterSchema).default([]),
  parameterValues: z.record(z.string(), parameterValueSchema).default({}),
  variants: z.array(variantSchema).default([]),
  compositions: z.array(compositionSchema).default([]),
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
  audioNormalization: audioNormalizationSchema.optional(),
  audioDucking: z.object({
    thresholdDb: finite.min(-60).max(0).default(-27.9588),
    ratio: finite.min(1).max(20).default(8),
    attackMs: finite.min(0.01).max(2_000).default(20),
    releaseMs: finite.min(0.01).max(9_000).default(350),
  }).strict().optional(),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type EasingName = z.infer<typeof easingSchema>;
export type AnimationValue = z.infer<typeof animationValueSchema>;
export type AnimationKeyframe = z.infer<typeof animationKeyframeSchema>;
export type Extrapolation = z.infer<typeof extrapolationSchema>;
export type ProceduralNoise = z.infer<typeof proceduralNoiseSchema>;
export type LayerConstraint = z.infer<typeof layerConstraintSchema>;
export type Stagger = z.infer<typeof staggerSchema>;
export type GeometryAnchor = z.infer<typeof geometryAnchorSchema>;
export type AnimatedNumber = z.infer<typeof animatedNumberSchema>;
export type AnimationTrack = z.infer<typeof animationTrackSchema>;
export type VisualEffect = z.infer<typeof visualEffectSchema>;
export type Transform = z.infer<typeof transformSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type ShapeLayer = z.infer<typeof shapeLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type VideoLayer = z.infer<typeof videoLayerSchema>;
export type CompositionLayer = z.infer<typeof compositionLayerSchema>;
export type CaptionLayer = z.infer<typeof captionLayerSchema>;
export type CaptionCue = z.infer<typeof captionCueSchema>;
export type Composition = z.infer<typeof compositionSchema>;
export type Parameter = z.infer<typeof parameterSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type GenmotionProject = z.infer<typeof projectSchema>;

export function projectDuration(project: GenmotionProject): number {
  return project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
}
