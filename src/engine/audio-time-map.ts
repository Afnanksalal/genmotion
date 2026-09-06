import { open, rm, stat } from 'node:fs/promises';
import type { AnimationTrack, Composition, CompositionLayer, Layer, VideoLayer } from '../ir/schema.js';
import { compositionTime } from './composition-time.js';
import { createLayerGraphSampler, effectiveLayerStart } from './constraints.js';
import { evaluateTrack } from './animation.js';
import { runProcess, throwIfAborted, type ProcessOptions } from './process.js';

export interface AudioTimeMap {
  sceneStart: number; sceneDuration: number; chain: Array<{ layer: CompositionLayer; composition: Composition }>;
  video: VideoLayer; containerDuration: number; seed: number; fps: number;
  layers?: Layer[]; sourceDuration?: number;
}
function activeTracks(layer: VideoLayer): AnimationTrack[] {
  const groups = new Map(layer.trackGroups?.map((group) => [group.id, group]));
  const candidates = layer.tracks.filter((track) => track.enabled && !groups.get(track.group ?? '')?.muted);
  const solo = candidates.some((track) => track.solo || groups.get(track.group ?? '')?.solo);
  return candidates.filter((track) => !solo || track.solo || groups.get(track.group ?? '')?.solo);
}
export function audioTimeSampler(map: AudioTimeMap): (time: number) => { sourceTime: number; gain: number } | null {
  const tracks = activeTracks(map.video).filter((track) => ['volume', 'trimStart', 'playbackRate'].includes(track.target));
  const links = map.video.propertyLinks?.filter((link) => link.enabled && ['volume', 'trimStart', 'playbackRate'].includes(link.target));
  const graph = links?.length ? createLayerGraphSampler((map.layers ?? [map.video]).map((layer) => ({ ...layer, effects: [], masks: [] })), map.seed) : undefined;
  const chain = map.chain.map((entry) => ({ ...entry, start: effectiveLayerStart(entry.layer) }));
  const videoStart = effectiveLayerStart(map.video);
  return (time) => {
    let local = time - map.sceneStart;
    if (local < 0 || local >= map.sceneDuration) return null;
    let containerDuration = map.sceneDuration;
    for (const entry of chain) {
      const layer = entry.layer, layerTime = local - entry.start;
      if (!layer.visible || layerTime < 0 || layerTime >= (layer.duration ?? containerDuration - entry.start)) return null;
      if (layer.freeze && layerTime >= (layer.freeze.from ?? 0) && (layer.freeze.to === undefined || layerTime < layer.freeze.to)) return null;
      const mapped = compositionTime(layer, entry.composition, layerTime, map.fps, { sampleRate: 48000, quantize: false });
      // Frame holds outside source trims are silent, rather than emitting a held PCM sample as DC.
      const before = compositionTime(layer, entry.composition, layerTime - 1 / 48000, map.fps, { sampleRate: 48000, quantize: false });
      const after = compositionTime(layer, entry.composition, layerTime + 1 / 48000, map.fps, { sampleRate: 48000, quantize: false });
      if (mapped === before && mapped === after) return null;
      local = mapped; containerDuration = entry.composition.duration;
    }
    const clipTime = local - videoStart;
    if (!map.video.visible || clipTime < 0 || clipTime >= (map.video.duration ?? map.containerDuration - videoStart)) return null;
    let volume = map.video.volume, trimStart = map.video.trimStart, playbackRate = map.video.playbackRate;
    if (graph) {
      const resolved = graph(local, [map.video.id])[0];
      if (!resolved || resolved.type !== 'video') throw new Error('Audio source graph did not resolve its video');
      if (!resolved.visible) return null;
      volume = resolved.volume; trimStart = resolved.trimStart; playbackRate = resolved.playbackRate;
    }
    for (const track of graph ? [] : tracks) {
      const value = evaluateTrack(track, clipTime, map.seed); if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Audio source tracks must evaluate to finite numbers');
      const combine = (current: number): number => track.operation === 'add' ? current + value : track.operation === 'multiply' ? current * value : value;
      if (track.target === 'volume') volume = combine(volume); else if (track.target === 'trimStart') trimStart = combine(trimStart); else playbackRate = combine(playbackRate);
    }
    let sourceTime = trimStart + clipTime * playbackRate;
    if (!Number.isFinite(sourceTime) || playbackRate <= 0 || trimStart < 0) throw new Error('Invalid audio source time mapping');
    if (map.video.loop) { if (!map.sourceDuration || !Number.isFinite(map.sourceDuration) || map.sourceDuration <= 0) throw new Error('Looped source audio requires a known positive source duration'); sourceTime %= map.sourceDuration; }
    return { sourceTime, gain: Math.max(0, Math.min(2, volume)) * Math.SQRT1_2 };
  };
}

