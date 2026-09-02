import type { GenmotionProject } from './schema.js';

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
