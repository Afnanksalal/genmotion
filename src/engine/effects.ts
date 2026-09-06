import { runNativeKernel } from './native-kernel.js';
import { inspectNativeKernel } from '../ir/native-kernel.js';
import { fractalNoise, revealCoverage } from './fields.js';
import { warpCanvasQuad, perspectiveQuad, type Quad } from './projective.js';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { converter } from 'culori';
import type { VisualEffect } from '../ir/schema.js';
import { visualEffectParameters } from '../ir/schema.js';
import { evaluateNumber } from './timeline.js';
import { seededRandom } from './procedural.js';
import { sampleLookupTable } from './lut.js';

export const visualEffectDefaults: Record<VisualEffect['type'], { amount: number; min: number; max: number; unit: string }> = {
  'linear-reveal': {"amount":0.5,"min":0,"max":1,"unit":"revealed fraction"},
  'clock-reveal': {"amount":0.5,"min":0,"max":1,"unit":"revealed fraction"},
  'iris-reveal': {"amount":0.5,"min":0,"max":1,"unit":"revealed fraction"},
  'blinds': {"amount":0.5,"min":0,"max":1,"unit":"revealed fraction"},
  'noise-reveal': {"amount":0.5,"min":0,"max":1,"unit":"revealed fraction"},
  'pixel-dissolve': {"amount":0.5,"min":0,"max":1,"unit":"revealed fraction"},
  'luma-reveal': {"amount":0.5,"min":0,"max":1,"unit":"revealed fraction"},
  'scale': {"amount":1,"min":0.01,"max":100,"unit":"scale"},
  'tile': {"amount":2,"min":1,"max":100,"unit":"repetitions"},
  'translate': {"amount":16,"min":-4096,"max":4096,"unit":"pixels"},
  'skew': {"amount":0,"min":-85,"max":85,"unit":"horizontal degrees; angle is vertical degrees"},
  'turbulence': {"amount":16,"min":-4096,"max":4096,"unit":"pixels"},
  custom: { amount: 1, min: 0, max: 1, unit: 'mix' },
  'corner-pin': { amount: 1, min: 0, max: 1, unit: 'mix' }, perspective: { amount: 0, min: -89.9, max: 89.9, unit: 'yaw degrees' },
  lut: { amount: 1, min: 0, max: 1, unit: 'intensity' },
  brightness: { amount: 1, min: 0, max: 8, unit: 'multiplier' }, contrast: { amount: 1, min: 0, max: 8, unit: 'multiplier' }, saturation: { amount: 1, min: 0, max: 8, unit: 'multiplier' },
  exposure: { amount: 0, min: -16, max: 16, unit: 'stops' }, grayscale: { amount: 1, min: 0, max: 1, unit: 'mix' }, invert: { amount: 1, min: 0, max: 1, unit: 'mix' }, hue: { amount: 0, min: -3600, max: 3600, unit: 'degrees' },
  sepia: { amount: 1, min: 0, max: 1, unit: 'mix' }, tint: { amount: .5, min: 0, max: 1, unit: 'mix' }, duotone: { amount: 1, min: 0, max: 1, unit: 'mix' }, gamma: { amount: 1, min: .01, max: 10, unit: 'gamma' },
  posterize: { amount: 8, min: 2, max: 256, unit: 'levels' }, threshold: { amount: .5, min: 0, max: 1, unit: 'luminance' }, vignette: { amount: .5, min: 0, max: 1, unit: 'strength' },
  noise: { amount: .1, min: 0, max: 1, unit: 'strength' }, scanlines: { amount: .3, min: 0, max: 1, unit: 'strength' }, pixelate: { amount: 8, min: 1, max: 256, unit: 'pixels' },
  dither: { amount: 4, min: 2, max: 64, unit: 'levels' }, 'edge-detect': { amount: 1, min: 0, max: 8, unit: 'strength' }, emboss: { amount: 1, min: 0, max: 8, unit: 'strength' }, halftone: { amount: 8, min: 2, max: 128, unit: 'cell pixels' },
  mirror: { amount: 0, min: 0, max: 1, unit: '0 horizontal, 1 vertical' }, wave: { amount: 8, min: -512, max: 512, unit: 'pixels' }, twirl: { amount: 1, min: -20, max: 20, unit: 'radians' }, bulge: { amount: .5, min: -.95, max: .95, unit: 'strength' },
  kaleidoscope: { amount: 6, min: 2, max: 64, unit: 'segments' }, barrel: { amount: .1, min: -.95, max: 2, unit: 'strength' }, 'chromatic-aberration': { amount: 3, min: -128, max: 128, unit: 'pixels' },
  'chroma-key': { amount: .15, min: 0, max: 1, unit: 'color distance' }, 'gaussian-blur': { amount: 8, min: 0, max: 256, unit: 'pixels' }, 'directional-blur': { amount: 8, min: 0, max: 256, unit: 'pixels' },
  'zoom-blur': { amount: .1, min: 0, max: 1, unit: 'zoom' }, glow: { amount: .7, min: 0, max: 4, unit: 'intensity' }, bloom: { amount: .7, min: 0, max: 4, unit: 'intensity' }, 'drop-shadow': { amount: .7, min: 0, max: 1, unit: 'opacity' },
  vibrance: { amount: .5, min: -1, max: 2, unit: 'strength' }, 'white-balance': { amount: 1, min: 0, max: 1, unit: 'mix' }, 'shadows-highlights': { amount: 1, min: 0, max: 1, unit: 'mix' }, levels: { amount: 1, min: .01, max: 10, unit: 'gamma' }, 'channel-mixer': { amount: 1, min: 0, max: 1, unit: 'mix' }, curves: { amount: 1, min: 0, max: 1, unit: 'mix' }, 'lift-gamma-gain': { amount: 1, min: 0, max: 1, unit: 'mix' }, 'gradient-map': { amount: 1, min: 0, max: 1, unit: 'mix' }, thermal: { amount: 1, min: 0, max: 1, unit: 'mix' }, 'box-blur': { amount: 8, min: 0, max: 256, unit: 'pixels' }, 'radial-blur': { amount: 10, min: 0, max: 360, unit: 'degrees' }, outline: { amount: 3, min: 0, max: 64, unit: 'pixels' }, 'inner-shadow': { amount: .7, min: 0, max: 1, unit: 'opacity' },
};
const rgb = converter('rgb');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ZERO_IDENTITY = new Set(['custom','translate', 'turbulence','exposure', 'grayscale', 'invert', 'hue', 'sepia', 'tint', 'duotone', 'vignette', 'noise', 'scanlines', 'wave', 'twirl', 'bulge', 'barrel', 'chromatic-aberration', 'gaussian-blur', 'directional-blur', 'zoom-blur', 'radial-blur', 'box-blur', 'glow', 'bloom', 'drop-shadow', 'inner-shadow', 'outline', 'vibrance', 'white-balance', 'shadows-highlights', 'channel-mixer', 'curves', 'lift-gamma-gain', 'gradient-map', 'thermal']);
const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));
const linearChannel = (value: number): number => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const encodedChannel = (value: number): number => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;

