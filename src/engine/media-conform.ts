import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { inspectMedia, type MediaInfo } from './media-probe.js';
import { runProcess, throwIfAborted, type ProcessOptions } from './process.js';

export const mediaConformOptionsSchema = z.object({
  fps: z.number().finite().min(1).max(240),
  width: z.number().int().min(2).max(8192).optional(), height: z.number().int().min(2).max(8192).optional(),
  start: z.number().finite().nonnegative().default(0), duration: z.number().finite().positive().max(3600).optional(),
  codec: z.enum(['h264', 'prores']).default('prores'),
  toneMap: z.enum(['auto', 'none', 'hable', 'mobius', 'reinhard']).default('auto'),
  nominalPeakLuminance: z.number().finite().min(1).max(10000).default(100),
  inputTransfer: z.enum(['bt709', 'smpte2084', 'arib-std-b67', 'iec61966-2-1', 'linear']).optional(),
  inputPrimaries: z.enum(['bt709', 'bt2020', 'smpte432']).optional(),
  inputMatrix: z.enum(['gbr', 'bt709', 'bt2020nc', 'smpte170m']).optional(),
  inputRange: z.enum(['full', 'limited']).optional(),
  allowAlphaLoss: z.boolean().default(false),
}).strict().refine((value) => (value.width === undefined) === (value.height === undefined), 'Specify both target dimensions or neither')
  .refine((value) => (value.width === undefined || value.width % 2 === 0) && (value.height === undefined || value.height % 2 === 0), 'Conformed dimensions must be even');
export type MediaConformOptions = z.input<typeof mediaConformOptionsSchema>;

export function mediaConformPlan(info: MediaInfo, input: MediaConformOptions) {
  const options = mediaConformOptionsSchema.parse(input), source = info.streams.find((stream) => stream.video)?.video;
  if (!source) throw new Error('Media conforming requires a video stream');
  if (source.alphaPlane && !options.allowAlphaLoss) throw new Error('These conforming codecs discard alpha. Use an alpha-preserving source workflow or explicitly enable allowAlphaLoss.');
  const transfer = options.inputTransfer ?? source.colorTransfer, primaries = options.inputPrimaries ?? source.colorPrimaries, matrix = options.inputMatrix ?? source.colorSpace;
  if (!transfer || !primaries || !matrix) throw new Error('SDR conforming requires declared input transfer, primaries and matrix; supply explicit assumptions for untagged sources.');
  const transferValues = ['bt709', 'smpte2084', 'arib-std-b67', 'iec61966-2-1', 'linear'], primariesValues = ['bt709', 'bt2020', 'smpte432'], matrixValues = ['gbr', 'bt709', 'bt2020nc', 'smpte170m'];
  if (!transferValues.includes(transfer) || !primariesValues.includes(primaries) || !matrixValues.includes(matrix)) throw new Error('Source color tags are outside the supported conforming profiles; select supported explicit input values.');
  const hdr = transfer === 'smpte2084' || transfer === 'arib-std-b67', algorithm = options.toneMap === 'auto' ? hdr ? 'hable' : 'none' : options.toneMap;
  if (hdr && algorithm === 'none') throw new Error('HDR-to-SDR conforming requires an explicit tone-mapping algorithm');
  const width = options.width ?? Math.max(2, Math.ceil(source.displayWidth / 2) * 2), height = options.height ?? Math.max(2, Math.ceil(source.displayHeight / 2) * 2);
  if (width > 8192 || height > 8192) throw new Error('Specify target dimensions no larger than 8192 pixels');
  const available = info.duration === null ? undefined : info.duration - options.start, duration = options.duration ?? available;
  if (duration === undefined || duration <= 0 || duration > 3600 || (available !== undefined && duration > available + 1 / options.fps)) throw new Error('Specify a positive conforming window within the source and no longer than one hour');
  const range = options.inputRange ?? (source.colorRange === 'pc' ? 'full' : source.colorRange === 'tv' ? 'limited' : undefined);
  if (!range) throw new Error('Source color range is unspecified; supply inputRange explicitly');
  const filters = [`zscale=transferin=${transfer}:primariesin=${primaries}:matrixin=${matrix}:rangein=${range}:transfer=linear:npl=${options.nominalPeakLuminance}`, 'format=gbrpf32le', 'zscale=primaries=bt709'];
  if (algorithm !== 'none') filters.push(`tonemap=tonemap=${algorithm}:desat=0`);
  filters.push('zscale=transfer=bt709:primaries=bt709:matrix=bt709:range=limited', `scale=${width}:${height}:flags=lanczos`, 'setsar=1', `fps=${options.fps}`, 'setpts=PTS-STARTPTS', 'sidedata=mode=delete:type=MASTERING_DISPLAY_METADATA', 'sidedata=mode=delete:type=CONTENT_LIGHT_LEVEL', `format=${options.codec === 'h264' ? 'yuv420p' : 'yuv422p10le'}`);
  return { options, width, height, duration, algorithm, filter: filters.join(','), outputColor: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', range: 'limited' }, warnings: [...(source.alphaPlane ? ['Alpha will be discarded as explicitly requested.'] : []), 'Conforming scales to the specified dimensions. Match source display aspect ratio when preserving proportions.'] };
}

async function hashFile(file: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file, { highWaterMark: 1024 * 1024 })) { throwIfAborted(signal); hash.update(chunk as Buffer); } return hash.digest('hex');
}

