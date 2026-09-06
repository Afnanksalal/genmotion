import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { runProcess, throwIfAborted, type ProcessOptions } from './process.js';

export const audioAnalysisOptionsSchema = z.object({
  start: z.number().finite().nonnegative().default(0),
  duration: z.number().finite().positive().max(3600).default(600),
  silenceDb: z.number().finite().min(-120).max(0).default(-50),
  silenceDuration: z.number().finite().min(.02).max(60).default(.3),
  minimumBpm: z.number().finite().min(30).max(240).default(60),
  maximumBpm: z.number().finite().min(30).max(300).default(200),
}).strict().refine((value) => value.maximumBpm > value.minimumBpm, 'Maximum BPM must exceed minimum BPM');
export type AudioAnalysisOptions = z.input<typeof audioAnalysisOptionsSchema>;
export interface WaveformLevel { samplesPerBin: number; /** Interleaved left min/max/RMS, right min/max/RMS. */ values: number[] }
export interface AudioAnalysis {
  version: 1; sourceSha256: string; start: number; duration: number; requestedDuration: number; sampleRate: number; samples: number;
  waveform: WaveformLevel[];
  spectrum: { fftSize: number; hopSamples: number; frequencies: number[]; /** Frame-major mean band magnitudes in dBFS, clamped to [-120, 0]. */ values: number[] };
  transients: { time: number; strength: number }[];
  silence: { start: number; end: number }[];
  tempo: { bpm: number | null; confidence: number; beats: number[]; method: 'spectral-flux-autocorrelation' };
  warnings: string[];
}

const RATE = 16000, FFT = 1024, HOP = 512, BIN = 320, BANDS = 24;
/** In-place radix-2 FFT of real samples, returning positive-frequency magnitudes. */
export function audioSpectrum(samples: Float64Array): Float64Array {
  const size = samples.length;
  if (size < 2 || size > 65536 || (size & (size - 1)) !== 0) throw new Error('FFT size must be a power of two between 2 and 65536');
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  for (let index = 0; index < size; index += 1) real[index] = samples[index]! * (.5 - .5 * Math.cos(2 * Math.PI * index / size));
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1; for (; reversed & bit; bit >>= 1) reversed ^= bit; reversed ^= bit;
    if (index < reversed) { const value = real[index]!; real[index] = real[reversed]!; real[reversed] = value; }
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = -2 * Math.PI / length, stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
    for (let offset = 0; offset < size; offset += length) {
      let wr = 1, wi = 0;
      for (let index = 0; index < length / 2; index += 1) {
        const even = offset + index, odd = even + length / 2;
        const tr = wr * real[odd]! - wi * imaginary[odd]!, ti = wr * imaginary[odd]! + wi * real[odd]!;
        real[odd] = real[even]! - tr; imaginary[odd] = imaginary[even]! - ti; real[even]! += tr; imaginary[even]! += ti;
        const next = wr * stepReal - wi * stepImaginary; wi = wr * stepImaginary + wi * stepReal; wr = next;
      }
    }
  }
  return Float64Array.from({ length: size / 2 + 1 }, (_, index) => Math.hypot(real[index]!, imaginary[index]!) * (index === 0 || index === size / 2 ? 2 : 4) / size);
}

export function analyzeOnsets(flux: number[], start: number, duration: number, minimumBpm: number, maximumBpm: number): Pick<AudioAnalysis, 'transients' | 'tempo'> {
  const step = HOP / RATE, normalized = new Float64Array(flux.length), transients: AudioAnalysis['transients'] = [];
  let last = -Infinity;
  for (let index = 0; index < flux.length; index += 1) {
    const local = flux.slice(Math.max(0, index - 16), Math.min(flux.length, index + 17)).sort((a, b) => a - b);
    const baseline = local[Math.floor(local.length / 2)] ?? 0;
    normalized[index] = Math.max(0, flux[index]! - baseline * 1.5 - .0001);
    if (index > 0 && index < flux.length - 1 && normalized[index]! > 0 && flux[index]! >= flux[index - 1]! && flux[index]! > flux[index + 1]! && (index - last) * step >= .096) {
      const time = start + index * step;
      if (time < start + duration) transients.push({ time, strength: normalized[index]! }); last = index;
    }
  }
  const strongest = Math.max(1e-12, ...transients.map((item) => item.strength));
  for (const transient of transients) transient.strength = Math.min(1, transient.strength / strongest);
  const minimumLag = Math.max(1, Math.ceil(60 / maximumBpm / step)), maximumLag = Math.min(normalized.length - 1, Math.floor(60 / minimumBpm / step));
  let bestLag = 0, bestScore = 0;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let dot = 0, first = 0, second = 0;
    for (let index = lag; index < normalized.length; index += 1) { const a = normalized[index]!, b = normalized[index - lag]!; dot += a * b; first += a * a; second += b * b; }
    const score = first && second ? dot / Math.sqrt(first * second) : 0;
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  const beats: number[] = [];
  const bpm = bestLag && bestScore >= .15 && transients.length >= 3 ? 60 / (bestLag * step) : null;
  if (bpm !== null) {
    let phase = 0, phaseScore = -1;
    for (let candidate = 0; candidate < bestLag; candidate += 1) {
      let score = 0; for (let index = candidate; index < normalized.length; index += bestLag) score += normalized[index]!;
      if (score > phaseScore) { phaseScore = score; phase = candidate; }
    }
    for (let time = phase * step; time < duration; time += bestLag * step) beats.push(start + time);
  }
  return { transients, tempo: { bpm, confidence: bpm === null ? 0 : bestScore, beats, method: 'spectral-flux-autocorrelation' } };
}