export function visualEffectCapabilities(type: VisualEffect['type']) {
  const spatial = ['scale', 'tile', 'translate', 'skew', 'turbulence', 'corner-pin', 'perspective', 'mirror', 'wave', 'twirl', 'bulge', 'kaleidoscope', 'barrel', 'pixelate'].includes(type);
  const native = ['gaussian-blur', 'directional-blur', 'zoom-blur', 'radial-blur', 'glow', 'bloom', 'drop-shadow', 'inner-shadow'].includes(type);
  return {
    type, ...visualEffectDefaults[type], backend: 'native-cpu' as const, precision: 'rgba8-sdr' as const, hdr: false,
    colorSpace: type === 'exposure' ? 'linear-srgb-adjustment-srgb-output' : 'encoded-srgb',
    sampling: spatial ? 'premultiplied-bilinear' : native ? 'native-canvas' : 'pixel',
    alpha: type === 'custom' ? 'kernel-defined' : type === 'chroma-key' || type.endsWith('-reveal') || type === 'blinds' || type === 'pixel-dissolve' ? 'reduces-alpha' : spatial || native || type === 'outline' || type === 'box-blur' ? 'spatial-alpha' : 'preserved',
    parameters: visualEffectParameters(type),
    numericAnimation: visualEffectParameters(type).filter((name) => ['amount', 'radius', 'angle', 'frequency', 'speed', 'temperature', 'tint', 'shadows', 'highlights'].includes(name)),
    estimatedWorkingBuffers: type === 'box-blur' ? 8 : type === 'outline' ? 5 : native ? 6 : 4,
    estimateLimitations: 'RGBA-equivalent buffers; native backend scratch memory and enclosing compositions are additional.',
  };
}
export function estimateEffectStack(effects: VisualEffect[], width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(width * height * 4)) throw new Error('Effect cost requires positive, bounded integer dimensions');
  const passes = effects.filter((effect) => effect.enabled).map((effect) => ({ id: effect.id, ...visualEffectCapabilities(effect.type), ...(effect.kernel ? { kernel: inspectNativeKernel(effect.kernel) } : {}) }));
  return { width, height, passes, estimatedPeakWorkingBytes: width * height * 4 * Math.max(1, ...passes.map((pass) => pass.estimatedWorkingBuffers)), pixelPasses: width * height * passes.length, exactMemoryBound: false };
}
function color(value: string | undefined, fallback: string): [number, number, number] {
  const parsed = rgb(value ?? fallback); if (!parsed) throw new Error('Invalid visual effect color');
  return [parsed.r, parsed.g, parsed.b];
}
function number(effect: VisualEffect, key: 'amount' | 'radius' | 'angle' | 'frequency' | 'speed' | 'temperature' | 'tint' | 'shadows' | 'highlights', time: number, fallback: number): number {
  const value = effect[key] === undefined ? fallback : evaluateNumber(effect[key], time);
  if (!Number.isFinite(value)) throw new Error('Visual effect parameters must evaluate to finite values');
  return value;
}
function sample(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, output: Uint8ClampedArray, offset: number, repeat = false): void {
  const left = Math.floor(x), top = Math.floor(y), fx = x - left, fy = y - top;
  let alpha = 0, r = 0, g = 0, b = 0;
  for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
    const sx = repeat ? ((left + dx) % width + width) % width : left + dx, sy = repeat ? ((top + dy) % height + height) % height : top + dy; if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    const index = (sy * width + sx) * 4, weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * source[index + 3]! / 255;
    alpha += weight; r += source[index]! * weight; g += source[index + 1]! * weight; b += source[index + 2]! * weight;
  }
  output[offset] = alpha ? r / alpha : 0; output[offset + 1] = alpha ? g / alpha : 0; output[offset + 2] = alpha ? b / alpha : 0; output[offset + 3] = alpha * 255;
}