/** Bakes random-access native composition clocks into a seek-safe float WAV. Retiming is varispeed. */
export async function prepareMappedAudio(source: string, destination: string, duration: number, sourceDuration: number, map: AudioTimeMap, projectDir: string, options: ProcessOptions): Promise<void> {
  const deadline = options.timeoutMs === undefined ? Infinity : Date.now() + options.timeoutMs;
  const frames = Math.ceil(duration * 48000), sourceFrames = Math.ceil(sourceDuration * 48000);
  if (!Number.isSafeInteger(frames) || !Number.isSafeInteger(sourceFrames) || frames * 8 > 0xffffffff - 50 || sourceFrames * 8 > 4 * 1024 ** 3) throw new Error('Mapped audio exceeds the 4 GiB per-stream preparation limit');
  const raw = destination + '.source.f32';
  try {
    await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-map', '0:a:0', '-vn', '-ar', '48000', '-ac', '2', '-f', 'f32le', '-fs', String(4 * 1024 ** 3), raw], projectDir, options);
    const bytes = (await stat(raw)).size;
    if (bytes >= 4 * 1024 ** 3 || bytes % 8 !== 0) throw new Error('Decoded audio exceeded its preparation budget or has an invalid sample alignment');
    const samples = bytes / 8, input = await open(raw, 'r');
    let output: Awaited<ReturnType<typeof open>> | undefined;
    try {
      output = await open(destination, 'wx');
      const header = Buffer.alloc(58); header.write('RIFF', 0); header.writeUInt32LE(frames * 8 + 50, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(18, 16); header.writeUInt16LE(3, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(384000, 28); header.writeUInt16LE(8, 32); header.writeUInt16LE(32, 34); header.write('fact', 38); header.writeUInt32LE(4, 42); header.writeUInt32LE(frames, 46); header.write('data', 50); header.writeUInt32LE(frames * 8, 54);
      await output.writeFile(header);
      const pages = new Map<number, Buffer>(), pageFrames = 8192;
      const page = async (sample: number): Promise<Buffer> => {
        const index = Math.floor(sample / pageFrames), cached = pages.get(index);
        if (cached) { pages.delete(index); pages.set(index, cached); return cached; }
        const buffer = Buffer.alloc(Math.min(pageFrames, samples - index * pageFrames) * 8);
        let read = 0; while (read < buffer.length) { const result = await input.read(buffer, read, buffer.length - read, index * pageFrames * 8 + read); if (!result.bytesRead) throw new Error('Decoded source changed during audio preparation'); read += result.bytesRead; }
        pages.set(index, buffer); while (pages.size > 16) pages.delete(pages.keys().next().value!); return buffer;
      };
      const sampleTime = audioTimeSampler(map), block = Buffer.alloc(4096 * 8);
      for (let start = 0; start < frames; start += 4096) {
        throwIfAborted(options.signal); if (Date.now() > deadline) throw new Error('Audio time-map preparation exceeded its deadline'); const count = Math.min(4096, frames - start); block.fill(0);
        for (let offset = 0; offset < count; offset += 1) {
          const mapped = sampleTime((start + offset) / 48000); if (!mapped || mapped.gain === 0) continue;
          const position = mapped.sourceTime * 48000, low = Math.floor(position); if (low < 0 || low >= samples) continue;
          const high = Math.min(samples - 1, low + 1), fraction = position - low, a = await page(low), b = await page(high);
          for (let channel = 0; channel < 2; channel += 1) {
            const value = (a.readFloatLE((low % pageFrames) * 8 + channel * 4) * (1 - fraction) + b.readFloatLE((high % pageFrames) * 8 + channel * 4) * fraction) * mapped.gain;
            if (!Number.isFinite(value)) throw new Error('Decoded source contains nonfinite audio samples'); block.writeFloatLE(value, offset * 8 + channel * 4);
          }
        }
        await output.writeFile(block.subarray(0, count * 8));
      }
    } finally { await input.close(); await output?.close(); }
  } finally { await rm(raw, { force: true }); }
}
