import type { GenmotionProject, Parameter, ParameterValue } from './schema.js';

/** Includes inactive parameter variants and definition-local assets for safe inventory/deletion. */
export function projectAssetReferences(project: GenmotionProject): string[] {
  const files: string[] = [], add = (file: string | undefined): void => { if (file) files.push(file); };
  const parameter = (definition: Parameter, value: ParameterValue | undefined): void => {
    if (value === undefined || value === null) return;
    if (['file', 'asset', 'font'].includes(definition.type) && typeof value === 'string') add(value);
    if (definition.type === 'array' && definition.items && Array.isArray(value)) for (const item of value) parameter(definition.items, item);
    if (definition.type === 'object' && definition.properties && typeof value === 'object' && !Array.isArray(value)) for (const [key, child] of Object.entries(definition.properties)) parameter(child, value[key] ?? child.default);
  };
  const defaults = (definition: Parameter): void => { parameter(definition, definition.default); for (const child of Object.values(definition.properties ?? {})) defaults(child); if (definition.items) defaults(definition.items); };
  for (const font of project.brand.fonts) add(font.file);
  for (const audio of project.audio) add(audio.src);
  for (const definition of project.parameters) {
    defaults(definition); parameter(definition, project.parameterValues[definition.id]);
    for (const variant of project.variants) parameter(definition, variant.values[definition.id]);
  }
  for (const container of [...project.scenes, ...project.compositions]) {
    if ('parameters' in container) for (const definition of container.parameters ?? []) defaults(definition);
    for (const effect of [...(container.effects ?? []), ...container.layers.flatMap((layer) => layer.effects ?? [])]) add(effect.lut?.source?.path);
    for (const layer of container.layers) {
      if (layer.type === 'image' || layer.type === 'video') add(layer.src);
      if (layer.type === 'image' && layer.sourceAnimation?.type === 'sequence') layer.sourceAnimation.frames.forEach(add);
      if (layer.type === 'text' || layer.type === 'caption') add(layer.fontFile);
      if (layer.type === 'composition') for (const definition of project.compositions.find((item) => item.id === layer.compositionId)?.parameters ?? []) parameter(definition, layer.parameterValues?.[definition.id]);
    }
  }
  for (const shot of project.productionWorkflow?.shots ?? []) for (const reference of shot.references) add(reference.path);
  for (const stage of project.productionWorkflow?.stages ?? []) for (const evidence of stage.evidence) add(evidence.path);
  return files;
}