export function applyVisualEffects(input: Canvas, effects: VisualEffect[], time: number, seed = 0): Canvas {
  let canvas = input;
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const descriptor = visualEffectDefaults[effect.type];
    if (!descriptor) throw new Error('Unsupported native visual effect');
    const amount = clamp(number(effect, 'amount', time, descriptor.amount), descriptor.min, descriptor.max);
    if (amount === 0 && ZERO_IDENTITY.has(effect.type)) continue;
    const width = canvas.width, height = canvas.height, radius = clamp(number(effect, 'radius', time, 12), 0, 256), angle = number(effect, 'angle', time, 0) * Math.PI / 180;
    if (effect.type === 'corner-pin' || effect.type === 'perspective') {
      const identity: Quad = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const quad = effect.type === 'perspective' ? perspectiveQuad(width, height, amount, clamp(angle * 180 / Math.PI, -89.9, 89.9), effect.center) : identity.map((point, index) => point.map((value, axis) => value + ((effect.quad?.[index]?.[axis] ?? value) - value) * amount)) as Quad;
      canvas = warpCanvasQuad(canvas, quad); continue;
    }
    const output = createCanvas(width, height), context = output.getContext('2d');
    if (effect.type === 'custom') {
      if (!effect.kernel) throw new Error('Custom effect kernel is missing');
      const uniforms = Object.fromEntries(Object.entries(effect.kernelUniforms ?? {}).map(([name, value]) => [name, evaluateNumber(value, time)]));
      const pixels = context.createImageData(width, height);
      pixels.data.set(runNativeKernel(canvas.getContext('2d').getImageData(0, 0, width, height).data, width, height, effect.kernel, time, uniforms, seed, amount));
      context.putImageData(pixels, 0, 0); canvas = output; continue;
    }
    const centerX = (effect.center?.[0] ?? .5) * width, centerY = (effect.center?.[1] ?? .5) * height;
    if (effect.type === 'levels' && (effect.inputWhite ?? 1) <= (effect.inputBlack ?? 0)) throw new Error('Levels inputWhite must exceed inputBlack');
    if (['gaussian-blur', 'directional-blur', 'zoom-blur', 'radial-blur', 'glow', 'bloom', 'drop-shadow', 'inner-shadow', 'outline'].includes(effect.type)) {
      if (effect.type === 'gaussian-blur') { context.filter = `blur(${amount}px)`; context.drawImage(canvas, 0, 0); }
      else if (effect.type === 'outline') {
        const source = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        const horizontal = new Uint8Array(width * height), radius = Math.ceil(amount), queue = new Int32Array(Math.max(width, height));
        const pixels = context.createImageData(width, height), tint = color(effect.color, '#ffffff');
        // Separable sliding maxima provide a square dilation in linear time.
        for (let y = 0; y < height; y += 1) {
          let head = 0, tail = 0, next = 0;
          for (let x = 0; x < width; x += 1) {
            while (next <= Math.min(width - 1, x + radius)) { const value = source[(y * width + next) * 4 + 3]!; while (tail > head && source[(y * width + queue[tail - 1]!) * 4 + 3]! <= value) tail -= 1; queue[tail++] = next++; }
            while (head < tail && queue[head]! < x - radius) head += 1;
            horizontal[y * width + x] = source[(y * width + queue[head]!) * 4 + 3]!;
          }
        }
        for (let x = 0; x < width; x += 1) {
          let head = 0, tail = 0, next = 0;
          for (let y = 0; y < height; y += 1) {
            while (next <= Math.min(height - 1, y + radius)) { const value = horizontal[next * width + x]!; while (tail > head && horizontal[queue[tail - 1]! * width + x]! <= value) tail -= 1; queue[tail++] = next++; }
            while (head < tail && queue[head]! < y - radius) head += 1;
            const index = (y * width + x) * 4;
            pixels.data[index] = tint[0] * 255; pixels.data[index + 1] = tint[1] * 255; pixels.data[index + 2] = tint[2] * 255; pixels.data[index + 3] = horizontal[queue[head]! * width + x]!;
          }
        }
        context.putImageData(pixels, 0, 0); context.drawImage(canvas, 0, 0);
      }
      else if (effect.type === 'inner-shadow') {
        const inverse = createCanvas(width, height), inverseContext = inverse.getContext('2d');
        inverseContext.fillStyle = effect.color ?? '#000'; inverseContext.fillRect(0, 0, width, height);
        inverseContext.globalCompositeOperation = 'destination-out'; inverseContext.drawImage(canvas, 0, 0);
        context.filter = `blur(${radius}px)`; context.globalAlpha = amount; context.drawImage(inverse, Math.cos(angle) * radius, Math.sin(angle) * radius);
        context.filter = 'none'; context.globalAlpha = 1; context.globalCompositeOperation = 'destination-in'; context.drawImage(canvas, 0, 0);
        context.globalCompositeOperation = 'destination-over'; context.drawImage(canvas, 0, 0);
      }
      else if (effect.type === 'directional-blur' || effect.type === 'zoom-blur' || effect.type === 'radial-blur') {
        context.globalCompositeOperation = 'lighter'; context.globalAlpha = 1 / 24;
        for (let index = 0; index < 24; index += 1) {
          const position = index / 23 - .5; context.save();
          if (effect.type === 'directional-blur') context.translate(Math.cos(angle) * amount * position, Math.sin(angle) * amount * position);
          else { context.translate(centerX, centerY); if (effect.type === 'radial-blur') context.rotate(amount * Math.PI / 180 * position); else context.scale(1 + amount * position, 1 + amount * position); context.translate(-centerX, -centerY); }
          context.drawImage(canvas, 0, 0); context.restore();
        }
      } else {
        let glowSource = canvas;
        if (effect.type === 'bloom') {
          glowSource = createCanvas(width, height); const glowContext = glowSource.getContext('2d');
          const bright = canvas.getContext('2d').getImageData(0, 0, width, height);
          for (let i = 0; i < bright.data.length; i += 4) bright.data[i + 3] = bright.data[i + 3]! * clamp((Math.max(bright.data[i]!, bright.data[i + 1]!, bright.data[i + 2]!) / 255 - .65) / .35);
          glowContext.putImageData(bright, 0, 0);
        }
        if (effect.type === 'drop-shadow') {
          const silhouette = createCanvas(width, height), silhouetteContext = silhouette.getContext('2d');
          silhouetteContext.drawImage(canvas, 0, 0); silhouetteContext.globalCompositeOperation = 'source-in';
          silhouetteContext.fillStyle = effect.color ?? '#000000'; silhouetteContext.fillRect(0, 0, width, height);
          context.filter = `blur(${radius}px)`; context.globalAlpha = amount;
          context.drawImage(silhouette, Math.cos(angle) * radius, Math.sin(angle) * radius);
          context.filter = 'none'; context.globalAlpha = 1; context.drawImage(canvas, 0, 0);
        } else {
          context.filter = `blur(${radius}px)`; context.globalCompositeOperation = 'lighter';
          for (let remaining = amount; remaining > 0; remaining -= 1) { context.globalAlpha = Math.min(1, remaining); context.drawImage(glowSource, 0, 0); }
          context.filter = 'none';
          context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'; context.drawImage(canvas, 0, 0);
        }
      }
      canvas = output; continue;
    }
    const image = canvas.getContext('2d').getImageData(0, 0, width, height), source = image.data;
    const result = context.createImageData(width, height), destination = result.data;
    if (effect.type === 'box-blur') {
      const span = Math.round(amount), divisor = span * 2 + 1, horizontal = new Float32Array(source.length);
      for (let y = 0; y < height; y += 1) for (let channel = 0; channel < 4; channel += 1) {
        const readPremultiplied = (x: number): number => {
          if (x < 0 || x >= width) return 0;
          const index = (y * width + x) * 4;
          return channel === 3 ? source[index + 3]! : source[index + channel]! * source[index + 3]! / 255;
        };
        let sum = 0; for (let x = -span; x <= span; x += 1) sum += readPremultiplied(x);
        for (let x = 0; x < width; x += 1) { horizontal[(y * width + x) * 4 + channel] = sum / divisor; sum += readPremultiplied(x + span + 1) - readPremultiplied(x - span); }
      }
      for (let x = 0; x < width; x += 1) {
        const sums = [0, 0, 0, 0];
        for (let y = 0; y <= Math.min(span, height - 1); y += 1) for (let channel = 0; channel < 4; channel += 1) sums[channel]! += horizontal[(y * width + x) * 4 + channel]!;
        for (let y = 0; y < height; y += 1) {
          const index = (y * width + x) * 4, alpha = sums[3]! / divisor;
          destination[index + 3] = alpha;
          for (let channel = 0; channel < 3; channel += 1) destination[index + channel] = alpha > 0 ? sums[channel]! / divisor * 255 / alpha : 0;
          for (let channel = 0; channel < 4; channel += 1) { if (y + span + 1 < height) sums[channel]! += horizontal[((y + span + 1) * width + x) * 4 + channel]!; if (y - span >= 0) sums[channel]! -= horizontal[((y - span) * width + x) * 4 + channel]!; }
        }
      }
      context.putImageData(result, 0, 0); canvas = output; continue;
    }
    const primary = color(effect.color, effect.type === 'chroma-key' ? '#00ff00' : '#ffffff'), secondary = color(effect.secondaryColor, '#000000');
    const frequency = clamp(number(effect, 'frequency', time, 4), .001, 1000), speed = clamp(number(effect, 'speed', time, 1), -1000, 1000);
    const temperature = clamp(number(effect, 'temperature', time, 0), -1, 1), balanceTint = clamp(number(effect, 'tint', time, 0), -1, 1);
    const shadows = clamp(number(effect, 'shadows', time, 0), -1, 1), highlights = clamp(number(effect, 'highlights', time, 0), -1, 1);
    const curve = effect.curve ?? [[0, 0], [1, 1]];
    const curveValue = (value: number): number => {
      if (value <= curve[0]![0]) return curve[0]![1];
      for (let index = 1; index < curve.length; index += 1) { const next = curve[index]!, previous = curve[index - 1]!; if (value <= next[0]) return previous[1] + (next[1] - previous[1]) * (value - previous[0]) / (next[0] - previous[0]); }
      return curve.at(-1)![1];
    };
    const gradientStops = (effect.gradient?.stops ?? [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }]).map((stop) => ({ offset: stop.offset, rgb: color(stop.color, '#000000') }));
    const mappedColor = (value: number): [number, number, number] => {
      if (value < gradientStops[0]!.offset) return gradientStops[0]!.rgb;
      let low = 0, high = gradientStops.length;
      while (low < high) { const middle = Math.floor((low + high) / 2); if (gradientStops[middle]!.offset <= value) low = middle + 1; else high = middle; }
      if (low >= gradientStops.length) return gradientStops.at(-1)!.rgb;
      const next = gradientStops[low]!, previous = gradientStops[low - 1]!, mix = (value - previous.offset) / (next.offset - previous.offset);
      return previous.rgb.map((component, channel) => component + (next.rgb[channel]! - component) * mix) as [number, number, number];
    };
    const curveTable = effect.type === 'curves' ? Float32Array.from({ length: 256 }, (_, index) => curveValue(index / 255)) : undefined;
    const spatial = ['scale', 'tile', 'translate', 'skew', 'turbulence', 'mirror', 'wave', 'twirl', 'bulge', 'kaleidoscope', 'barrel', 'pixelate'].includes(effect.type);
    const read = (x: number, y: number, channel: number): number => source[(Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4 + channel]! / 255;
    const luma = (x: number, y: number): number => .2126 * read(x, y, 0) + .7152 * read(x, y, 1) + .0722 * read(x, y, 2);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (spatial) {
        let sx = x, sy = y;
        const dx = x - centerX, dy = y - centerY, distance = Math.hypot(dx, dy), extent = Math.max(1, Math.min(width, height) / 2), normalized = distance / extent;
        if (effect.type === 'mirror') { if (amount < .5) sx = width - 1 - x; else sy = height - 1 - y; }
        else if (effect.type === 'pixelate') { const size = Math.max(1, Math.round(amount)); sx = Math.min(width - 1, Math.floor(x / size) * size + size / 2); sy = Math.min(height - 1, Math.floor(y / size) * size + size / 2); }
        else if (effect.type === 'scale') { sx = centerX + dx / amount; sy = centerY + dy / amount; }
        else if (effect.type === 'tile') { sx = ((dx * amount + centerX + .5) % width + width) % width - .5; sy = ((dy * amount + centerY + .5) % height + height) % height - .5; }
        else if (effect.type === 'translate') { sx -= Math.cos(angle) * amount; sy -= Math.sin(angle) * amount; }
        else if (effect.type === 'skew') {
          const horizontal = Math.tan(amount * Math.PI / 180), vertical = Math.tan(clamp(angle, -85 * Math.PI / 180, 85 * Math.PI / 180)), determinant = 1 - horizontal * vertical;
          if (Math.abs(determinant) < 1e-9) continue;
          sx = centerX + (dx - horizontal * dy) / determinant; sy = centerY + (dy - vertical * dx) / determinant;
        }
        else if (effect.type === 'turbulence') {
          const nx = x / width * frequency + time * speed, ny = y / height * frequency, fieldSeed = seed ^ (effect.seed ?? 0);
          sx += (fractalNoise(nx, ny, fieldSeed) * 2 - 1) * amount; sy += (fractalNoise(nx + 37.7, ny + 91.3, fieldSeed ^ 1777) * 2 - 1) * amount;
        }
        else if (effect.type === 'wave') sx += Math.sin(y / height * Math.PI * 2 * frequency + time * speed * Math.PI * 2) * amount;
        else {
          let theta = Math.atan2(dy, dx), scale = 1;
          if (effect.type === 'twirl') theta += amount * Math.max(0, 1 - normalized) ** 2;
          else if (effect.type === 'bulge') scale = normalized < 1 ? Math.max(.01, 1 - amount * (1 - normalized * normalized)) : 1;
          else if (effect.type === 'barrel') scale = 1 + amount * normalized * normalized;
          else if (effect.type === 'kaleidoscope') { const segment = Math.PI * 2 / Math.round(amount); theta = Math.abs(((theta % segment) + segment) % segment - segment / 2) + angle; }
          sx = centerX + Math.cos(theta) * distance * scale; sy = centerY + Math.sin(theta) * distance * scale;
        }
        sample(source, width, height, sx, sy, destination, offset, effect.type === 'tile'); continue;
      }
      let r = source[offset]! / 255, g = source[offset + 1]! / 255, b = source[offset + 2]! / 255, alpha = source[offset + 3]! / 255;
      const luminance = .2126 * r + .7152 * g + .0722 * b;
      switch (effect.type) {
        case 'linear-reveal': case 'clock-reveal': case 'iris-reveal': case 'blinds': case 'noise-reveal': case 'pixel-dissolve': case 'luma-reveal': {
          const nx = (x + .5) / width, ny = (y + .5) / height, cosine = Math.cos(angle), sine = Math.sin(angle), span = Math.abs(cosine) + Math.abs(sine);
          let field = luminance;
          if (effect.type === 'linear-reveal') field = ((nx - .5) * cosine + (ny - .5) * sine) / span + .5;
          else if (effect.type === 'clock-reveal') field = ((Math.atan2(y + .5 - centerY, x + .5 - centerX) + Math.PI / 2 - angle) / (Math.PI * 2) % 1 + 1) % 1;
          else if (effect.type === 'iris-reveal') field = Math.hypot(x + .5 - centerX, y + .5 - centerY) / Math.max(1, Math.hypot(Math.max(Math.abs(centerX), Math.abs(width - centerX)), Math.max(Math.abs(centerY), Math.abs(height - centerY))));
          else if (effect.type === 'blinds') field = (((nx * cosine + ny * sine) * frequency) % 1 + 1) % 1;
          else if (effect.type === 'noise-reveal') field = fractalNoise(nx * frequency, ny * frequency, seed ^ (effect.seed ?? 0));
          else if (effect.type === 'pixel-dissolve') field = seededRandom(seed ^ (effect.seed ?? 0), Math.imul(Math.floor(x / Math.max(1, frequency)), 73856093) ^ Math.imul(Math.floor(y / Math.max(1, frequency)), 19349663));
          alpha *= revealCoverage(field, amount, effect.type === 'pixel-dissolve' ? 0 : radius / Math.max(width, height)); break;
        }
        case 'lut': {
          if (!effect.lut) throw new Error('LUT payload is missing');
          const input: [number, number, number] = effect.lut.inputColorSpace === 'linear-srgb' ? [linearChannel(r), linearChannel(g), linearChannel(b)] : [r, g, b];
          const mapped = sampleLookupTable(effect.lut, input);
          if (effect.lut.outputColorSpace === 'linear-srgb') for (let channel = 0; channel < 3; channel += 1) mapped[channel] = encodedChannel(mapped[channel]!);
          r += (mapped[0] - r) * amount; g += (mapped[1] - g) * amount; b += (mapped[2] - b) * amount; break;
        }
        case 'vibrance': { const chroma = Math.max(r, g, b) - Math.min(r, g, b), strength = amount * (1 - chroma); r += (r - luminance) * strength; g += (g - luminance) * strength; b += (b - luminance) * strength; break; }
        case 'white-balance': r *= 1 + temperature * .3 * amount; b *= 1 - temperature * .3 * amount; g *= 1 - balanceTint * .3 * amount; break;
        case 'shadows-highlights': { const delta = (shadows * (1 - luminance) ** 3 + highlights * luminance ** 3) * amount; r += delta; g += delta; b += delta; break; }
        case 'levels': { const black = effect.inputBlack ?? 0, white = effect.inputWhite ?? 1, outputBlack = effect.outputBlack ?? 0, outputWhite = effect.outputWhite ?? 1; const remap = (value: number): number => outputBlack + clamp((value - black) / (white - black)) ** (1 / amount) * (outputWhite - outputBlack); r = remap(r); g = remap(g); b = remap(b); break; }
        case 'channel-mixer': { const matrix = effect.channelMatrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], rr = r, gg = g, bb = b; r += (matrix[0]! * rr + matrix[1]! * gg + matrix[2]! * bb + matrix[3]! - r) * amount; g += (matrix[4]! * rr + matrix[5]! * gg + matrix[6]! * bb + matrix[7]! - g) * amount; b += (matrix[8]! * rr + matrix[9]! * gg + matrix[10]! * bb + matrix[11]! - b) * amount; break; }
        case 'curves': r += (curveTable![source[offset]!]! - r) * amount; g += (curveTable![source[offset + 1]!]! - g) * amount; b += (curveTable![source[offset + 2]!]! - b) * amount; break;
        case 'lift-gamma-gain': { const adjust = (value: number, channel: number): number => Math.max(0, value + (effect.lift?.[channel] ?? 0) * (1 - value)) ** (1 / (effect.gamma?.[channel] ?? 1)) * (effect.gain?.[channel] ?? 1); r += (adjust(r, 0) - r) * amount; g += (adjust(g, 1) - g) * amount; b += (adjust(b, 2) - b) * amount; break; }
        case 'gradient-map': { const mapped = mappedColor(luminance); r += (mapped[0] - r) * amount; g += (mapped[1] - g) * amount; b += (mapped[2] - b) * amount; break; }
        case 'thermal': { const red = clamp(1.5 - Math.abs(4 * luminance - 3)), green = clamp(1.5 - Math.abs(4 * luminance - 2)), blue = clamp(1.5 - Math.abs(4 * luminance - 1)); r += (red - r) * amount; g += (green - g) * amount; b += (blue - b) * amount; break; }
        case 'brightness': r *= amount; g *= amount; b *= amount; break;
        case 'exposure': r = encodedChannel(linearChannel(r) * 2 ** amount); g = encodedChannel(linearChannel(g) * 2 ** amount); b = encodedChannel(linearChannel(b) * 2 ** amount); break;
        case 'contrast': r = (r - .5) * amount + .5; g = (g - .5) * amount + .5; b = (b - .5) * amount + .5; break;
        case 'saturation': r = luminance + (r - luminance) * amount; g = luminance + (g - luminance) * amount; b = luminance + (b - luminance) * amount; break;
        case 'grayscale': r += (luminance - r) * amount; g += (luminance - g) * amount; b += (luminance - b) * amount; break;
        case 'invert': r += (1 - 2 * r) * amount; g += (1 - 2 * g) * amount; b += (1 - 2 * b) * amount; break;
        case 'gamma': r = r ** (1 / amount); g = g ** (1 / amount); b = b ** (1 / amount); break;
        case 'threshold': r = g = b = luminance >= amount ? 1 : 0; break;
        case 'posterize': { const levels = Math.round(amount) - 1; r = Math.round(r * levels) / levels; g = Math.round(g * levels) / levels; b = Math.round(b * levels) / levels; break; }
        case 'tint': r += (primary[0] - r) * amount; g += (primary[1] - g) * amount; b += (primary[2] - b) * amount; break;
        case 'duotone': r += (secondary[0] + (primary[0] - secondary[0]) * luminance - r) * amount; g += (secondary[1] + (primary[1] - secondary[1]) * luminance - g) * amount; b += (secondary[2] + (primary[2] - secondary[2]) * luminance - b) * amount; break;
        case 'sepia': { const red = .393 * r + .769 * g + .189 * b, green = .349 * r + .686 * g + .168 * b, blue = .272 * r + .534 * g + .131 * b; r += (red - r) * amount; g += (green - g) * amount; b += (blue - b) * amount; break; }
        case 'hue': { const theta = amount * Math.PI / 180, cosine = Math.cos(theta), sine = Math.sin(theta), rr = r, gg = g, bb = b; r = (.213 + cosine * .787 - sine * .213) * rr + (.715 - cosine * .715 - sine * .715) * gg + (.072 - cosine * .072 + sine * .928) * bb; g = (.213 - cosine * .213 + sine * .143) * rr + (.715 + cosine * .285 + sine * .140) * gg + (.072 - cosine * .072 - sine * .283) * bb; b = (.213 - cosine * .213 - sine * .787) * rr + (.715 - cosine * .715 + sine * .715) * gg + (.072 + cosine * .928 + sine * .072) * bb; break; }
        case 'vignette': { const falloff = 1 - amount * clamp(Math.hypot((x - centerX) / (width / 2), (y - centerY) / (height / 2)) / Math.SQRT2) ** 2; r *= falloff; g *= falloff; b *= falloff; break; }
        case 'noise': { const noise = (seededRandom(seed ^ (effect.seed ?? 0), y * width + x) - .5) * amount; r += noise; g += noise; b += noise; break; }
        case 'scanlines': { const gain = 1 - amount * (.5 + .5 * Math.cos(y * Math.PI * frequency / 2)); r *= gain; g *= gain; b *= gain; break; }
        case 'dither': { const matrix = BAYER, levels = Math.round(amount) - 1, bias = (matrix[(y % 4) * 4 + x % 4]! / 16 - .5) / levels; r = Math.round((r + bias) * levels) / levels; g = Math.round((g + bias) * levels) / levels; b = Math.round((b + bias) * levels) / levels; break; }
        case 'edge-detect': case 'emboss': { const horizontal = luma(x + 1, y) - luma(x - 1, y), vertical = luma(x, y + 1) - luma(x, y - 1); r = g = b = effect.type === 'emboss' ? .5 + (horizontal + vertical) * amount : Math.hypot(horizontal, vertical) * amount; break; }
        case 'halftone': { const size = Math.round(amount), localX = (x % size + .5) / size - .5, localY = (y % size + .5) / size - .5, dot = Math.hypot(localX, localY) <= Math.sqrt(1 - luma(Math.floor(x / size) * size + Math.floor(size / 2), Math.floor(y / size) * size + Math.floor(size / 2))) / 2; r = g = b = dot ? 0 : 1; break; }
        case 'chromatic-aberration': r = read(Math.round(x + Math.cos(angle) * amount), Math.round(y + Math.sin(angle) * amount), 0); b = read(Math.round(x - Math.cos(angle) * amount), Math.round(y - Math.sin(angle) * amount), 2); break;
        case 'chroma-key': { const distance = Math.hypot(r - primary[0], g - primary[1], b - primary[2]) / Math.sqrt(3); alpha *= clamp((distance - amount) / Math.max(.001, radius / 256)); break; }
        default: throw new Error('Visual effect has no native pixel implementation');
      }
      destination[offset] = clamp(r) * 255; destination[offset + 1] = clamp(g) * 255; destination[offset + 2] = clamp(b) * 255; destination[offset + 3] = clamp(alpha) * 255;
    }
    context.putImageData(result, 0, 0); canvas = output;
  }
  return canvas;
}
