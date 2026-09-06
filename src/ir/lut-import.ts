import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolveProjectAsset } from './loader.js';
import { parseCubeLut, type CubeImportOptions } from '../engine/lut.js';
import type { GenmotionProject } from './schema.js';

/** Preserve imported text as an immutable project-local source before returning compiled values. */
export async function importCubeLut(projectDir: string, text: string, options: Omit<CubeImportOptions, 'sourcePath'>) {
  if (Buffer.byteLength(text) > 32 * 1024 ** 2) throw new Error('CUBE input exceeds 32 MiB');
  const sha256 = createHash('sha256').update(text).digest('hex'), relative = `.genmotion/luts/${sha256}.cube`;
  const lut = parseCubeLut(text, { ...options, sourcePath: relative });
  const directory = resolveProjectAsset(projectDir, '.genmotion/luts'); await mkdir(directory, { recursive: true });
  const destination = resolveProjectAsset(projectDir, relative), staging = resolveProjectAsset(directory, '.' + randomUUID() + '.tmp');
  try {
    await writeFile(staging, text, { flag: 'wx' });
    try { await link(staging, destination); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (createHash('sha256').update(await readFile(destination)).digest('hex') !== sha256) throw new Error('Existing content-addressed LUT is corrupt');
    }
  } finally { await rm(staging, { force: true }); }
  delete lut.data;
  return lut;
}

export async function prepareLutSources(project: GenmotionProject, projectDir: string): Promise<void> {
  const effects = [...project.scenes, ...project.compositions].flatMap((container) => [...(container.effects ?? []), ...container.layers.flatMap((layer) => layer.effects ?? [])]);
  const sources = new Map<string, string>();
  let totalSamples = 0;
  for (const effect of effects) {
    const lut = effect.lut;
    if (!lut) continue;
    if (!lut.source) { totalSamples += lut.data?.length ?? 0; if (totalSamples * 8 > 256 * 1024 ** 2) throw new Error('Compiled LUT data exceeds the 256 MiB project budget'); continue; }
    try {
      const file = resolveProjectAsset(projectDir, lut.source.path);
      let text = sources.get(file);
      if (text === undefined) { if ((await stat(file)).size > 32 * 1024 ** 2) throw new Error('LUT source exceeds 32 MiB'); text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(file)); sources.set(file, text); }
      if (createHash('sha256').update(text).digest('hex') !== lut.source.sha256) throw new Error('Imported LUT source hash changed; explicitly reimport the source');
      const parsed = parseCubeLut(text, { inputColorSpace: lut.inputColorSpace, outputColorSpace: lut.outputColorSpace, interpolation: lut.interpolation });
      if (parsed.kind !== lut.kind || parsed.size !== lut.size || JSON.stringify(parsed.domainMin) !== JSON.stringify(lut.domainMin) || JSON.stringify(parsed.domainMax) !== JSON.stringify(lut.domainMax) || (lut.data && parsed.data!.some((value, index) => value !== lut.data![index]))) throw new Error('Compiled LUT differs from its declared source');
      lut.data = parsed.data!; totalSamples += lut.data.length;
      if (totalSamples * 8 > 256 * 1024 ** 2) throw new Error('Compiled LUT data exceeds the 256 MiB project budget');
    } catch (error) { throw new Error(`${lut.source.path}: ${error instanceof Error ? error.message : String(error)}`); }
  }
}
