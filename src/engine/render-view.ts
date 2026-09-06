import type { GenmotionProject } from '../ir/schema.js';
import { renderGroupSchema } from '../ir/render-selection.js';
import { GenmotionError } from '../errors.js';

export interface RenderView { sceneId: string; layerIds: string[] }

/** Retain the full dependency graph but restrict paint/audio to a parented subtree. */
export function resolveRenderView(project: GenmotionProject, input?: { sceneId: string; layerId: string }): RenderView | undefined {
  if (!input) return undefined;
  const group = renderGroupSchema.parse(input), matches = project.scenes.filter(scene => scene.id === group.sceneId), scene = matches[0];
  if (matches.length !== 1 || !scene) throw new GenmotionError('RENDER_GROUP_MISSING', 'Group scene is missing or ambiguous.');
  const byId = new Map(scene.layers.map(layer => [layer.id, layer]));
  if (byId.size !== scene.layers.length || !byId.has(group.layerId)) throw new GenmotionError('RENDER_GROUP_MISSING', 'Group root is missing or layer identities are ambiguous.');
  const children = new Map<string, string[]>();
  for (const layer of scene.layers) if (layer.parentId) { const siblings = children.get(layer.parentId) ?? []; siblings.push(layer.id); children.set(layer.parentId, siblings); }
  const selected = new Set<string>(), pending = [group.layerId];
  while (pending.length) {
    const id = pending.pop()!;
    if (selected.has(id)) throw new GenmotionError('RENDER_GROUP_CYCLE', 'Selected parent hierarchy contains a cycle.');
    if (selected.size >= 10_000) throw new GenmotionError('RENDER_GROUP_LIMIT', 'Selected group exceeds 10000 layers.');
    selected.add(id);
    for (const child of children.get(id) ?? []) {
      if (pending.length + selected.size >= 10_000) throw new GenmotionError('RENDER_GROUP_LIMIT', 'Selected group exceeds 10000 layers.');
      pending.push(child);
    }
  }
  return { sceneId: scene.id, layerIds: [...selected] };
}
