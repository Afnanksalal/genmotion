import { resolveParameters } from './parameters.js';
import type { GenmotionProject } from './schema.js';

/** Render metadata computed from source without mutating editable defaults or bindings. */
export function projectPreflight(source: GenmotionProject) {
  const project = resolveParameters(source);
  return {
    width: project.width, height: project.height, fps: project.fps, title: project.title,
    outputName: project.outputName ?? project.id,
    duration: project.scenes.reduce((duration, scene) => duration + scene.duration, 0),
    parameterValues: project.parameterValues,
    scenes: Object.fromEntries(project.scenes.map(scene => [scene.id, { duration: scene.duration }])),
    compositions: Object.fromEntries(project.compositions.map(composition => [composition.id, { width: composition.width, height: composition.height, fps: composition.fps ?? project.fps, duration: composition.duration }])),
  };
}
