import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { GenmotionError } from '../errors.js';

const pointer = z.string().refine((value) => value === '' || value.startsWith('/'), 'Expected an RFC 6901 JSON Pointer');
const addition = z.object({ op: z.literal('add'), path: pointer, value: z.unknown() }).strict();
const replacement = z.object({ op: z.literal('replace'), path: pointer, value: z.unknown() }).strict();
const test = z.object({ op: z.literal('test'), path: pointer, value: z.unknown() }).strict();
const removal = z.object({ op: z.literal('remove'), path: pointer }).strict();
const copy = z.object({ op: z.literal('copy'), from: pointer, path: pointer }).strict();
const move = z.object({ op: z.literal('move'), from: pointer, path: pointer }).strict();
export const patchOperationSchema = z.discriminatedUnion('op', [addition, replacement, test, removal, copy, move]);
export type PatchOperation = z.infer<typeof patchOperationSchema>;

function segments(pointerValue: string): string[] {
  if (pointerValue === '') return [];
  const values = pointerValue.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (values.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) throw new GenmotionError('PATCH_PATH_FORBIDDEN', 'Patch paths may not modify object prototypes.');
  return values;
}

function resolve(root: unknown, pointerValue: string): unknown {
  let value = root;
  for (const segment of segments(pointerValue)) {
    if (Array.isArray(value)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= value.length) throw new GenmotionError('PATCH_PATH_INVALID', `Array index does not exist: ${pointerValue}`);
      value = value[index];
    } else if (typeof value === 'object' && value !== null && Object.hasOwn(value, segment)) value = (value as Record<string, unknown>)[segment];
    else throw new GenmotionError('PATCH_PATH_INVALID', `Path does not exist: ${pointerValue}`);
  }
  return value;
}

function parent(root: unknown, pointerValue: string): { container: unknown[] | Record<string, unknown>; key: string } {
  const parts = segments(pointerValue);
  const key = parts.pop();
  if (key === undefined) throw new GenmotionError('PATCH_ROOT_UNSUPPORTED', 'Replace the complete document with genmotion_project_save.');
  const container = resolve(root, parts.length ? `/${parts.map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}` : '');
  if (typeof container !== 'object' || container === null) throw new GenmotionError('PATCH_PATH_INVALID', `Parent is not a container: ${pointerValue}`);
  return { container: container as unknown[] | Record<string, unknown>, key };
}

function remove(root: unknown, pointerValue: string): unknown {
  const { container, key } = parent(root, pointerValue);
  if (Array.isArray(container)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= container.length) throw new GenmotionError('PATCH_PATH_INVALID', `Array index does not exist: ${pointerValue}`);
    return container.splice(index, 1)[0];
  }
  if (!Object.hasOwn(container, key)) throw new GenmotionError('PATCH_PATH_INVALID', `Path does not exist: ${pointerValue}`);
  const value = container[key];
  delete container[key];
  return value;
}

function add(root: unknown, pointerValue: string, value: unknown, replace = false): void {
  const { container, key } = parent(root, pointerValue);
  if (Array.isArray(container)) {
    const index = key === '-' ? container.length : Number(key);
    if (!Number.isInteger(index) || index < 0 || index > container.length || (replace && index === container.length)) throw new GenmotionError('PATCH_PATH_INVALID', `Invalid array index: ${pointerValue}`);
    if (replace) container[index] = value;
    else container.splice(index, 0, value);
    return;
  }
  if (replace && !Object.hasOwn(container, key)) throw new GenmotionError('PATCH_PATH_INVALID', `Path does not exist: ${pointerValue}`);
  container[key] = value;
}

export function applyPatch<T>(document: T, operations: PatchOperation[]): T {
  const result = structuredClone(document);
  for (const operation of operations) {
    if (operation.op === 'test') {
      if (!isDeepStrictEqual(resolve(result, operation.path), operation.value)) throw new GenmotionError('PATCH_TEST_FAILED', `Patch precondition failed at ${operation.path}`);
    } else if (operation.op === 'remove') remove(result, operation.path);
    else if (operation.op === 'add') add(result, operation.path, structuredClone(operation.value));
    else if (operation.op === 'replace') add(result, operation.path, structuredClone(operation.value), true);
    else {
      const value = operation.op === 'move' ? remove(result, operation.from) : structuredClone(resolve(result, operation.from));
      add(result, operation.path, value);
    }
  }
  return result;
}
