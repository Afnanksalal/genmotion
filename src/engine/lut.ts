import { createHash } from 'node:crypto';
import { lookupTableSchema, type LookupTable } from '../ir/lut.js';

export interface CubeImportOptions {
  inputColorSpace: LookupTable['inputColorSpace']; outputColorSpace: LookupTable['outputColorSpace'];
  interpolation?: LookupTable['interpolation']; sourcePath?: string;
}
/** Adobe Cube 1.0 table layout, with explicit native resource limits. */
export function parseCubeLut(source: string, options: CubeImportOptions): LookupTable {
  if (Buffer.byteLength(source) > 32 * 1024 ** 2) throw new Error('CUBE input exceeds 32 MiB');
  const seen = new Set<string>(), data: number[] = [];
  let kind: '1d' | '3d' | undefined, size = 0, title: string | undefined, domainMin = [0, 0, 0], domainMax = [1, 1, 1], started = false;
  const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  const numbers = (line: string): number[] => {
    const values = line.trim().split(/\s+/);
    if (values.length !== 3 || values.some((value) => !numeric.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1e37)) throw new Error('Expected three finite decimal CUBE components');
    return values.map(Number);
  };
  for (const [index, raw] of source.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).entries()) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    try {
      const keyword = /^[A-Z][A-Z0-9_]*/.exec(line)?.[0];
      if (keyword) {
        if (started) throw new Error('CUBE headers must precede table data');
        if (seen.has(keyword)) throw new Error(`Repeated CUBE keyword ${keyword}`); seen.add(keyword);
        const value = line.slice(keyword.length).trim();
        if (keyword === 'TITLE') { const match = /^"([^"\r\n]*)"$/.exec(value); if (!match) throw new Error('CUBE title must be quoted'); title = match[1]; }
        else if (keyword === 'DOMAIN_MIN') domainMin = numbers(value);
        else if (keyword === 'DOMAIN_MAX') domainMax = numbers(value);
        else if (keyword === 'LUT_1D_SIZE' || keyword === 'LUT_3D_SIZE') {
          if (kind) throw new Error('Combined shaper/3D CUBE files are not supported');
          kind = keyword === 'LUT_1D_SIZE' ? '1d' : '3d';
          if (!/^\d+$/.test(value)) throw new Error('CUBE size must be an integer'); size = Number(value);
          if (size < 2 || size > (kind === '1d' ? 65536 : 65)) throw new Error('CUBE size exceeds the native 1D/3D limits');
        } else throw new Error(`Unsupported CUBE keyword ${keyword}`);
      } else {
        if (!kind) throw new Error('CUBE size must precede table data'); started = true;
        if (data.length >= (kind === '1d' ? size : size ** 3) * 3) throw new Error('CUBE contains extra table rows');
        data.push(...numbers(line));
      }
    } catch (error) { throw new Error(`CUBE line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (!kind) throw new Error('CUBE size header is missing');
  return lookupTableSchema.parse({ version: 1, kind, size, ...(title ? { title } : {}), domainMin, domainMax, data, interpolation: options.interpolation ?? 'tetrahedral', inputColorSpace: options.inputColorSpace, outputColorSpace: options.outputColorSpace, ...(options.sourcePath ? { source: { path: options.sourcePath, sha256: createHash('sha256').update(source).digest('hex') } } : {}) });
}

/** Returns unclipped RGB; the caller owns output color-space conversion and delivery clipping. */
export function sampleLookupTable(lut: LookupTable, input: readonly [number, number, number]): [number, number, number] {
  const data = lut.data; if (!data) throw new Error('Load the project to prepare its frozen LUT source before rendering');
  const position = input.map((value, channel) => Math.max(0, Math.min(1, (value - lut.domainMin[channel]!) / (lut.domainMax[channel]! - lut.domainMin[channel]!))) * (lut.size - 1));
  if (!position.every(Number.isFinite)) throw new Error('LUT input must be finite');
  if (lut.kind === '1d') return position.map((value, channel) => { const low = Math.floor(value), high = Math.min(lut.size - 1, low + 1), fraction = value - low; return data[low * 3 + channel]! * (1 - fraction) + data[high * 3 + channel]! * fraction; }) as [number, number, number];
  const base = position.map((value) => Math.min(lut.size - 2, Math.floor(value))), fraction = position.map((value, channel) => value - base[channel]!);
  const read = (r: number, g: number, b: number, channel: number): number => data[(r + g * lut.size + b * lut.size * lut.size) * 3 + channel]!;
  const output: [number, number, number] = [0, 0, 0];
  if (lut.interpolation === 'trilinear') {
    for (let b = 0; b < 2; b += 1) for (let g = 0; g < 2; g += 1) for (let r = 0; r < 2; r += 1) {
      const weight = (r ? fraction[0]! : 1 - fraction[0]!) * (g ? fraction[1]! : 1 - fraction[1]!) * (b ? fraction[2]! : 1 - fraction[2]!);
      for (let channel = 0; channel < 3; channel += 1) output[channel]! += read(base[0]! + r, base[1]! + g, base[2]! + b, channel) * weight;
    }
  } else {
    const order = [0, 1, 2].sort((left, right) => fraction[right]! - fraction[left]!), corner = [...base];
    for (let channel = 0; channel < 3; channel += 1) output[channel] = read(corner[0]!, corner[1]!, corner[2]!, channel);
    for (const axis of order) {
      const previous = [read(corner[0]!, corner[1]!, corner[2]!, 0), read(corner[0]!, corner[1]!, corner[2]!, 1), read(corner[0]!, corner[1]!, corner[2]!, 2)];
      corner[axis]! += 1;
      for (let channel = 0; channel < 3; channel += 1) output[channel]! += (read(corner[0]!, corner[1]!, corner[2]!, channel) - previous[channel]!) * fraction[axis]!;
    }
  }
  return output;
}
