import { createLayerGraphSampler, effectiveLayerStart } from './constraints.js';
import { layerBox } from './geometry.js';
import { gestureRecordingSchema, type GestureRecording } from '../ir/gesture-recording.js';
import type { AnimationTrack, Layer } from '../ir/schema.js';

function trackSegment(track: AnimationTrack, localTime: number) {
  const right = track.keyframes.findIndex(keyframe => keyframe.at >= localTime);
  const index = right <= 0 ? 0 : Math.min(right - 1, track.keyframes.length - 2);
  const from = track.keyframes[index]!, to = track.keyframes[index + 1]!;
  return { trackId: track.id, target: track.target, from: from.at, to: to.at, discontinuity: Boolean(from.hold || track.interpolation === 'discrete') };
}

export function composedTrajectory(layers: Layer[], layerId: string, sceneOffset: number, times: number[], seed = 0) {
  if (!times.length || times.some(time => !Number.isFinite(time))) throw new Error('Trajectory times must be finite and nonempty.');
  const source = new Map(layers.map(layer => [layer.id, layer])), target = source.get(layerId); if (!target) throw new Error(`Unknown trajectory layer: ${layerId}`);
  const ancestors: string[] = []; let parent = target.parentId;
  while (parent) { if (ancestors.includes(parent)) throw new Error('Trajectory ancestry contains a cycle.'); ancestors.push(parent); parent = source.get(parent)?.parentId; }
  const sampler = createLayerGraphSampler(layers, seed);
  const samples = [...new Set(times)].sort((a, b) => a - b).map(globalTime => {
    const sceneTime = globalTime - sceneOffset, resolved = sampler(sceneTime, [layerId])[0]!, box = layerBox(resolved);
    const localTime = sceneTime - effectiveLayerStart(target);
    return { globalTime, sceneTime, localTime, world: { x: box.x + box.width / 2 + Number(resolved.transform.x), y: box.y + box.height / 2 + Number(resolved.transform.y), rotation: Number(resolved.transform.rotation), scaleX: Number(resolved.transform.scaleX), scaleY: Number(resolved.transform.scaleY), opacity: Number(resolved.transform.opacity) }, segments: target.tracks.map(track => trackSegment(track, localTime)), contributions: { ancestors, constraints: target.constraints.map(item => ({ type: item.type, target: item.target })), propertyLinks: (target.propertyLinks ?? []).filter(item => item.enabled).map(item => ({ target: item.target, sourceLayerId: item.sourceLayerId, sourceProperty: item.sourceProperty })) } };
  });
  return { version: 1 as const, layerId, sceneOffset, samples, discontinuities: samples.flatMap(sample => sample.segments.filter(segment => segment.discontinuity).map(segment => ({ time: sample.globalTime, trackId: segment.trackId, reason: 'hold-or-discrete' as const }))) };
}

export function diagnoseGestures(recordings: GestureRecording[]) {
  const parsed = recordings.map(recording => gestureRecordingSchema.parse(recording));
  const strokes = parsed.map(recording => ({ id: recording.id, coordinateSpace: recording.coordinateSpace, start: recording.start, end: recording.start + recording.samples.at(-1)!.at, points: recording.samples.map(sample => ({ time: recording.start + sample.at, x: sample.x, y: sample.y })) }));
  const jumps = strokes.slice(1).map((stroke, index) => { const from = strokes[index]!.points.at(-1)!, to = stroke.points[0]!; return { fromStroke: strokes[index]!.id, toStroke: stroke.id, distance: Math.hypot(to.x - from.x, to.y - from.y), duration: to.time - from.time }; });
  return { version: 1 as const, strokes, jumps };
}

export function retimeGesture(recording: GestureRecording, duration: number): GestureRecording {
  const parsed = gestureRecordingSchema.parse(recording); if (!Number.isFinite(duration) || duration <= 0) throw new Error('Gesture duration must be positive and finite.');
  const sourceDuration = parsed.samples.at(-1)!.at, scale = duration / sourceDuration;
  return gestureRecordingSchema.parse({ ...structuredClone(parsed), samples: parsed.samples.map(sample => ({ ...sample, at: sample.at * scale })) });
}

export function compareGestureTiming(before: GestureRecording, after: GestureRecording) {
  const left = diagnoseGestures([before]).strokes[0]!, right = diagnoseGestures([after]).strokes[0]!;
  if (left.id !== right.id || left.coordinateSpace !== right.coordinateSpace || left.points.length !== right.points.length || left.points.some((point, index) => point.x !== right.points[index]!.x || point.y !== right.points[index]!.y)) throw new Error('Timing comparison requires identical semantic stroke identity and geometry.');
  return { version: 1 as const, strokeId: left.id, coordinateSpace: left.coordinateSpace, before: left.points, after: right.points };
}
