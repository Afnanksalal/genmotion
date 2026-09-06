import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { GenmotionError } from '../errors.js';
import { parameterValueSchema, type ParameterValue } from './schema.js';

export type ParameterExpression =
  | { literal: ParameterValue }
  | { ref: string }
  | { op: 'if'; condition: ParameterExpression; then: ParameterExpression; else: ParameterExpression }
  | { op: 'get'; value: ParameterExpression; path: Array<string | number> }
  | { op: 'round' | 'floor' | 'ceil' | 'abs' | 'length' | 'upper' | 'lower' | 'string' | 'not'; value: ParameterExpression }
  | { op: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo' | 'min' | 'max' | 'concat' | 'and' | 'or' | 'equal' | 'less' | 'greater' | 'clamp'; args: ParameterExpression[] };

const inner: z.ZodType<ParameterExpression> = z.lazy(() => z.union([
  z.object({ literal: parameterValueSchema }).strict(),
  z.object({ ref: z.string().min(1).max(200) }).strict(),
  z.object({ op: z.literal('if'), condition: inner, then: inner, else: inner }).strict(),
  z.object({ op: z.literal('get'), value: inner, path: z.array(z.union([z.string().min(1).refine(key => !['__proto__', 'prototype', 'constructor'].includes(key)), z.number().int().nonnegative()])).min(1).max(32) }).strict(),
  z.object({ op: z.enum(['round', 'floor', 'ceil', 'abs', 'length', 'upper', 'lower', 'string', 'not']), value: inner }).strict(),
  z.object({ op: z.enum(['add', 'subtract', 'multiply', 'divide', 'modulo', 'min', 'max', 'concat', 'and', 'or', 'equal', 'less', 'greater', 'clamp']), args: z.array(inner).min(1).max(128) }).strict(),
]));
/** Bound traversal before recursive schema parsing, including untrusted literal containers. */
export const parameterExpressionSchema = z.preprocess((input, context) => {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }]; let nodes = 0;
  while (queue.length) {
    const entry = queue.pop()!;
    if (++nodes > 4096 || entry.depth > 64) { context.addIssue({ code: 'custom', message: 'Parameter expressions are limited to 4096 values and 64 levels.' }); return z.NEVER; }
    if (entry.value && typeof entry.value === 'object') for (const value of Object.values(entry.value)) queue.push({ value, depth: entry.depth + 1 });
  }
  return input;
}, inner);

/** References in both conditional branches, without interpreting literal object keys as code. */
export function parameterExpressionReferences(input: ParameterExpression): string[] {
  const pending = [parameterExpressionSchema.parse(input)], references = new Set<string>();
  while (pending.length) {
    const node = pending.pop()!;
    if ('ref' in node) references.add(node.ref);
    else if ('literal' in node) continue;
    else if (node.op === 'if') pending.push(node.condition, node.then, node.else);
    else if ('value' in node) pending.push(node.value);
    else pending.push(...node.args);
  }
  return [...references].sort();
}

export function evaluateParameterExpression(input: ParameterExpression, resolve: (id: string) => ParameterValue): ParameterValue {
  const expression = parameterExpressionSchema.parse(input);
  const fail = (message: string): never => { throw new GenmotionError('PARAMETER_EXPRESSION_INVALID', message); };
  const number = (value: ParameterValue): number => typeof value === 'number' && Number.isFinite(value) ? value : fail('Expression requires a finite number.');
  const string = (value: ParameterValue): string => typeof value === 'string' ? value : fail('Expression requires a string.');
  const boolean = (value: ParameterValue): boolean => typeof value === 'boolean' ? value : fail('Expression requires a boolean.');
  let steps = 0, allocatedBytes = 0;
  const bounded = (value: ParameterValue): ParameterValue => {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    allocatedBytes += bytes;
    if (bytes > 1024 * 1024 || allocatedBytes > 8 * 1024 * 1024) return fail('Expression exceeded its value memory budget.');
    return value;
  };
  const visit = (node: ParameterExpression): ParameterValue => {
    if (++steps > 4096) return fail('Expression evaluation exceeded its operation budget.');
    if ('literal' in node) return structuredClone(bounded(node.literal));
    if ('ref' in node) return structuredClone(bounded(resolve(node.ref)));
    if (node.op === 'if') return visit(boolean(visit(node.condition)) ? node.then : node.else);
    if (node.op === 'get') {
      let value = visit(node.value);
      for (const key of node.path) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return fail(`Expression path does not exist: ${node.path.join('.')}`);
        if (Array.isArray(value)) { if (typeof key !== 'number') return fail('Array lookup requires an integer index.'); value = value[key]!; }
        else value = value[String(key)]!;
      }
      return structuredClone(bounded(value));
    }
    if ('value' in node) {
      const value = visit(node.value);
      if (node.op === 'not') return !boolean(value);
      if (node.op === 'length') return typeof value === 'string' || Array.isArray(value) ? value.length : fail('Length requires a string or array.');
      if (node.op === 'upper') return bounded(string(value).toUpperCase());
      if (node.op === 'lower') return bounded(string(value).toLowerCase());
      if (node.op === 'string') return typeof value === 'object' && value !== null ? fail('String conversion accepts scalar values only.') : String(value);
      return Math[node.op](number(value));
    }
    const args = node.args.map(visit);
    const arity = (size: number): void => { if (args.length !== size) fail(`${node.op} requires ${size} operands.`); };
    if (node.op === 'concat') {
      const parts = args.map(string);
      if (parts.reduce((bytes, part) => bytes + Buffer.byteLength(part), 0) > 1024 * 1024) return fail('Concatenation exceeds 1 MiB.');
      return bounded(parts.join(''));
    }
    if (node.op === 'and') return args.map(boolean).every(Boolean);
    if (node.op === 'or') return args.map(boolean).some(Boolean);
    if (node.op === 'equal') { arity(2); return isDeepStrictEqual(args[0], args[1]); }
    const values = args.map(number);
    let result: number | boolean;
    switch (node.op) {
      case 'add': result = values.reduce((a, b) => a + b, 0); break;
      case 'multiply': result = values.reduce((a, b) => a * b, 1); break;
      case 'min': result = Math.min(...values); break;
      case 'max': result = Math.max(...values); break;
      case 'clamp': arity(3); if (values[1]! > values[2]!) return fail('Clamp minimum exceeds maximum.'); result = Math.max(values[1]!, Math.min(values[2]!, values[0]!)); break;
      case 'subtract': arity(2); result = values[0]! - values[1]!; break;
      case 'divide': arity(2); if (values[1] === 0) return fail('Division by zero.'); result = values[0]! / values[1]!; break;
      case 'modulo': arity(2); if (values[1] === 0) return fail('Modulo by zero.'); result = values[0]! % values[1]!; break;
      case 'less': arity(2); result = values[0]! < values[1]!; break;
      case 'greater': arity(2); result = values[0]! > values[1]!; break;
      default: return fail('Unknown parameter expression operation.');
    }
    if (typeof result === 'number' && !Number.isFinite(result)) return fail('Expression produced a nonfinite number.');
    return result;
  };
  const result = visit(expression);
  if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) return fail('Derived parameter exceeds 1 MiB.');
  return parameterValueSchema.parse(result);
}
