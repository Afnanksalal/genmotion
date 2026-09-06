import type { GenmotionProject } from './schema.js';
import { resolveParameterGraph } from './parameters.js';
import { GenmotionError } from '../errors.js';

/** Active scene-instance paths; traversal is capped independently of response pagination. */
export function compositionUsagePaths(source: GenmotionProject, compositionId: string, offset = 0, limit = 50) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new GenmotionError('QUERY_PAGE_INVALID', 'Usage queries require a nonnegative offset and a limit from 1 to 100.');
  if (source.compositions.filter(composition => composition.id === compositionId).length !== 1) throw new GenmotionError('COMPOSITION_MISSING', 'Usage query requires one unambiguous source composition.');
  const { project, compositionSources } = resolveParameterGraph(source);
  const definitions = new Map(project.compositions.map(composition => [composition.id, composition]));
  const items: Array<{ sceneId: string; instancePath: string[]; sourceCompositionId: string; evaluatedCompositionId: string }> = [];
  let scanned = 0, total = 0, truncated = false;
  const pending: Array<{ sceneId: string; instancePath: string[]; compositionId: string }> = [];
  for (const scene of [...project.scenes].reverse()) for (const layer of [...scene.layers].reverse()) if (layer.type === 'composition') {
    if (pending.length >= 10_000) { truncated = true; continue; }
    pending.push({ sceneId: scene.id, instancePath: [layer.id], compositionId: layer.compositionId });
  }
  while (pending.length) {
    if (scanned >= 10_000) { truncated = true; break; }
    const entry = pending.pop()!; scanned++;
    if (compositionSources[entry.compositionId] === compositionId) {
      if (total >= offset && items.length < limit) items.push({ sceneId: entry.sceneId, instancePath: entry.instancePath, sourceCompositionId: compositionId, evaluatedCompositionId: entry.compositionId });
      total++;
    }
    const definition = definitions.get(entry.compositionId);
    if (!definition) throw new GenmotionError('COMPOSITION_MISSING', 'Resolved usage path references an unavailable definition.');
    for (const layer of [...definition.layers].reverse()) if (layer.type === 'composition') {
      if (entry.instancePath.length >= 128 || pending.length >= 10_000) { truncated = true; continue; }
      pending.push({ sceneId: entry.sceneId, instancePath: [...entry.instancePath, layer.id], compositionId: layer.compositionId });
    }
  }
  return { compositionId, items, offset, total: truncated ? null : total, discovered: total, scanned, truncated,
    nextOffset: offset + items.length < total ? offset + items.length : null,
    scope: 'resolved-scene-instances' as const };
}

export function compositionDependencyGraph(project: GenmotionProject): Record<string, string[]> {
  return Object.fromEntries(project.compositions.map((composition) => [composition.id, [...new Set(composition.layers.filter((layer) => layer.type === 'composition').map((layer) => layer.compositionId))]]));
}

export function compositionUses(project: GenmotionProject, compositionId: string): Array<{ container: 'scene' | 'composition'; containerId: string; layerId: string }> {
  return [
    ...project.scenes.flatMap((scene) => scene.layers.filter((layer) => layer.type === 'composition' && layer.compositionId === compositionId).map((layer) => ({ container: 'scene' as const, containerId: scene.id, layerId: layer.id }))),
    ...project.compositions.flatMap((composition) => composition.layers.filter((layer) => layer.type === 'composition' && layer.compositionId === compositionId).map((layer) => ({ container: 'composition' as const, containerId: composition.id, layerId: layer.id }))),
  ];
}

export function compositionCycles(project: GenmotionProject): string[][] {
  const graph = compositionDependencyGraph(project);
  const cycles = new Map<string, string[]>();
  const visit = (id: string, trail: string[]): void => {
    const repeated = trail.indexOf(id);
    if (repeated >= 0) {
      const cycle = [...trail.slice(repeated), id];
      const canonical = [...cycle.slice(0, -1)].sort().join('|');
      cycles.set(canonical, cycle);
      return;
    }
    for (const next of graph[id] ?? []) visit(next, [...trail, id]);
  };
  for (const id of Object.keys(graph)) visit(id, []);
  return [...cycles.values()];
}
