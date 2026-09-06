import { prepareMappedAudio, type AudioTimeMap } from './audio-time-map.js';
import { effectiveLayerStart } from './constraints.js';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { AudioTrack, GenmotionProject } from '../ir/schema.js';
import { projectDuration } from '../ir/schema.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { runProcess, throwIfAborted, type ProcessOptions } from './process.js';
import { audioEffectFilters, audioTempoFilters, decibelsToGain } from './audio-effects.js';
import { probeVideo } from './probe.js';
import { GenmotionError } from '../errors.js';
import { replaceFile } from '../ir/atomic.js';
import type { RenderView } from './render-view.js';
import { loudnessFilter, measureAudioFile, parseLoudnessReport, type LoudnessMeasurement } from './loudness.js';

interface PositionedTrack extends AudioTrack { source: string; prepared?: boolean; timeMap?: AudioTimeMap; sourceDuration?: number }
export interface AudioSourceOptions extends ProcessOptions { view?: RenderView | undefined }
export interface AudioRenderOptions extends AudioSourceOptions { stem?: AudioTrack['kind'] }

async function collectTracks(project: GenmotionProject, projectDir: string, options: AudioSourceOptions): Promise<PositionedTrack[]> {
  const authored = options.view ? [] : project.audio.filter((track) => !track.muted);
  const soloed = authored.some((track) => track.solo);
  const tracks = authored.filter((track) => !soloed || track.solo).map((track) => ({ ...track, source: resolveProjectAsset(projectDir, track.src) }));
  let sceneStart = 0;
  const probes = new Map<string, Awaited<ReturnType<typeof probeVideo>>>();
  for (const scene of project.scenes) {
    if (options.view && options.view.sceneId !== scene.id) { sceneStart += scene.duration; continue; }
    const visit = async (layers: GenmotionProject['scenes'][number]['layers'], containerDuration: number, chain: AudioTimeMap['chain']): Promise<void> => {
      if (chain.length > 128) throw new Error('Nested source audio exceeds 128 composition levels');
      const byId = new Map(layers.map((layer) => [layer.id, layer]));
      const visible = (id: string, trail = new Set<string>()): boolean => {
        const layer = byId.get(id); if (!layer) throw new Error(`Audio parent layer is missing: ${id}`);
        if (trail.has(id)) throw new Error('Source audio parent hierarchy has a cycle'); trail.add(id);
        return layer.visible && (!layer.parentId || visible(layer.parentId, trail));
      };
      for (const layer of layers) {
        if (options.view && chain.length === 0 && !options.view.layerIds.includes(layer.id)) continue;
        if (!visible(layer.id) || soloed) continue;
        if (effectiveLayerStart(layer) >= containerDuration) continue;
        if (layer.type === 'composition') {
          if (chain.some((entry) => entry.composition.id === layer.compositionId)) throw new Error('Nested source audio contains a composition cycle');
          const composition = project.compositions.find((candidate) => candidate.id === layer.compositionId);
          if (composition) await visit(composition.layers, composition.duration, [...chain, { layer, composition }]);
          continue;
        }
        if (layer.type !== 'video') continue;
        const dynamic = layer.tracks.some((track) => ['volume', 'playbackRate', 'trimStart'].includes(track.target)) || layer.propertyLinks?.some((link) => ['volume', 'playbackRate', 'trimStart'].includes(link.target));
        if (layer.volume <= 0 && !dynamic) continue;
        const source = resolveProjectAsset(projectDir, layer.src);
        let probe = probes.get(source); if (!probe) { probe = await probeVideo(source, options); probes.set(source, probe); }
        if (!probe.audioCodec) continue;
        const start = effectiveLayerStart(layer);
        tracks.push({
          id: 'video-' + [scene.id, ...chain.map((entry) => entry.layer.id), layer.id].join('-'), src: layer.src, source,
          start: sceneStart + start, trimStart: layer.trimStart, duration: Math.min(layer.duration ?? containerDuration - start, containerDuration - start),
          volume: layer.volume, playbackRate: layer.playbackRate, fadeIn: 0, fadeOut: 0, loop: layer.loop,
          duckUnderVoice: false, muted: false, solo: false, pan: 0, kind: 'source',
          ...(chain.length || dynamic ? { timeMap: { sceneStart, sceneDuration: scene.duration, chain, video: layer, layers, containerDuration, seed: project.seed, fps: project.fps, sourceDuration: probe.duration }, sourceDuration: probe.duration } : {}),
        });
      }
    };
    await visit(scene.layers, scene.duration, []);
    sceneStart += scene.duration;
  }
  return tracks;
}

