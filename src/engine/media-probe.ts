import path from 'node:path';
import { stat } from 'node:fs/promises';
import { runProcess, type ProcessOptions } from './process.js';

export interface MediaStreamInfo {
  index: number; kind: string; codec: string; duration: number | null; start: number | null; frames: number | null;
  language: string | null; title: string | null;
  video?: { width: number; height: number; displayWidth: number; displayHeight: number; rotation: number; sampleAspectRatio: number; averageFrameRate: number | null; nominalFrameRate: number | null; frameRateMode: 'rates-differ' | 'not-determined'; pixelFormat: string | null; bitDepth: number | null; alphaPlane: boolean; colorSpace: string | null; colorTransfer: string | null; colorPrimaries: string | null; colorRange: string | null; hdrTransfer: 'pq' | 'hlg' | null };
  audio?: { sampleRate: number | null; channels: number | null; layout: string | null; sampleFormat: string | null; bitDepth: number | null };
}
export interface MediaInfo { path: string; bytes: number; modifiedAt: string; format: string; duration: number | null; bitrate: number | null; streams: MediaStreamInfo[]; warnings: string[] }

function numeric(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (value === '') return null;
  const number = Number(value); return Number.isFinite(number) ? number : null;
}
function ratio(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(/[/:]/), numerator = numeric(parts[0]), denominator = numeric(parts[1]);
  return numerator !== null && denominator !== null && denominator !== 0 && numerator > 0 && denominator > 0 ? numerator / denominator : null;
}
function text(value: unknown): string | null { return typeof value === 'string' && value !== 'unknown' && value !== 'N/A' ? value.slice(0, 4096) : null; }

export async function inspectMedia(source: string, options: ProcessOptions = {}): Promise<MediaInfo> {
  const file = path.resolve(source), before = await stat(file);
  if (!before.isFile()) throw new Error('Media inspection requires a local file');
  const result = await runProcess('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], undefined, { timeoutMs: 30000, ...options });
  const parsed = JSON.parse(result.stdout) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  if (!Array.isArray(parsed.streams)) throw new Error('Media probe returned no stream inventory');
  const after = await stat(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Source changed during media inspection');
  const warnings: string[] = [];
  const streams = parsed.streams.map((stream, index): MediaStreamInfo => {
    const tags = (stream.tags ?? {}) as Record<string, unknown>, kind = text(stream.codec_type) ?? 'unknown';
    const info: MediaStreamInfo = { index: numeric(stream.index) ?? index, kind, codec: text(stream.codec_name) ?? 'unknown', duration: numeric(stream.duration), start: numeric(stream.start_time), frames: numeric(stream.nb_frames), language: text(tags.language), title: text(tags.title) };
    if (kind === 'video') {
      const sideData = Array.isArray(stream.side_data_list) ? stream.side_data_list as Array<Record<string, unknown>> : [];
      const rotation = numeric(sideData.find((item) => item.rotation !== undefined)?.rotation) ?? numeric(tags.rotate) ?? 0;
      const width = numeric(stream.width) ?? 0, height = numeric(stream.height) ?? 0, sar = ratio(stream.sample_aspect_ratio) ?? 1;
      const radians = rotation * Math.PI / 180, displayWidth = Math.round(Math.abs(Math.cos(radians)) * width * sar + Math.abs(Math.sin(radians)) * height), displayHeight = Math.round(Math.abs(Math.sin(radians)) * width * sar + Math.abs(Math.cos(radians)) * height);
      const averageFrameRate = ratio(stream.avg_frame_rate), nominalFrameRate = ratio(stream.r_frame_rate), pixelFormat = text(stream.pix_fmt), transfer = text(stream.color_transfer);
      const hdrTransfer = transfer === 'smpte2084' ? 'pq' : transfer === 'arib-std-b67' ? 'hlg' : null;
      info.video = { width, height, displayWidth, displayHeight, rotation, sampleAspectRatio: sar, averageFrameRate, nominalFrameRate, frameRateMode: averageFrameRate !== null && nominalFrameRate !== null && Math.abs(averageFrameRate - nominalFrameRate) > .001 ? 'rates-differ' : 'not-determined', pixelFormat, bitDepth: numeric(stream.bits_per_raw_sample) || numeric(stream.bits_per_sample), alphaPlane: /^(?:yuva|rgba|bgra|argb|abgr|gbrap|ya\d)/.test(pixelFormat ?? ''), colorSpace: text(stream.color_space), colorTransfer: transfer, colorPrimaries: text(stream.color_primaries), colorRange: text(stream.color_range), hdrTransfer };
      if (hdrTransfer) warnings.push(`Stream ${info.index} declares ${hdrTransfer.toUpperCase()} transfer. The RGBA8 compositor requires an explicit SDR conversion before grading.`);
      if (info.video.frameRateMode === 'rates-differ') warnings.push(`Stream ${info.index} reports different average and nominal frame rates. This is a VFR hint, not a per-frame timing verification.`);
      if (pixelFormat?.startsWith('pal')) warnings.push(`Stream ${info.index} uses a palette; palette transparency is not determined by the alpha-plane flag.`);
    }
    if (kind === 'audio') info.audio = { sampleRate: numeric(stream.sample_rate), channels: numeric(stream.channels), layout: text(stream.channel_layout), sampleFormat: text(stream.sample_fmt), bitDepth: numeric(stream.bits_per_raw_sample) || numeric(stream.bits_per_sample) };
    return info;
  });
  return { path: file, bytes: before.size, modifiedAt: before.mtime.toISOString(), format: text(parsed.format?.format_name) ?? 'unknown', duration: numeric(parsed.format?.duration), bitrate: numeric(parsed.format?.bit_rate), streams, warnings };
}
