import { z } from 'zod';
import { projectSchema, sceneSchema, compositionSchema, layerSchema, textLayerSchema, shapeLayerSchema, animationTrackSchema, parameterSchema, visualEffectSchema, layerMaskSchema, frozenDataSourceSchema } from './schema.js';
import { audioEffectSchema } from './audio-effects.js';
import { gestureRecordingSchema } from './gesture-recording.js';
import { parameterExpressionSchema } from './expressions.js';
import { semanticEditSchema } from './edit.js';
import { editingQuerySchema } from './query.js';

const schemas = {
  project: projectSchema, scene: sceneSchema, composition: compositionSchema, layer: layerSchema,
  text: textLayerSchema, shape: shapeLayerSchema, track: animationTrackSchema, parameter: parameterSchema,
  effect: visualEffectSchema, mask: layerMaskSchema, 'audio-effect': audioEffectSchema,
  gesture: gestureRecordingSchema, expression: parameterExpressionSchema, edit: semanticEditSchema, query: editingQuerySchema,
  'data-source': frozenDataSourceSchema,
};
export const authoringSchemaKindSchema = z.enum(Object.keys(schemas) as Array<keyof typeof schemas>);
export type AuthoringSchemaKind = z.infer<typeof authoringSchemaKindSchema>;
type JsonObject = Record<string, unknown>;
const cache = new Map<AuthoringSchemaKind, JsonObject>();

function object(value: unknown): JsonObject { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}; }

export function describeAuthoringSchema(input: AuthoringSchemaKind, full = false): JsonObject {
  const kind = authoringSchemaKindSchema.parse(input);
  let schema = cache.get(kind);
  if (!schema) { schema = z.toJSONSchema(schemas[kind], { io: 'input' }); cache.set(kind, schema); }
  if (full) return structuredClone(schema);
  const root = schema;
  const resolve = (input: unknown): JsonObject => {
    let node = object(input); const visited = new Set<string>();
    while (typeof node.$ref === 'string' && node.$ref.startsWith('#/') && !visited.has(node.$ref)) {
      visited.add(node.$ref); let value: unknown = root;
      for (const key of node.$ref.slice(2).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))) value = object(value)[key];
      node = object(value);
    }
    return node;
  };
  const summarize = (input: unknown): JsonObject => {
    const node = resolve(input), properties = object(node.properties), required = new Set(Array.isArray(node.required) ? node.required : []);
    return {
      ...(node.type === undefined ? {} : { type: node.type }),
      fields: Object.entries(properties).map(([name, value]) => {
        const field = resolve(value);
        const constraints = Object.fromEntries(['type', 'const', 'enum', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'description'].filter(key => field[key] !== undefined).map(key => [key, field[key]]));
        return { name, required: required.has(name), ...constraints,
          ...(field.default === undefined || Buffer.byteLength(JSON.stringify(field.default)) > 512 ? {} : { default: field.default }),
          ...(Array.isArray(field.anyOf) || Array.isArray(field.oneOf) ? { union: true } : {}) };
      }),
      ...(Array.isArray(node.enum) ? { values: node.enum } : {}),
    };
  };
  const node = resolve(root), alternatives = node.anyOf ?? node.oneOf;
  return structuredClone({ kind, ...(Array.isArray(alternatives) ? { alternatives: alternatives.map(summarize) } : summarize(node)),
    fullSchemaAvailable: true, runtimeValidationRequired: true });
}
