import { z } from 'zod';
import { createLayerGraphSampler, effectiveLayerStart } from '../engine/constraints.js';
import { layerBox } from '../engine/geometry.js';
import { evaluateNumber } from '../engine/timeline.js';
import type { GenmotionProject, Layer, Scene } from './schema.js';

const targetSchema = z.object({ sceneId: z.string().min(1), layerId: z.string().min(1) }).strict();
const base = { id: z.string().min(1), target: targetSchema };
export const acceptanceAssertionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('appearance-deadline'), by: z.number().finite().nonnegative(), minimumOpacity: z.number().min(0).max(1).default(.01) }).strict(),
  z.object({ ...base, type: z.literal('ordering'), before: targetSchema }).strict(),
  z.object({ ...base, type: z.literal('frame-containment'), at: z.number().finite().nonnegative(), margin: z.number().finite().nonnegative().default(0) }).strict(),
  z.object({ ...base, type: z.literal('readable-hold'), minimumDuration: z.number().finite().positive() }).strict(),
  z.object({ ...base, type: z.literal('maximum-static-interval'), maximumDuration: z.number().finite().positive(), intentionalStillness: z.boolean().default(false), reducedMotion: z.boolean().default(false) }).strict(),
]);
export const acceptanceAssertionsSchema = z.object({ version: z.literal(1), assertions: z.array(acceptanceAssertionSchema).max(1000).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Assertion IDs must be unique') }).strict();
export type AcceptanceAssertion = z.infer<typeof acceptanceAssertionSchema>;

function locate(project: GenmotionProject, target: z.infer<typeof targetSchema>): { scene: Scene; layer: Layer; offset: number } {
  const scene = project.scenes.find(item => item.id === target.sceneId); if (!scene) throw new Error(`Assertion scene not found: ${target.sceneId}`);
  const matches = scene.layers.filter(item => item.id === target.layerId); if (matches.length !== 1) throw new Error(`Assertion target must resolve exactly once: ${target.sceneId}/${target.layerId}`);
  return { scene, layer: matches[0]!, offset: project.scenes.slice(0, project.scenes.indexOf(scene)).reduce((sum, item) => sum + item.duration, 0) };
}

export function evaluateAcceptanceAssertions(project: GenmotionProject, input: unknown) {
  const contract = acceptanceAssertionsSchema.parse(input);
  const results = contract.assertions.map(assertion => {
    const { scene, layer, offset } = locate(project, assertion.target), start = offset + effectiveLayerStart(layer), end = offset + layer.start + (layer.duration ?? scene.duration - layer.start);
    let passed = false, measured: unknown, reason = '';
    if (assertion.type === 'appearance-deadline') { const opacity = layer.visible && assertion.by >= start && assertion.by < end ? evaluateNumber(layer.transform.opacity, assertion.by - start) : 0; measured = { opacity }; passed = opacity >= assertion.minimumOpacity; reason = passed ? 'Target is present by the deadline.' : 'Target is absent or below the required opacity at the deadline.'; }
    else if (assertion.type === 'ordering') { const other = locate(project, assertion.before), otherStart = other.offset + effectiveLayerStart(other.layer); measured = { firstStart: start, secondStart: otherStart }; passed = start <= otherStart; reason = passed ? 'Authored start order is satisfied.' : 'Authored start order is reversed.'; }
    else if (assertion.type === 'frame-containment') { const local = assertion.at - offset, resolved = createLayerGraphSampler(scene.layers, project.seed)(local, [layer.id])[0]!, box = layerBox(resolved), x = box.x + Number(resolved.transform.x), y = box.y + Number(resolved.transform.y); measured = { x, y, width: box.width, height: box.height }; passed = x >= assertion.margin && y >= assertion.margin && x + box.width <= project.width - assertion.margin && y + box.height <= project.height - assertion.margin; reason = passed ? 'Evaluated native bounds are contained.' : 'Evaluated native bounds leave the required frame.'; }
    else if (assertion.type === 'readable-hold') { if (layer.type !== 'text' && layer.type !== 'caption') throw new Error(`Readable-hold target must be text or caption: ${layer.id}`); const settled = Math.max(start, ...layer.motion.map(motion => start + motion.start + motion.duration)); const duration = Math.max(0, end - settled); measured = { settled, end, duration }; passed = duration >= assertion.minimumDuration; reason = passed ? 'Readable settled hold is long enough.' : 'Readable settled hold is too short.'; }
    else { const times = layer.tracks.flatMap(track => track.keyframes.map(frame => start + frame.at)).filter(time => time >= start && time <= end).sort((a, b) => a - b), boundaries = [start, ...new Set(times), end], maximum = Math.max(...boundaries.slice(1).map((time, index) => time - boundaries[index]!)); measured = { maximum, exempt: assertion.intentionalStillness || assertion.reducedMotion }; passed = assertion.intentionalStillness || assertion.reducedMotion || maximum <= assertion.maximumDuration; reason = passed ? 'Static interval is within policy or explicitly exempt.' : 'An unintended static interval exceeds the maximum.'; }
    return { id: assertion.id, type: assertion.type, target: assertion.target, passed, measured, reason };
  });
  return { version: 1 as const, complete: true, passed: results.every(result => result.passed), results, scope: 'declared-native-assertions' as const, disclaimer: 'These declared checks are bounded engineering assertions, not exhaustive aesthetic approval.' };
}
