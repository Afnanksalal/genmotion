import { compositionLayerSchema, projectSchema, sceneSchema, type GenmotionProject } from '../ir/schema.js';
import { GenmotionError } from '../errors.js';

/** Wrap a resolved composition using its native playback path, without editing source IR. */
export function projectForRenderComposition(project: GenmotionProject, compositionId?: string): GenmotionProject {
  if (compositionId === undefined) return project;
  const matches = project.compositions.filter(composition => composition.id === compositionId), composition = matches[0];
  if (matches.length !== 1 || !composition) throw new GenmotionError('RENDER_COMPOSITION_MISSING', 'Render selection requires one unambiguous resolved composition.');
  const width = Math.ceil(composition.width), height = Math.ceil(composition.height);
  if (!projectSchema.shape.width.safeParse(width).success || !projectSchema.shape.height.safeParse(height).success) throw new GenmotionError('RENDER_COMPOSITION_DIMENSIONS', 'The composition local canvas is outside the supported project canvas dimensions.');
  const result = structuredClone(project);
  result.width = width; result.height = height; result.fps = composition.fps ?? project.fps;
  result.scenes = [sceneSchema.parse({ id: `render-${composition.id}`, purpose: `Isolated composition ${composition.id}`, duration: composition.duration, background: 'rgba(0,0,0,0)', layers: [compositionLayerSchema.parse({ id: 'render-root', type: 'composition', compositionId: composition.id, x: 0, y: 0, width: composition.width, height: composition.height, clipToBounds: true })] })];
  result.audio = []; result.markers = []; result.ranges = [];
  result.parameters = []; result.parameterValues = {}; result.variants = []; result.dataSources = [];
  for (const definition of result.compositions) {
    definition.parameters = []; delete definition.parameterBindings;
    for (const layer of definition.layers) {
      layer.bindings = {};
      if (layer.type === 'composition') { delete layer.parameterValues; delete layer.overrides; }
    }
  }
  delete result.parameterBindings; delete result.productionBrief; delete result.productionWorkflow;
  return projectSchema.parse(result);
}
