import { createHash } from 'node:crypto';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import type { LoadedProject } from '../ir/loader.js';
import { resolveParameters } from '../ir/parameters.js';
import type { ParameterValue } from '../ir/schema.js';
import { renderFrame } from './draw.js';

export interface ComparisonCandidate { id: string; label: string; values: Record<string, ParameterValue> }
export async function compareNativeVariants(loaded: LoadedProject, candidates: ComparisonCandidate[], times: number[], maximumFrames = 64) {
  if (!candidates.length || candidates.length > 16) throw new Error('Variant comparison requires 1 through 16 candidates.');
  if (!times.length || times.some(time => !Number.isFinite(time) || time < 0)) throw new Error('Comparison times must be nonnegative and finite.');
  const selected = times.slice(0, maximumFrames), truncated = times.length > selected.length, width = loaded.project.width, height = loaded.project.height;
  const baseline = await Promise.all(selected.map(async time => { const pixels = await renderFrame(loaded.project, loaded.projectDir, time * loaded.project.fps); return { time, pixels, sha256: createHash('sha256').update(pixels).digest('hex') }; }));
  const results = [];
  for (const candidate of candidates) {
    try {
      const project = resolveParameters(loaded.sourceProject, candidate.values), frames = [];
      for (const base of baseline) {
        const pixels = await renderFrame(project, loaded.projectDir, base.time * project.fps); let sum = 0;
        for (let index = 0; index < pixels.length; index += 4) sum += Math.abs(pixels[index]! - base.pixels[index]!) + Math.abs(pixels[index + 1]! - base.pixels[index + 1]!) + Math.abs(pixels[index + 2]! - base.pixels[index + 2]!) + Math.abs(pixels[index + 3]! - base.pixels[index + 3]!);
        frames.push({ time: base.time, pixels, sha256: createHash('sha256').update(pixels).digest('hex'), meanAbsoluteError: sum / pixels.length });
      }
      results.push({ id: candidate.id, label: candidate.label, settings: structuredClone(candidate.values), status: truncated ? 'truncated' as const : 'complete' as const, frames });
    } catch (error) { results.push({ id: candidate.id, label: candidate.label, settings: structuredClone(candidate.values), status: 'failed' as const, reason: error instanceof Error ? error.message : String(error), frames: [] }); }
  }
  const columns = candidates.length + 1, sheet = createCanvas(width * columns, height * selected.length), context = sheet.getContext('2d');
  for (const [row, base] of baseline.entries()) { context.putImageData(new ImageData(new Uint8ClampedArray(base.pixels), width, height), 0, row * height); for (const [column, result] of results.entries()) { const frame = result.frames[row]; if (frame) context.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), width, height), (column + 1) * width, row * height); } }
  const withoutPixels = <T extends { pixels: Buffer }>(item: T): Omit<T, 'pixels'> => { const { pixels, ...rest } = item; void pixels; return rest; };
  return { version: 1 as const, sourceHash: createHash('sha256').update(JSON.stringify(loaded.sourceProject)).digest('hex'), times: selected, omittedTimes: times.length - selected.length, layout: { columns, rows: selected.length, cellWidth: width, cellHeight: height, labels: ['Original', ...candidates.map(item => item.label)] }, baseline: baseline.map(withoutPixels), candidates: results.map(result => ({ ...result, frames: result.frames.map(withoutPixels) })), sheet: sheet.toBuffer('image/png') };
}
