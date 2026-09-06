import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { projectSchema, type GenmotionProject } from './schema.js';

export const reconciliationResolutionSchema = z.object({ path: z.array(z.string()), choice: z.enum(['current', 'proposed']) }).strict();
export type ReconciliationResolution = z.infer<typeof reconciliationResolutionSchema>;
export interface ReconciliationConflict { path: string[]; kind: 'value' | 'delete-edit' | 'order'; base: unknown; current: unknown; proposed: unknown; baseExists: boolean; currentExists: boolean; proposedExists: boolean }
export interface ReconciliationResult { project?: GenmotionProject; conflicts: ReconciliationConflict[] }
const missing = Symbol('missing');
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const identityArray = (value: unknown[]): value is Array<Record<string, unknown> & { id: string }> => value.every(item => record(item) && typeof item.id === 'string') && new Set(value.map(item => (item as { id: string }).id)).size === value.length;

/** Three-way merge. ID-bearing arrays merge by identity; positional arrays conflict as a unit.
 * Conflict paths use @id segments inside identity arrays and @order for their ordering.
 * Unresolved conflicts never return a persistable project. */
export function reconcileProjects(baseInput: GenmotionProject, currentInput: GenmotionProject, proposedInput: GenmotionProject, input: ReconciliationResolution[] = []): ReconciliationResult {
  const base = projectSchema.parse(baseInput), current = projectSchema.parse(currentInput), proposed = projectSchema.parse(proposedInput);
  const resolutions = new Map<string, ReconciliationResolution['choice']>();
  for (const resolution of reconciliationResolutionSchema.array().max(1000).parse(input)) {
    const key = JSON.stringify(resolution.path);
    if (resolutions.has(key)) throw new GenmotionError('RECONCILIATION_DUPLICATE_RESOLUTION', 'Each conflict path can have only one resolution.');
    resolutions.set(key, resolution.choice);
  }
  const used = new Set<string>(), conflicts: ReconciliationConflict[] = [];
  const conflict = (before: unknown, left: unknown, right: unknown, path: string[], kind: ReconciliationConflict['kind']): unknown => {
    const key = JSON.stringify(path), choice = resolutions.get(key);
    if (choice) { used.add(key); return choice === 'current' ? left : right; }
    conflicts.push({ path, kind, base: before === missing ? null : structuredClone(before), current: left === missing ? null : structuredClone(left), proposed: right === missing ? null : structuredClone(right), baseExists: before !== missing, currentExists: left !== missing, proposedExists: right !== missing });
    return left;
  };
  const merge = (before: unknown, left: unknown, right: unknown, path: string[]): unknown => {
    if (isDeepStrictEqual(left, right)) return left;
    if (isDeepStrictEqual(before, left)) return right;
    if (isDeepStrictEqual(before, right)) return left;
    if (before === missing || left === missing || right === missing) return conflict(before, left, right, path, left === missing || right === missing ? 'delete-edit' : 'value');
    if (record(before) && record(left) && record(right)) {
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of new Set([...Object.keys(before), ...Object.keys(left), ...Object.keys(right)])) {
        const value = merge(Object.hasOwn(before, key) ? before[key] : missing, Object.hasOwn(left, key) ? left[key] : missing, Object.hasOwn(right, key) ? right[key] : missing, [...path, key]);
        if (value !== missing) result[key] = value;
      }
      return result;
    }
    if (Array.isArray(before) && Array.isArray(left) && Array.isArray(right) && identityArray(before) && identityArray(left) && identityArray(right)) {
      const b = new Map(before.map(item => [item.id, item])), l = new Map(left.map(item => [item.id, item])), r = new Map(right.map(item => [item.id, item]));
      const items = new Map<string, unknown>();
      for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
        const value = merge(b.get(id) ?? missing, l.get(id) ?? missing, r.get(id) ?? missing, [...path, `@${id}`]);
        if (value !== missing) items.set(id, value);
      }
      // Only a changed relative ordering is an instruction. An unchanged side must not
      // veto a reorder. New entries contribute adjacency constraints from their side.
      const ids = [...items.keys()], edges = new Map(ids.map(id => [id, new Set<string>()]));
      const commonBase = before.map(item => item.id).filter(id => items.has(id) && l.has(id) && r.has(id));
      const leftCommon = left.map(item => item.id).filter(id => commonBase.includes(id));
      const rightCommon = right.map(item => item.id).filter(id => commonBase.includes(id));
      const leftChanged = !isDeepStrictEqual(commonBase, leftCommon), rightChanged = !isDeepStrictEqual(commonBase, rightCommon);
      const constrain = (sequence: string[], full: boolean): void => {
        for (let index = 1; index < sequence.length; index++) {
          const previous = sequence[index - 1]!, next = sequence[index]!;
          if (full || !b.has(previous) || !b.has(next)) edges.get(previous)!.add(next);
        }
      };
      constrain(left.map(item => item.id).filter(id => items.has(id)), leftChanged || !rightChanged);
      constrain(right.map(item => item.id).filter(id => items.has(id)), rightChanged || !leftChanged);
      const incoming = new Map(ids.map(id => [id, 0]));
      for (const successors of edges.values()) for (const id of successors) incoming.set(id, incoming.get(id)! + 1);
      const order: string[] = [], remaining = new Set(ids);
      while (remaining.size) {
        const id = ids.find(candidate => remaining.has(candidate) && incoming.get(candidate) === 0);
        if (id === undefined) break;
        remaining.delete(id); order.push(id);
        for (const next of edges.get(id)!) incoming.set(next, incoming.get(next)! - 1);
      }
      if (remaining.size) {
        const chosen = conflict(before.map(item => item.id), left.map(item => item.id), right.map(item => item.id), [...path, '@order'], 'order') as string[];
        // Keep independently added entries even when a caller chooses one side's order.
        return [...chosen.filter(id => items.has(id)), ...ids.filter(id => !chosen.includes(id))].map(id => items.get(id));
      }
      return order.map(id => items.get(id));
    }
    return conflict(before, left, right, path, 'value');
  };
  const merged = merge(base, current, proposed, []);
  for (const key of resolutions.keys()) if (!used.has(key)) throw new GenmotionError('RECONCILIATION_STALE_RESOLUTION', 'A supplied resolution no longer names a conflict.', { path: JSON.parse(key) as string[] });
  return conflicts.length ? { conflicts } : { project: projectSchema.parse(structuredClone(merged)), conflicts };
}