export async function analyzeAudioFile(source: string, input: AudioAnalysisOptions = {}, processOptions: ProcessOptions = {}): Promise<AudioAnalysis> {
  const options = audioAnalysisOptionsSchema.parse(input), began = Date.now(), deadline = processOptions.timeoutMs ?? 300000;
  const checkpoint = (): void => { throwIfAborted(processOptions.signal); if (Date.now() - began >= deadline) throw new Error('Audio analysis exceeded its deadline'); };
  checkpoint();
  const before = await stat(source);
  if (!before.isFile() || before.size > 32 * 1024 ** 3) throw new Error('Audio analysis requires a local media file of at most 32 GiB');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(source, { highWaterMark: 1024 * 1024 })) { checkpoint(); hash.update(chunk as Buffer); }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-analysis-'));
  try {
    const file = path.join(directory, 'audio.f32');
    await runProcess('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-nostdin', '-ss', String(options.start), '-i', source, '-t', String(options.duration), '-map', '0:a:0', '-vn', '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_f32le', '-f', 'f32le', '-y', file], undefined, { ...processOptions, timeoutMs: Math.max(1, deadline - (Date.now() - began)) });
    const after = await stat(source);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Source media changed during analysis');
    const decoded = await stat(file);
    if (decoded.size % 8 || decoded.size > Math.ceil(options.duration * RATE + RATE) * 8) throw new Error('Decoded audio exceeded its declared size limit');
    const samples = decoded.size / 8, duration = samples / RATE, values: number[] = [], counts: number[] = [], spectrum: number[] = [], flux: number[] = [];
    const ringLeft = new Float64Array(FFT), ringRight = new Float64Array(FFT), windowLeft = new Float64Array(FFT), windowRight = new Float64Array(FFT), previous = new Float64Array(FFT / 2 + 1);
    const edges = Array.from({ length: BANDS + 1 }, (_, index) => 30 * (RATE / 2 / 30) ** (index / BANDS));
    let total = 0, binCount = 0, leftMin = Infinity, leftMax = -Infinity, rightMin = Infinity, rightMax = -Infinity, leftSquare = 0, rightSquare = 0;
    const flush = (): void => { if (!binCount) return; values.push(leftMin, leftMax, Math.sqrt(leftSquare / binCount), rightMin, rightMax, Math.sqrt(rightSquare / binCount)); counts.push(binCount); binCount = 0; leftMin = rightMin = Infinity; leftMax = rightMax = -Infinity; leftSquare = rightSquare = 0; };
    const handle = await open(file, 'r');
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      for (;;) {
        checkpoint(); const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
        if (bytesRead % 8) throw new Error('Truncated PCM frame');
        for (let offset = 0; offset < bytesRead; offset += 8) {
          const left = buffer.readFloatLE(offset), right = buffer.readFloatLE(offset + 4);
          if (!Number.isFinite(left) || !Number.isFinite(right)) throw new Error('Decoded audio contains non-finite samples');
          leftMin = Math.min(leftMin, left); leftMax = Math.max(leftMax, left); rightMin = Math.min(rightMin, right); rightMax = Math.max(rightMax, right); leftSquare += left * left; rightSquare += right * right; binCount += 1;
          if (total % 32768 === 0) checkpoint();
          ringLeft[total % FFT] = left; ringRight[total % FFT] = right; total += 1;
          if (binCount === BIN) flush();
          if (total >= FFT && (total - FFT) % HOP === 0) {
            for (let index = 0; index < FFT; index += 1) { windowLeft[index] = ringLeft[(total + index) % FFT]!; windowRight[index] = ringRight[(total + index) % FFT]!; }
            const magnitudeLeft = audioSpectrum(windowLeft), magnitudeRight = audioSpectrum(windowRight), magnitudes = magnitudeLeft.map((value, index) => Math.hypot(value, magnitudeRight[index]!) / Math.SQRT2);
            let onset = 0;
            for (let index = 1; index < magnitudes.length; index += 1) { onset += Math.max(0, magnitudes[index]! - previous[index]!); previous[index] = magnitudes[index]!; }
            flux.push(onset / magnitudes.length);
            for (let band = 0; band < BANDS; band += 1) {
              const first = Math.max(1, Math.ceil(edges[band]! / RATE * FFT)), last = Math.min(FFT / 2, Math.max(first, Math.ceil(edges[band + 1]! / RATE * FFT) - 1));
              let energy = 0; for (let index = first; index <= last; index += 1) energy += magnitudes[index]! ** 2;
              spectrum.push(Math.max(-120, Math.min(0, 10 * Math.log10(Math.max(1e-12, energy / Math.max(1, last - first + 1))))));
            }
          }
        }
      }
      flush();
    } finally { await handle.close(); }
    checkpoint();
    const waveform: WaveformLevel[] = [{ samplesPerBin: BIN, values }];
    let previousCounts = counts;
    while (waveform.at(-1)!.values.length > 6) {
      checkpoint(); const previousLevel = waveform.at(-1)!, next: number[] = [], nextCounts: number[] = [];
      for (let index = 0; index < previousCounts.length; index += 2) {
        const a = index * 6, b = a + 6, firstCount = previousCounts[index]!, secondCount = previousCounts[index + 1] ?? 0, count = firstCount + secondCount;
        for (const channel of [0, 3]) next.push(Math.min(previousLevel.values[a + channel]!, secondCount ? previousLevel.values[b + channel]! : Infinity), Math.max(previousLevel.values[a + channel + 1]!, secondCount ? previousLevel.values[b + channel + 1]! : -Infinity), Math.sqrt((previousLevel.values[a + channel + 2]! ** 2 * firstCount + (secondCount ? previousLevel.values[b + channel + 2]! ** 2 * secondCount : 0)) / count));
        nextCounts.push(count);
      }
      waveform.push({ samplesPerBin: previousLevel.samplesPerBin * 2, values: next }); previousCounts = nextCounts;
    }
    const silence: AudioAnalysis['silence'] = [], threshold = 10 ** (options.silenceDb / 20);
    let silentStart: number | undefined;
    for (let index = 0; index <= counts.length; index += 1) {
      const quiet = index < counts.length && Math.max(values[index * 6 + 2]!, values[index * 6 + 5]!) <= threshold;
      if (quiet && silentStart === undefined) silentStart = index * BIN / RATE;
      if (!quiet && silentStart !== undefined) { const end = Math.min(duration, index * BIN / RATE); if (end - silentStart >= options.silenceDuration) silence.push({ start: options.start + silentStart, end: options.start + end }); silentStart = undefined; }
    }
    const onsets = analyzeOnsets(flux, options.start + FFT / RATE / 2, Math.max(0, duration - FFT / RATE / 2), options.minimumBpm, options.maximumBpm);
    checkpoint();
    return { version: 1, sourceSha256: hash.digest('hex'), start: options.start, duration, requestedDuration: options.duration, sampleRate: RATE, samples, waveform, spectrum: { fftSize: FFT, hopSamples: HOP, frequencies: edges.slice(0, -1).map((value, index) => Math.sqrt(value * edges[index + 1]!)), values: spectrum }, silence, ...onsets, warnings: ['Tempo and beats are estimates on a fixed-tempo grid; review them before synchronizing edits.', 'Analysis is resampled to 16 kHz. Spectrum is limited to 8 kHz; waveform peaks are analysis-sample peaks, not delivery true peaks.', ...(duration >= options.duration - 1 / RATE ? ['The requested analysis window was filled. Analyze subsequent windows for longer sources.'] : [])] };
  } finally {
    // mkdtemp returns the exact owned directory, never an input-derived path.
    const relative = path.relative(os.tmpdir(), directory);
    if (!(relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(directory).startsWith('genmotion-analysis-'))) await rm(directory, { recursive: true, force: true });
  }
}