export async function conformMedia(source: string, destination: string, input: MediaConformOptions, processOptions: ProcessOptions = {}) {
  const options = mediaConformOptionsSchema.parse(input), sourceFile = path.resolve(source), outputFile = path.resolve(destination);
  if (sourceFile.toLowerCase() === outputFile.toLowerCase()) throw new Error('Conforming must create a separate source derivative');
  if (path.extname(outputFile).toLowerCase() !== (options.codec === 'h264' ? '.mp4' : '.mov')) throw new Error('H.264 conforming requires .mp4; ProRes conforming requires .mov');
  if (await stat(outputFile).catch(() => undefined)) throw new Error('Conforming output already exists; choose a new destination');
  const timeout = processOptions.timeoutMs ?? 1800000, signal = AbortSignal.any([...(processOptions.signal ? [processOptions.signal] : []), AbortSignal.timeout(timeout)]);
  const managed = { ...processOptions, signal, timeoutMs: timeout };
  throwIfAborted(signal);
  const before = await stat(sourceFile);
  if (!before.isFile() || before.size > 32 * 1024 ** 3) throw new Error('Conforming source must be a local file of at most 32 GiB');
  const sourceSha256 = await hashFile(sourceFile, signal), info = await inspectMedia(sourceFile, managed), plan = mediaConformPlan(info, options);
  await mkdir(path.dirname(outputFile), { recursive: true });
  const directory = await mkdtemp(path.join(path.dirname(outputFile), '.genmotion-conform-'));
  try {
    const staged = path.join(directory, 'source' + path.extname(outputFile));
    const videoCodec = options.codec === 'h264' ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv'] : ['-c:v', 'prores_ks', '-profile:v', '3'];
    await runProcess('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-nostdin', '-y', '-ss', String(options.start), '-i', sourceFile, '-t', String(plan.duration), '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-vf', plan.filter, ...videoCodec, '-r', String(options.fps), '-fps_mode', 'cfr', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-metadata:s:v:0', 'rotate=0', '-c:a', options.codec === 'h264' ? 'aac' : 'pcm_s24le', '-ar', '48000', '-movflags', '+faststart', '-fs', String(16 * 1024 ** 3), staged], undefined, managed);
    const encoded = await inspectMedia(staged, managed), video = encoded.streams.find((stream) => stream.video)?.video;
    if (!video || video.width !== plan.width || video.height !== plan.height || video.averageFrameRate === null || Math.abs(video.averageFrameRate - options.fps) > .001 || video.colorTransfer !== 'bt709' || video.colorPrimaries !== 'bt709' || video.colorSpace !== 'bt709' || encoded.duration === null || Math.abs(encoded.duration - plan.duration) > Math.max(.1, 2 / options.fps)) throw new Error('Conformed source failed its geometry, duration, frame-rate or SDR color contract');
    await runProcess('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-i', staged, '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-'], undefined, managed);
    const outputSha256 = await hashFile(staged, signal), after = await stat(sourceFile);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Source changed during media conforming');
    throwIfAborted(signal);
    // A same-volume hard link publishes atomically and refuses to replace a racing writer's file.
    await link(staged, outputFile);
    return { source: sourceFile, output: outputFile, sourceSha256, outputSha256, plan, probe: { ...encoded, path: outputFile } };
  } finally {
    const relative = path.relative(path.dirname(outputFile), directory);
    if (!(relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(directory).startsWith('.genmotion-conform-'))) await rm(directory, { recursive: true, force: true });
  }
}
