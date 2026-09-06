import { z } from 'zod';
import { easingSchema, type EasingName, type GenmotionProject } from './schema.js';
import { inspectEditTarget } from './edit.js';
import { commitProject, type ProjectCommitOptions, type ProjectCommitReceipt } from './store.js';
import { GenmotionError } from '../errors.js';

export const easingAddressSchema = z.object({ kind: z.enum(['scene', 'composition']), id: z.string().min(1), layerId: z.string().min(1).optional(), path: z.array(z.string().min(1)).min(1).max(12) }).strict();
export type EasingAddress = z.infer<typeof easingAddressSchema>;

function slot(project: GenmotionProject, input: EasingAddress): { parent: Record<string, unknown>; key: string } {
  const address = easingAddressSchema.parse(input);
  if (!['ease', 'timing'].includes(address.path.at(-1)!)) throw new GenmotionError('EASING_TARGET_INVALID', 'Easing edits must address an ease or timing property.');
  if (address.path.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) throw new GenmotionError('EASING_TARGET_INVALID', 'Unsafe easing property path.');
  const containers = address.kind === 'scene' ? project.scenes : project.compositions;
  const matches = containers.filter((container) => container.id === address.id);
  if (matches.length !== 1) throw new GenmotionError('EDIT_TARGET_MISSING', 'Easing container must resolve uniquely.');
  const container = matches[0]!;
  let target: unknown = container;
  if (address.layerId) {
    inspectEditTarget(project, { kind: address.kind, id: address.id, layerId: address.layerId });
    target = container.layers.find((layer) => layer.id === address.layerId)!;
  }
  for (const part of address.path.slice(0, -1)) {
    if (!target || typeof target !== 'object' || !Object.hasOwn(target, part) || (Array.isArray(target) && !/^(0|[1-9]\d*)$/.test(part))) throw new GenmotionError('EASING_TARGET_INVALID', 'Easing property does not exist.');
    target = (target as Record<string, unknown>)[part];
  }
  if (!target || typeof target !== 'object' || Array.isArray(target)) throw new GenmotionError('EASING_TARGET_INVALID', 'Easing parent must be an object.');
  const parent = target as Record<string, unknown>, key = address.path.at(-1)!;
  if (!Object.hasOwn(parent, key) && !(key === 'timing' && Object.hasOwn(parent, 'ease'))) throw new GenmotionError('EASING_TARGET_INVALID', 'Easing property does not exist.');
  easingSchema.parse(parent[key] ?? parent.ease);
  return { parent, key };
}

export function copyEasing(project: GenmotionProject, address: EasingAddress): EasingName {
  const { parent, key } = slot(project, address);
  return easingSchema.parse(structuredClone(parent[key] ?? parent.ease));
}

export function pasteEasing(project: GenmotionProject, address: EasingAddress, input: EasingName): GenmotionProject {
  const proposed = structuredClone(project);
  const { parent, key } = slot(proposed, address);
  parent[key] = easingSchema.parse(input);
  return proposed;
}

export async function commitEasing(input: string, address: EasingAddress, easing: EasingName, options: Omit<ProjectCommitOptions, 'update'>): Promise<ProjectCommitReceipt> {
  return commitProject(input, { ...options, update: (project) => pasteEasing(project, address, easing) });
}
