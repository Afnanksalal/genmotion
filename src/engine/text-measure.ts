import { z } from 'zod';
import type { LoadedProject } from '../ir/loader.js';
import { registerProjectFonts } from './assets.js';
import { resolveLayerGraph } from './constraints.js';
import { measureTextLayer } from './text-layout.js';

export const textMeasureAddressSchema = z.object({
  kind: z.enum(['scene', 'composition']).default('scene'),
  containerId: z.string().min(1), layerId: z.string().min(1), at: z.number().finite().nonnegative().default(0),
}).strict();
export function measureProjectText(loaded: LoadedProject, address: z.input<typeof textMeasureAddressSchema>) {
  const input = textMeasureAddressSchema.parse(address);
  registerProjectFonts(loaded.project, loaded.projectDir);
  const container = (input.kind === 'scene' ? loaded.project.scenes : loaded.project.compositions).find((item) => item.id === input.containerId);
  if (!container) throw new Error('Text measurement container was not found');
  const layer = resolveLayerGraph(container.layers, input.at, loaded.project.seed).find((item) => item.id === input.layerId);
  if (!layer || layer.type !== 'text') throw new Error('Text measurement requires a text layer in the selected container');
  return { address: input, ...measureTextLayer(layer) };
}
