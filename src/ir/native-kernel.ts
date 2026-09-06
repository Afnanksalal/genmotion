import { z } from 'zod';

export type KernelChannel = 'r' | 'g' | 'b' | 'a';
export type KernelVariable = KernelChannel | 'x' | 'y' | 'time' | 'width' | 'height';
export type KernelExpression =
  | { op: 'constant'; value: number }
  | { op: 'input'; name: KernelVariable }
  | { op: 'uniform'; name: string }
  | { op: 'sample'; x: KernelExpression; y: KernelExpression; channel: KernelChannel; edge?: 'clamp' | 'repeat' | 'transparent' }
  | { op: 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max' | 'pow' | 'atan2' | 'step' | 'noise'; args: [KernelExpression, KernelExpression] }
  | { op: 'abs' | 'sin' | 'cos' | 'floor' | 'ceil' | 'fract' | 'sqrt' | 'negate'; args: [KernelExpression] }
  | { op: 'clamp' | 'mix' | 'smoothstep'; args: [KernelExpression, KernelExpression, KernelExpression] };
export interface NativeKernel { version: 1; name: string; uniforms: Record<string, number>; rgba: [KernelExpression, KernelExpression, KernelExpression, KernelExpression] }
const arities: Record<string, number> = { add: 2, subtract: 2, multiply: 2, divide: 2, min: 2, max: 2, pow: 2, atan2: 2, step: 2, noise: 2, abs: 1, sin: 1, cos: 1, floor: 1, ceil: 1, fract: 1, sqrt: 1, negate: 1, clamp: 3, mix: 3, smoothstep: 3 };
const channels = ['r', 'g', 'b', 'a'];
const variables = [...channels, 'x', 'y', 'time', 'width', 'height'];
const name = z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).refine((value) => !['constructor', 'prototype', '__proto__'].includes(value), 'Unsafe uniform name');

/** Iterative validation bounds depth before constructing a recursive executable graph. */
export const nativeKernelSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(128),
  uniforms: z.record(name, z.number().finite().min(-1e9).max(1e9)).default({}).refine((value) => Object.keys(value).length <= 32, 'At most 32 uniforms'),
  rgba: z.array(z.unknown()).length(4),
}).strict().superRefine((kernel, context) => {
  const pending = kernel.rgba.map((value) => ({ value, depth: 0 })); let nodes = 0, samples = 0;
  const invalid = (message: string): void => context.addIssue({ code: 'custom', message });
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > 128 || depth > 16) { invalid('Kernel limit: 128 expression nodes and 16 nested levels'); return; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { invalid('Kernel expressions must be objects'); return; }
    const node = value as Record<string, unknown>, op = node.op;
    if (typeof op !== 'string') { invalid('Kernel operation must be a string'); return; }
    let allowed: string[];
    if (op === 'constant') { allowed = ['op', 'value']; if (typeof node.value !== 'number' || !Number.isFinite(node.value) || Math.abs(node.value) > 1e9) { invalid('Kernel constants must be finite and bounded to ±1e9'); return; } }
    else if (op === 'input') { allowed = ['op', 'name']; if (typeof node.name !== 'string' || !variables.includes(node.name)) { invalid('Unknown kernel input'); return; } }
    else if (op === 'uniform') { allowed = ['op', 'name']; if (typeof node.name !== 'string' || !Object.hasOwn(kernel.uniforms, node.name)) { invalid('Kernel uniform must be declared'); return; } }
    else if (op === 'sample') {
      allowed = ['op', 'x', 'y', 'channel', 'edge']; if (++samples > 8) { invalid('Kernel limit: eight sample expressions'); return; }
      if (typeof node.channel !== 'string' || !channels.includes(node.channel) || (node.edge !== undefined && (typeof node.edge !== 'string' || !['clamp', 'repeat', 'transparent'].includes(node.edge)))) { invalid('Invalid kernel sample channel or edge mode'); return; }
      pending.push({ value: node.x, depth: depth + 1 }, { value: node.y, depth: depth + 1 });
    } else if (Object.hasOwn(arities, op)) {
      allowed = ['op', 'args']; if (!Array.isArray(node.args) || node.args.length !== arities[op]) { invalid('Wrong number of kernel operands'); return; }
      for (const value of node.args) pending.push({ value, depth: depth + 1 });
    } else { invalid('Unknown kernel operation: ' + op); return; }
    if (Object.keys(node).some((key) => !allowed.includes(key))) { invalid('Unknown kernel expression property'); return; }
  }
}).transform((kernel) => kernel as NativeKernel);

export function inspectNativeKernel(input: NativeKernel) {
  const kernel = nativeKernelSchema.parse(input), pending: KernelExpression[] = [...kernel.rgba]; let nodes = 0, samples = 0;
  while (pending.length) { const node = pending.pop()!; nodes += 1; if (node.op === 'sample') { samples += 1; pending.push(node.x, node.y); } else if ('args' in node) pending.push(...node.args); }
  return { name: kernel.name, nodes, textureSamples: samples, uniforms: Object.keys(kernel.uniforms), maxNodeEvaluationsPerPixel: nodes, backend: 'native-cpu', precision: 'rgba8-sdr', executableProjectCode: false };
}
