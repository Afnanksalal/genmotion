import { isDeepStrictEqual } from 'node:util';
import type { PatchOperation } from './patch.js';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const pointer = (path: string, key: string): string => `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
export function documentPointerValue(document: unknown, path: string): { exists: boolean; value?: unknown } {
  if (path === '') return { exists: true, value: document };
  let current = document;
  for (const part of path.slice(1).split('/').map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, part)) return { exists: false };
    current = (current as Record<string, unknown>)[part];
  }
  return { exists: true, value: current };
}

/** Arrays whose identity/order changes are replaced together; stable arrays are diffed by element. */
export function documentDiff(before: unknown, after: unknown): PatchOperation[] {
  const patches: PatchOperation[] = [];
  const visit = (left: unknown, right: unknown, path: string): void => {
    if (isDeepStrictEqual(left, right)) return;
    if (record(left) && record(right)) {
      for (const key of Object.keys(left)) if (!Object.hasOwn(right, key)) patches.push({ op: 'remove', path: pointer(path, key) });
      for (const key of Object.keys(right)) {
        if (!Object.hasOwn(left, key)) patches.push({ op: 'add', path: pointer(path, key), value: structuredClone(right[key]) });
        else visit(left[key], right[key], pointer(path, key));
      }
    } else if (Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => !record(value) || !Object.hasOwn(value, 'id') || (record(right[index]) && value.id === right[index].id))) {
      left.forEach((value, index) => visit(value, right[index], pointer(path, String(index))));
    } else patches.push({ op: 'replace', path, value: structuredClone(right) });
  };
  visit(before, after, '');
  return patches;
}

/** Only scalar replacements can join a continuous gesture; identity/structure changes cannot. */
export function documentGestureSignature(before: unknown, after: unknown): string | undefined {
  const changes = documentDiff(before, after);
  if (!changes.length || changes.some(change => change.op !== 'replace' || !('value' in change) || (typeof change.value === 'object' && change.value !== null))) return undefined;
  const identities: unknown[] = [];
  for (const change of changes) {
    const segments = change.path.slice(1).split('/').map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
    if (segments.some(segment => ['id', 'type', 'compositionId', 'parentId'].includes(segment))) return undefined;
    let current = before;
    const route: unknown[] = [];
    for (const segment of segments) {
      if (record(current) && typeof current.id === 'string') route.push({ id: current.id });
      route.push(segment);
      if (Array.isArray(current)) current = current[Number(segment)];
      else if (record(current)) current = current[segment];
      else return undefined;
    }
    identities.push(route);
  }
  return JSON.stringify(identities);
}
