import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from './process.js';

export interface VideoProbe {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  videoCodec: string;
  audioCodec?: string;
  size: number;
}

export async function probeVideo(file: string): Promise<VideoProbe> {
  const result = await runProcess('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.resolve(file)]);
  const parsed = JSON.parse(result.stdout) as {
    streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string }>;
    format: { duration?: string; size?: string };
  };
  const video = parsed.streams.find((stream) => stream.codec_type === 'video');
  if (!video?.width || !video.height) throw new Error(`No video stream found in ${file}`);
  const [numerator, denominator] = (video.avg_frame_rate ?? '0/1').split('/').map(Number);
  const audio = parsed.streams.find((stream) => stream.codec_type === 'audio');
  return {
    duration: Number(parsed.format.duration ?? 0), width: video.width, height: video.height,
    frameRate: (numerator ?? 0) / Math.max(1, denominator ?? 1), videoCodec: video.codec_name,
    ...(audio ? { audioCodec: audio.codec_name } : {}), size: Number(parsed.format.size ?? 0),
  };
}

export async function makeContactSheet(file: string, output: string, count = 12, columns = 4): Promise<void> {
  const probe = await probeVideo(file);
  const rows = Math.ceil(count / columns);
  const destination = path.resolve(output);
  await mkdir(path.dirname(destination), { recursive: true });
  const interval = Math.max(0.001, probe.duration / count);
  await runProcess('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', path.resolve(file),
    '-vf', `fps=1/${interval},scale=480:-1,tile=${String(columns)}x${String(rows)}:padding=8:margin=8:color=0x111318`,
    '-frames:v', '1', destination,
  ]);
}
