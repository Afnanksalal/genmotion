import type { Layer, LayerConstraint } from '../ir/schema.js';
import { evaluateLayerTracks } from './animation.js';
import { layerBox, type LayerBox } from './geometry.js';
import { staggerDelay } from './procedural.js';
import { evaluateNumber } from './timeline.js';
import { samplePath } from './path.js';

type Anchor = Extract<LayerConstraint, { type: 'anchor-to' }>['ownAnchor'];

export function effectiveLayerStart(layer: Layer): number {
  return layer.start + (layer.stagger ? staggerDelay(layer.stagger) : 0);
}

function anchor(box: LayerBox, name: Anchor): [number, number] {
  const horizontal = name.includes('left') || name === 'left' ? 0 : name.includes('right') || name === 'right' ? 1 : 0.5;
  const vertical = name.startsWith('top') || name === 'top' ? 0 : name.startsWith('bottom') || name === 'bottom' ? 1 : 0.5;
  return [box.x + box.width * horizontal, box.y + box.height * vertical];
}

function materialize(layer: Layer, time: number, seed: number): Layer {
  const evaluated = structuredClone(evaluateLayerTracks(layer, time, seed));
  evaluated.transform.x = evaluateNumber(evaluated.transform.x, time);
  evaluated.transform.y = evaluateNumber(evaluated.transform.y, time);
  evaluated.transform.scaleX = evaluateNumber(evaluated.transform.scaleX, time);
  evaluated.transform.scaleY = evaluateNumber(evaluated.transform.scaleY, time);
  evaluated.transform.rotation = evaluateNumber(evaluated.transform.rotation, time);
  evaluated.transform.opacity = evaluateNumber(evaluated.transform.opacity, time);
  evaluated.transform.blur = evaluateNumber(evaluated.transform.blur, time);
  if (evaluated.followPath) evaluated.followPath.progress = evaluateNumber(evaluated.followPath.progress, time);
  return evaluated;
}

function center(layer: Layer): [number, number] {
  const box = layerBox(layer);
  const pose = layer.followPath ? samplePath(layer.followPath.path, Number(layer.followPath.progress)) : undefined;
  return [box.x + box.width / 2 + Number(layer.transform.x) + (pose?.x ?? 0) + (layer.followPath?.offsetX ?? 0), box.y + box.height / 2 + Number(layer.transform.y) + (pose?.y ?? 0) + (layer.followPath?.offsetY ?? 0)];
}

function moveCenter(layer: Layer, destination: [number, number]): void {
  const current = center(layer);
  layer.transform.x = Number(layer.transform.x) + destination[0] - current[0];
  layer.transform.y = Number(layer.transform.y) + destination[1] - current[1];
}

function transformedBox(layer: Layer): LayerBox {
  const box = layerBox(layer);
  return { ...box, x: box.x + Number(layer.transform.x), y: box.y + Number(layer.transform.y) };
}

export function layerDependencyGraph(layers: Layer[]): Record<string, string[]> {
  return Object.fromEntries(layers.map((layer) => [layer.id, [layer.parentId, ...layer.constraints.map((constraint) => constraint.target)].filter((value): value is string => Boolean(value))]));
}

export function layerDependencyCycles(layers: Layer[]): string[][] {
  const graph = layerDependencyGraph(layers);
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string[]): void => {
    if (visiting.has(id)) { cycles.push([...path.slice(path.indexOf(id)), id]); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph[id] ?? []) visit(dependency, [...path, id]);
    visiting.delete(id); visited.add(id);
  };
  for (const id of Object.keys(graph)) visit(id, []);
  return cycles;
}

export function resolveLayerGraph(layers: Layer[], sceneTime: number, seed = 0): Layer[] {
  const source = new Map(layers.map((layer) => [layer.id, layer]));
  const resolved = new Map<string, Layer>();
  const resolving = new Set<string>();
  const resolve = (id: string): Layer => {
    const cached = resolved.get(id);
    if (cached) return cached;
    const original = source.get(id);
    if (!original) throw new Error(`Layer constraint references unknown layer: ${id}`);
    if (resolving.has(id)) throw new Error(`Layer dependency cycle contains ${id}.`);
    resolving.add(id);
    const localTime = sceneTime - effectiveLayerStart(original);
    const layer = materialize(original, localTime, seed);
    if (layer.parentId) {
      const parent = resolve(layer.parentId);
      const parentCenter = center(parent);
      const childCenter = center(layer);
      const parentBox = layerBox(parent);
      const parentOrigin: [number, number] = [parentBox.x + parentBox.width / 2, parentBox.y + parentBox.height / 2];
      const radians = Number(parent.transform.rotation) * Math.PI / 180;
      const relativeX = (childCenter[0] - parentOrigin[0]) * Number(parent.transform.scaleX);
      const relativeY = (childCenter[1] - parentOrigin[1]) * Number(parent.transform.scaleY);
      moveCenter(layer, [parentCenter[0] + relativeX * Math.cos(radians) - relativeY * Math.sin(radians), parentCenter[1] + relativeX * Math.sin(radians) + relativeY * Math.cos(radians)]);
      layer.transform.rotation = Number(layer.transform.rotation) + Number(parent.transform.rotation);
      layer.transform.scaleX = Number(layer.transform.scaleX) * Number(parent.transform.scaleX);
      layer.transform.scaleY = Number(layer.transform.scaleY) * Number(parent.transform.scaleY);
      layer.transform.opacity = Number(layer.transform.opacity) * Number(parent.transform.opacity);
      layer.visible = layer.visible && parent.visible;
    }
    for (const constraint of layer.constraints) {
      const target = resolve(constraint.target);
      const targetCenter = center(target);
      if (constraint.type === 'follow') moveCenter(layer, [targetCenter[0] + constraint.offsetX, targetCenter[1] + constraint.offsetY]);
      else if (constraint.type === 'look-at') {
        const ownCenter = center(layer);
        layer.transform.rotation = Math.atan2(targetCenter[1] - ownCenter[1], targetCenter[0] - ownCenter[0]) * 180 / Math.PI + constraint.angleOffset;
      } else if (constraint.type === 'maintain-distance') {
        const radians = constraint.angle * Math.PI / 180;
        moveCenter(layer, [targetCenter[0] + Math.cos(radians) * constraint.distance, targetCenter[1] + Math.sin(radians) * constraint.distance]);
      } else {
        const own = anchor(transformedBox(layer), constraint.ownAnchor);
        const targetPoint = anchor(transformedBox(target), constraint.targetAnchor);
        layer.transform.x = Number(layer.transform.x) + targetPoint[0] - own[0] + constraint.offsetX;
        layer.transform.y = Number(layer.transform.y) + targetPoint[1] - own[1] + constraint.offsetY;
      }
    }
    resolving.delete(id); resolved.set(id, layer); return layer;
  };
  return layers.map((layer) => resolve(layer.id));
}
