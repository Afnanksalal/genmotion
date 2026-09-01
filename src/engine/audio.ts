import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import type { AudioTrack, GenmotionProject } from '../ir/schema.js';
import { projectDuration } from '../ir/schema.js';
import { resolveProjectAsset } from '../ir/loader.js';
import { runProcess } from './process.js';

interface PositionedTrack extends AudioTrack { source: string }

function collectTracks(project: GenmotionProject, projectDir: string): PositionedTrack[] {
  const authored = project.audio.filter((track) => !track.muted);
  const soloed = authored.some((track) => track.solo);
  const tracks = authored.filter((track) => !soloed || track.solo).map((track) => ({ ...track, source: resolveProjectAsset(projectDir, track.src) }));
  let sceneStart = 0;
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      if (layer.type !== 'video' || layer.volume <= 0) continue;
      tracks.push({
        id: `video-${scene.id}-${layer.id}`,
        src: layer.src,
        source: resolveProjectAsset(projectDir, layer.src),
        start: sceneStart + layer.start,
        trimStart: layer.trimStart,
        duration: layer.duration ?? scene.duration - layer.start,
        volume: layer.volume,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
        duckUnderVoice: false,
        muted: false,
        solo: false,
        pan: 0,
        kind: 'source',
      });
    }
    sceneStart += scene.duration;
  }
  return tracks;
}

function trackFilter(track: PositionedTrack, index: number, totalDuration: number): string {
  const label = `a${String(index)}`;
  const playable = Math.min(track.duration ?? totalDuration - track.start, totalDuration - track.start);
  const end = track.trimStart + playable;
  const filters = [
    `[${String(index + 1)}:a]atrim=start=${String(track.trimStart)}:end=${String(end)}`,
    'asetpts=PTS-STARTPTS',
    `volume=${String(track.volume)}`,
  ];
  const left = Math.cos((track.pan + 1) * Math.PI / 4);
  const right = Math.sin((track.pan + 1) * Math.PI / 4);
  filters.push(`aformat=channel_layouts=stereo,pan=stereo|c0=${left.toFixed(6)}*c0|c1=${right.toFixed(6)}*c1`);
  if (track.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${String(track.fadeIn)}`);
  if (track.fadeOut > 0) filters.push(`afade=t=out:st=${String(Math.max(0, playable - track.fadeOut))}:d=${String(track.fadeOut)}`);
  const delay = Math.round(track.start * 1000);
  if (delay > 0) filters.push(`adelay=${String(delay)}|${String(delay)}`);
  return `${filters.join(',')}[${label}]`;
}

export async function mixAudio(project: GenmotionProject, projectDir: string, silentVideo: string, output: string): Promise<void> {
  const tracks = collectTracks(project, projectDir);
  await mkdir(path.dirname(output), { recursive: true });
  if (tracks.length === 0) {
    await rename(silentVideo, output);
    return;
  }

  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', silentVideo];
  for (const track of tracks) {
    if (track.loop) args.push('-stream_loop', '-1');
    args.push('-i', track.source);
  }

  const duration = projectDuration(project);
  const filters = tracks.map((track, index) => trackFilter(track, index, duration));
  const voice = tracks.map((track, index) => track.kind === 'voice' ? `[a${String(index)}]` : '').filter(Boolean);
  const duck = tracks.map((track, index) => track.duckUnderVoice ? `[a${String(index)}]` : '').filter(Boolean);
  const ordinary = tracks.map((track, index) => track.kind !== 'voice' && !track.duckUnderVoice ? `[a${String(index)}]` : '').filter(Boolean);
  const finalLabels: string[] = [];

  if (voice.length > 0) {
    filters.push(`${voice.join('')}amix=inputs=${String(voice.length)}:normalize=0[voices]`);
    if (duck.length > 0) {
      filters.push(`[voices]asplit=2[voiceout][voicesc]`);
      filters.push(`${duck.join('')}amix=inputs=${String(duck.length)}:normalize=0[duckbus]`);
      filters.push('[duckbus][voicesc]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=350[ducked]');
      finalLabels.push('[voiceout]', '[ducked]');
    } else finalLabels.push('[voices]');
  } else {
    finalLabels.push(...duck);
  }
  finalLabels.push(...ordinary);
  filters.push(`${finalLabels.join('')}amix=inputs=${String(finalLabels.length)}:normalize=0:duration=longest,alimiter=limit=0.95,atrim=duration=${String(duration)}[aout]`);

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '0:v:0', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
    '-movflags', '+faststart', '-t', String(duration), output,
  );
  await runProcess('ffmpeg', args, projectDir);
}
