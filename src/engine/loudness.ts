import { audioNormalizationSchema, type AudioNormalization } from '../ir/audio-effects.js';
import { runProcess, type ProcessOptions } from './process.js';

export interface LoudnessMeasurement {
  integratedLufs: number | null;
  truePeakDbtp: number | null;
  rangeLu: number;
  thresholdLufs: number | null;
  targetOffsetDb: number | null;
  silence: boolean;
  warnings: string[];
}
export function loudnessFilter(settings: AudioNormalization, measurement?: LoudnessMeasurement): string {
  const checked = audioNormalizationSchema.parse(settings);
  const options = [`I=${checked.integratedLufs}`, `TP=${checked.truePeakDbtp}`, `LRA=${checked.rangeLu}`];
  if (measurement && !measurement.silence && measurement.integratedLufs !== null && measurement.truePeakDbtp !== null && measurement.thresholdLufs !== null && measurement.targetOffsetDb !== null) options.push(
    `measured_I=${measurement.integratedLufs}`, `measured_TP=${measurement.truePeakDbtp}`, `measured_LRA=${measurement.rangeLu}`, `measured_thresh=${measurement.thresholdLufs}`, `offset=${measurement.targetOffsetDb}`, 'linear=true',
  );
  options.push('print_format=json');
  return 'loudnorm=' + options.join(':');
}
export function parseLoudnessReport(stderr: string): LoudnessMeasurement {
  const match = /\{\s*"input_i"\s*:[\s\S]*?\}/g;
  const reports = [...stderr.matchAll(match)];
  if (!reports.length) throw new Error('FFmpeg did not produce a loudness report');
  const raw = JSON.parse(reports.at(-1)![0]) as Record<string, unknown>;
  const numeric = (key: string): number | null => {
    const value = raw[key];
    if (value === '-inf' || value === 'inf') return null;
    if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Number(value))) throw new Error('Invalid loudness measurement: ' + key);
    return Number(value);
  };
  const integratedLufs = numeric('input_i'), truePeakDbtp = numeric('input_tp'), rangeLu = numeric('input_lra'), thresholdLufs = numeric('input_thresh'), targetOffsetDb = numeric('target_offset');
  if (rangeLu === null || rangeLu < 0) throw new Error('Invalid loudness range');
  const silence = truePeakDbtp === null;
  const warnings: string[] = [];
  if (silence) warnings.push('The analyzed signal is silent. Loudness normalization is skipped.');
  else if (integratedLufs === null) warnings.push('The signal is below the integrated loudness gate or too short to measure.');
  if (truePeakDbtp !== null && truePeakDbtp >= 0) warnings.push('True peak reaches or exceeds 0 dBTP; clipping is possible.');
  return { integratedLufs, truePeakDbtp, rangeLu, thresholdLufs, targetOffsetDb, silence, warnings };
}
export async function measureAudioFile(source: string, options: ProcessOptions = {}, settings: AudioNormalization = audioNormalizationSchema.parse({})): Promise<LoudnessMeasurement> {
  const result = await runProcess('ffmpeg', ['-hide_banner', '-nostats', '-i', source, '-map', '0:a:0', '-af', loudnessFilter(settings), '-f', 'null', '-'], undefined, options);
  return parseLoudnessReport(result.stderr);
}
