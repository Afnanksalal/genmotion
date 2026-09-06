import { nativeKernelSchema, inspectNativeKernel, type KernelExpression, type NativeKernel, type KernelChannel } from '../ir/native-kernel.js';
import { valueNoise } from './fields.js';

interface Context { x: number; y: number; time: number; width: number; height: number; r: number; g: number; b: number; a: number; seed: number; source: Uint8ClampedArray; uniforms: Record<string, number> }
type Expression = (context: Context) => number;
const bounded = (value: number): number => Number.isFinite(value) ? Math.max(-1e9, Math.min(1e9, value)) : 0;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

function texture(context: Context, x: number, y: number, channel: KernelChannel, edge: 'clamp' | 'repeat' | 'transparent'): number {
  const sx = x * context.width - .5, sy = y * context.height - .5, left = Math.floor(sx), top = Math.floor(sy), fx = sx - left, fy = sy - top;
  let alpha = 0, value = 0;
  const component = channel === 'r' ? 0 : channel === 'g' ? 1 : channel === 'b' ? 2 : 3;
  for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
    let px = left + dx, py = top + dy;
    if (edge === 'repeat') { px = ((px % context.width) + context.width) % context.width; py = ((py % context.height) + context.height) % context.height; }
    else if (edge === 'clamp') { px = Math.max(0, Math.min(context.width - 1, px)); py = Math.max(0, Math.min(context.height - 1, py)); }
    else if (px < 0 || py < 0 || px >= context.width || py >= context.height) continue;
    const offset = (py * context.width + px) * 4, weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy), a = context.source[offset + 3]! / 255;
    alpha += a * weight; value += context.source[offset + component]! / 255 * a * weight;
  }
  return channel === 'a' ? alpha : alpha ? value / alpha : 0;
}

function compile(node: KernelExpression): Expression {
  if (node.op === 'constant') return () => node.value;
  if (node.op === 'input') return (context) => context[node.name];
  if (node.op === 'uniform') return (context) => context.uniforms[node.name]!;
  if (node.op === 'sample') { const x = compile(node.x), y = compile(node.y); return (context) => texture(context, x(context), y(context), node.channel, node.edge ?? 'transparent'); }
  const operands = node.args.map(compile), a = operands[0]!, b = operands[1], c = operands[2];
  const evaluate: Expression = (context) => {
    const x = a(context), y = b?.(context) ?? 0, z = c?.(context) ?? 0;
    switch (node.op) {
      case 'add': return x + y; case 'subtract': return x - y; case 'multiply': return x * y; case 'divide': return Math.abs(y) < 1e-12 ? 0 : x / y;
      case 'min': return Math.min(x, y); case 'max': return Math.max(x, y); case 'pow': return x < 0 && !Number.isInteger(y) ? 0 : x ** Math.max(-128, Math.min(128, y));
      case 'atan2': return Math.atan2(x, y); case 'step': return y < x ? 0 : 1; case 'noise': return valueNoise(x, y, context.seed);
      case 'abs': return Math.abs(x); case 'sin': return Math.sin(x); case 'cos': return Math.cos(x); case 'floor': return Math.floor(x); case 'ceil': return Math.ceil(x); case 'fract': return x - Math.floor(x); case 'sqrt': return Math.sqrt(Math.max(0, x)); case 'negate': return -x;
      case 'clamp': return Math.max(Math.min(y, z), Math.min(Math.max(y, z), x)); case 'mix': return x + (y - x) * z;
      case 'smoothstep': { const progress = x === y ? (z < x ? 0 : 1) : clamp((z - x) / (y - x)); return progress * progress * (3 - 2 * progress); }
    }
  };
  return (context) => bounded(evaluate(context));
}

const compiledCache = new Map<string, { kernel: NativeKernel; expressions: Expression[]; nodes: number }>();
export function runNativeKernel(source: Uint8ClampedArray, width: number, height: number, input: NativeKernel, time: number, uniforms: Record<string, number> = {}, seed = 0, amount = 1): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || source.length !== width * height * 4 || !Number.isFinite(time) || !Number.isFinite(amount) || !Number.isSafeInteger(seed)) throw new Error('Invalid native kernel surface or time');
  const kernel = nativeKernelSchema.parse(input), key = JSON.stringify(kernel);
  let entry = compiledCache.get(key);
  if (!entry) { entry = { kernel, expressions: kernel.rgba.map(compile), nodes: inspectNativeKernel(kernel).nodes }; if (compiledCache.size >= 16) compiledCache.delete(compiledCache.keys().next().value!); compiledCache.set(key, entry); }
  if (width * height * entry.nodes > 2_000_000_000) throw new Error('Native kernel exceeds the two-billion node-evaluation limit for one frame');
  for (const [name, value] of Object.entries(uniforms)) if (!Object.hasOwn(kernel.uniforms, name) || !Number.isFinite(value) || Math.abs(value) > 1e9) throw new Error('Invalid native kernel uniform: ' + name);
  const output = new Uint8ClampedArray(source.length), mix = clamp(amount), context: Context = { x: 0, y: 0, time: bounded(time), width, height, r: 0, g: 0, b: 0, a: 0, source, seed, uniforms: { ...kernel.uniforms, ...uniforms } };
  const [red, green, blue, alpha] = entry.expressions as [Expression, Expression, Expression, Expression];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    context.x = (x + .5) / width; context.y = (y + .5) / height; context.r = source[offset]! / 255; context.g = source[offset + 1]! / 255; context.b = source[offset + 2]! / 255; context.a = source[offset + 3]! / 255;
    const r = clamp(red(context)), g = clamp(green(context)), b = clamp(blue(context)), a = clamp(alpha(context)), resultAlpha = context.a * (1 - mix) + a * mix;
    output[offset] = resultAlpha ? (context.r * context.a * (1 - mix) + r * a * mix) / resultAlpha * 255 : 0;
    output[offset + 1] = resultAlpha ? (context.g * context.a * (1 - mix) + g * a * mix) / resultAlpha * 255 : 0;
    output[offset + 2] = resultAlpha ? (context.b * context.a * (1 - mix) + b * a * mix) / resultAlpha * 255 : 0;
    output[offset + 3] = resultAlpha * 255;
  }
  return output;
}
