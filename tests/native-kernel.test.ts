import { describe, expect, it } from 'vitest';
import { nativeKernelSchema, inspectNativeKernel } from '../src/ir/native-kernel.js';
import { runNativeKernel } from '../src/engine/native-kernel.js';

const channel = (name: string) => ({ op: 'input', name });
const constant = (value: number) => ({ op: 'constant', value });
describe('declarative native kernel SDK', () => {
  it('runs identity, uniforms and alpha-aware mixing without executing source code', () => {
    const source = new Uint8ClampedArray([240, 120, 60, 128]);
    const identity = nativeKernelSchema.parse({ version: 1, name: 'Identity', rgba: ['r', 'g', 'b', 'a'].map(channel) });
    expect([...runNativeKernel(source, 1, 1, identity, 0)]).toEqual([...source]);
    const opacity = nativeKernelSchema.parse({ version: 1, name: 'Opacity', uniforms: { opacity: .5 }, rgba: [channel('r'), channel('g'), channel('b'), { op: 'uniform', name: 'opacity' }] });
    expect(runNativeKernel(source, 1, 1, opacity, 0, { opacity: 0 })[3]).toBe(0);
    const mixed = runNativeKernel(source, 1, 1, opacity, 0, { opacity: 0 }, 0, .5);
    expect([...mixed]).toEqual([240, 120, 60, 64]);
    expect(() => runNativeKernel(source, 1, 1, opacity, 0, { typo: 1 })).toThrow(/uniform/);
  });
  it('samples premultiplied colors across transparent pixels', () => {
    const sample = (channel: string) => ({ op: 'sample', x: constant(.5), y: constant(.5), channel, edge: 'clamp' });
    const kernel = nativeKernelSchema.parse({ version: 1, name: 'Center', rgba: ['r', 'g', 'b', 'a'].map(sample) });
    const output = runNativeKernel(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]), 2, 1, kernel, 0);
    expect([...output.subarray(0, 4)]).toEqual([255, 0, 0, 128]);
    expect(inspectNativeKernel(kernel).textureSamples).toBe(4);
  });
  it('rejects executable fields, excessive depth, undefined uniforms and coercible inputs', () => {
    const graph = (expression: unknown) => ({ version: 1, name: 'Invalid', rgba: [expression, constant(0), constant(0), constant(1)] });
    expect(nativeKernelSchema.safeParse(graph({ op: 'eval', code: 'process.exit()' })).success).toBe(false);
    expect(nativeKernelSchema.safeParse(graph({ op: 'uniform', name: 'missing' })).success).toBe(false);
    expect(nativeKernelSchema.safeParse(graph({ op: 'input', name: ['r'] })).success).toBe(false);
    let node: unknown = constant(1); for (let index = 0; index < 100; index += 1) node = { op: 'sin', args: [node] };
    expect(nativeKernelSchema.safeParse(graph(node)).success).toBe(false);
  });
  it('defines invalid arithmetic as zero and deterministic noise at seek time', () => {
    const kernel = nativeKernelSchema.parse({ version: 1, name: 'Arithmetic', rgba: [{ op: 'divide', args: [constant(1), constant(0)] }, { op: 'sqrt', args: [constant(-1)] }, { op: 'noise', args: [channel('x'), channel('time')] }, constant(1)] });
    const source = new Uint8ClampedArray(16), first = runNativeKernel(source, 2, 2, kernel, .25, {}, 41);
    expect(first[0]).toBe(0); expect(first[1]).toBe(0); expect(first[3]).toBe(255);
    expect([...runNativeKernel(source, 2, 2, kernel, .25, {}, 41)]).toEqual([...first]);
  });
});