function trackFilter(track: PositionedTrack, index: number, totalDuration: number, inputOffset: number): string {
  const label = `a${String(index)}`;
  if (track.prepared) return `[${String(index + inputOffset)}:a]anull[${label}]`;
  const playable = Math.min(track.duration ?? totalDuration - track.start, totalDuration - track.start);
  const rate = track.playbackRate ?? 1;
  const end = track.trimStart + playable * rate;
  const filters = [
    `[${String(index + inputOffset)}:a]atrim=start=${String(track.trimStart)}:end=${String(end)}`,
    'asetpts=PTS-STARTPTS',
    'aresample=48000',
  ];
  if (track.reverse) filters.push('areverse');
  filters.push(...audioTempoFilters(rate, track.preservePitch ?? true));
  filters.push(...audioEffectFilters(track.effects ?? []));
  filters.push(`volume=${String(track.volume * decibelsToGain(track.gainDb ?? 0))}`);
  const left = Math.cos((track.pan + 1) * Math.PI / 4);
  const right = Math.sin((track.pan + 1) * Math.PI / 4);
  filters.push(`aformat=channel_layouts=stereo,pan=stereo|c0=${left.toFixed(6)}*c0|c1=${right.toFixed(6)}*c1`);
  if (track.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${String(track.fadeIn)}`);
  if (track.fadeOut > 0) filters.push(`afade=t=out:st=${String(Math.max(0, playable - track.fadeOut))}:d=${String(track.fadeOut)}`);
  const delay = Math.round(track.start * 1000);
  if (delay > 0) filters.push(`adelay=${String(delay)}|${String(delay)}`);
  filters.push(`apad=whole_dur=${String(totalDuration)}`, `atrim=duration=${String(totalDuration)}`, 'asetnsamples=n=1024:p=1', `atrim=duration=${String(totalDuration)}`, 'asetpts=N/SR/TB');
  return `${filters.join(',')}[${label}]`;
}

async function prepareTracks(tracks: PositionedTrack[], duration: number, directory: string, projectDir: string, options: ProcessOptions): Promise<PositionedTrack[]> {
  const estimatedBytes = tracks.length * (Math.ceil(duration * 48_000) * 8 + 4096);
  if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes > 8 * 1024 ** 3) throw new GenmotionError('AUDIO_PREPARATION_LIMIT', 'Prepared audio exceeds the 8 GiB staging limit.', { estimatedBytes });
  const result: PositionedTrack[] = [];
  for (const [index, track] of tracks.entries()) {
    const source = path.join(directory, `track-${index}.wav`);
    if (track.timeMap) {
      await prepareMappedAudio(track.source, source, duration, track.sourceDuration!, track.timeMap, projectDir, options);
      result.push({ ...track, source, loop: false, prepared: true }); continue;
    }
    const args = ['-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1', '-y'];
    if (track.loop) args.push('-stream_loop', '-1');
    args.push('-i', track.source, '-filter_complex', trackFilter(track, 0, duration, 0), '-map', '[a0]', '-c:a', 'pcm_f32le', '-ar', '48000', '-ac', '2', '-t', String(duration), source);
    await runProcess('ffmpeg', args, projectDir, options);
    result.push({ ...track, source, loop: false, prepared: true });
  }
  return result;
}

function audioFilterGraph(project: GenmotionProject, tracks: PositionedTrack[], inputOffset: number, stem?: AudioTrack['kind']): string[] {
  const duration = projectDuration(project);
  const filters = tracks.map((track, index) => trackFilter(track, index, duration, inputOffset));
  const voice = tracks.map((track, index) => track.kind === 'voice' ? `[a${String(index)}]` : '').filter(Boolean);
  const duck = tracks.map((track, index) => track.kind !== 'voice' && track.duckUnderVoice ? `[a${String(index)}]` : '').filter(Boolean);
  const ordinary = tracks.map((track, index) => track.kind !== 'voice' && !track.duckUnderVoice ? `[a${String(index)}]` : '').filter(Boolean);
  const finalLabels: string[] = [];

  if (voice.length > 0) {
    filters.push(`${voice.join('')}amix=inputs=${String(voice.length)}:normalize=0[voices]`);
    if (duck.length > 0) {
      filters.push(`[voices]apad=whole_dur=${String(duration)},atrim=duration=${String(duration)},asplit=2[voiceout][voicesc]`);
      filters.push('[voiceout]anull[voicecopy]');
      filters.push('[voicesc]apad[sidechaincopy]');
      filters.push(`${duck.join('')}amix=inputs=${String(duck.length)}:normalize=0[duckbus]`);
      filters.push('[duckbus]apad[duckpadded]');
      const settings = project.audioDucking;
      filters.push(`[duckpadded][sidechaincopy]sidechaincompress=threshold=${settings ? decibelsToGain(settings.thresholdDb) : 0.04}:ratio=${settings?.ratio ?? 8}:attack=${settings?.attackMs ?? 20}:release=${settings?.releaseMs ?? 350}[ducked]`);
      if (stem && stem !== 'voice') { filters.push('[voicecopy]anullsink'); finalLabels.push('[ducked]'); }
      else finalLabels.push('[voicecopy]', '[ducked]');
    } else finalLabels.push('[voices]');
  } else {
    finalLabels.push(...duck);
  }
  finalLabels.push(...ordinary);
  filters.push(`${finalLabels.join('')}amix=inputs=${String(finalLabels.length)}:normalize=0:duration=longest${stem ? '' : ',alimiter=limit=0.95:level=0:latency=1'},apad=whole_dur=${String(duration)},atrim=duration=${String(duration)}[aout]`);

  return filters;
}

function audioMetadata(project: GenmotionProject, stem?: AudioTrack['kind']): string[] {
  const tags: Record<string, string> = { title: project.title, comment: stem ? `Genmotion ${stem} stem; pre-master float PCM` : 'Genmotion processed mix' };
  for (const key of ['artist', 'album', 'copyright', 'date', 'genre', 'language']) if (project.metadata[key]) tags[key] = project.metadata[key]!;
  return Object.entries(tags).flatMap(([key, value]) => ['-metadata', `${key}=${value.slice(0, 16_384)}`]);
}

async function deliveryAudioGraph(project: GenmotionProject, tracks: PositionedTrack[], offset: number, projectDir: string, options: ProcessOptions): Promise<string[]> {
  const filters = audioFilterGraph(project, tracks, offset);
  if (!project.audioNormalization) return filters;
  const measurementFilters = audioFilterGraph(project, tracks, 0);
  measurementFilters.push(`[aout]${loudnessFilter(project.audioNormalization)}[measured]`);
  const args = ['-hide_banner', '-nostats', '-filter_complex_threads', '1'];
  for (const track of tracks) { if (track.loop) args.push('-stream_loop', '-1'); args.push('-i', track.source); }
  args.push('-filter_complex', measurementFilters.join(';'), '-map', '[measured]', '-t', String(projectDuration(project)), '-f', 'null', '-');
  const measurement = parseLoudnessReport((await runProcess('ffmpeg', args, projectDir, options)).stderr);
  if (measurement.silence || measurement.integratedLufs === null) return filters;
  filters[filters.length - 1] = filters.at(-1)!.replace('[aout]', '[premaster]');
  filters.push(`[premaster]${loudnessFilter(project.audioNormalization, measurement)},aresample=48000[aout]`);
  return filters;
}

export interface AudioMixOptions extends AudioSourceOptions { range?: { start: number; duration: number } | undefined }
export async function mixAudio(project: GenmotionProject, projectDir: string, silentVideo: string, output: string, options: AudioMixOptions = {}): Promise<void> {
  if (options.range && (!Number.isFinite(options.range.start) || options.range.start < 0 || !Number.isFinite(options.range.duration) || options.range.duration <= 0 || options.range.start + options.range.duration > projectDuration(project) + 1 / project.fps + 1e-9)) throw new GenmotionError('INVALID_AUDIO_RANGE', 'Audio range must be finite and inside the project frame interval.');
  throwIfAborted(options.signal);
  let tracks = await collectTracks(project, projectDir, options);
  await mkdir(path.dirname(output), { recursive: true });
  if (tracks.length === 0) {
    throwIfAborted(options.signal);
    await replaceFile(silentVideo, output, options.signal ? { signal: options.signal } : {});
    return;
  }

  const directory = await mkdtemp(path.join(path.dirname(output), '.genmotion-mix-'));
  try {
    tracks = await prepareTracks(tracks, projectDuration(project), directory, projectDir, options);
    const args = ['-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1', '-y', '-i', silentVideo];
    for (const track of tracks) {
      if (track.loop) args.push('-stream_loop', '-1');
      args.push('-i', track.source);
    }

    const duration = options.range?.duration ?? projectDuration(project);
    const filters = await deliveryAudioGraph(project, tracks, 1, projectDir, options);
    if (options.range) filters.push(`[aout]atrim=start=${options.range.start}:end=${options.range.start + options.range.duration},asetpts=PTS-STARTPTS[arange]`);

    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '0:v:0', '-map', options.range ? '[arange]' : '[aout]',
      '-c:v', 'copy', '-c:a', path.extname(output).toLowerCase() === '.webm' ? 'libopus' : 'aac', '-b:a', '320k',
    );
    if (path.extname(output).toLowerCase() !== '.webm') args.push('-movflags', '+faststart');
    args.push(...audioMetadata(project), '-t', String(duration), output);
    await runProcess('ffmpeg', args, projectDir, options);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

const activeAudioOutputs = new Set<string>();

/** Render the same processed mix used by video export, with an atomic output commit. */
export async function renderAudio(project: GenmotionProject, projectDir: string, destination: string, options: AudioRenderOptions = {}): Promise<{ output: string; duration: number; bytes: number; tracks: number }> {
  throwIfAborted(options.signal);
  const output = path.resolve(destination);
  const extension = path.extname(output).toLowerCase();
  const codecs: Record<string, string> = { '.wav': 'pcm_s24le', '.flac': 'flac', '.m4a': 'aac', '.opus': 'libopus' };
  const codec = options.stem ? 'pcm_f32le' : codecs[extension];
  if (options.stem && (!['music', 'voice', 'sfx', 'source'].includes(options.stem) || extension !== '.wav')) throw new GenmotionError('INVALID_STEM_OUTPUT', 'Stems require a music, voice, sfx or source kind and a .wav destination.');
  if (!codec) throw new GenmotionError('INVALID_AUDIO_CONTAINER', 'Audio exports require .wav, .flac, .m4a or .opus.');
  const key = process.platform === 'win32' ? output.toLowerCase() : output;
  if (activeAudioOutputs.has(key)) throw new GenmotionError('OUTPUT_BUSY', 'An audio render already owns this output.');
  activeAudioOutputs.add(key);
  let staging: string | undefined;
  try {
    await mkdir(path.dirname(output), { recursive: true });
    staging = await mkdtemp(path.join(path.dirname(output), '.genmotion-audio-'));
    const candidate = path.join(staging, 'mix' + extension);
    let tracks = await collectTracks(project, projectDir, options);
    if (options.stem) {
      const selected = tracks.filter((track) => track.kind === options.stem);
      const needsVoice = options.stem !== 'voice' && selected.some((track) => track.duckUnderVoice);
      tracks = tracks.filter((track) => track.kind === options.stem || (needsVoice && track.kind === 'voice'));
    }
    const duration = projectDuration(project);
    tracks = await prepareTracks(tracks, duration, staging, projectDir, options);
    const args = ['-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1', '-y'];
    if (!tracks.length) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    else {
      for (const track of tracks) { if (track.loop) args.push('-stream_loop', '-1'); args.push('-i', track.source); }
      args.push('-filter_complex', (options.stem ? audioFilterGraph(project, tracks, 0, options.stem) : await deliveryAudioGraph(project, tracks, 0, projectDir, options)).join(';'), '-map', '[aout]');
    }
    args.push('-c:a', codec, '-ar', '48000', '-ac', '2', '-t', String(duration));
    if (codec === 'aac' || codec === 'libopus') args.push('-b:a', '320k');
    args.push(...audioMetadata(project, options.stem), candidate);
    await runProcess('ffmpeg', args, projectDir, options);
    // Decode verification catches corrupt output before replacing an accepted mix.
    await runProcess('ffmpeg', ['-v', 'error', '-xerror', '-i', candidate, '-f', 'null', '-'], projectDir, options);
    const info = await stat(candidate);
    throwIfAborted(options.signal);
    await replaceFile(candidate, output, options.signal ? { signal: options.signal } : {});
    return { output, duration, bytes: info.size, tracks: tracks.filter((track) => !options.stem || track.kind === options.stem).length };
  } finally {
    try { if (staging) await rm(staging, { recursive: true, force: true }); }
    finally { activeAudioOutputs.delete(key); }
  }
}

export async function measureProjectAudio(project: GenmotionProject, projectDir: string, options: ProcessOptions = {}): Promise<LoudnessMeasurement> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-loudness-'));
  try {
    const output = path.join(directory, 'mix.wav');
    await renderAudio(project, projectDir, output, options);
    return await measureAudioFile(output, options, project.audioNormalization);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
