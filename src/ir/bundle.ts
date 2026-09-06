import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { z } from 'zod';
import { loadProject, resolveProjectAsset, type LoadedProject } from './loader.js';
import { projectSchema, type Parameter, type ParameterValue } from './schema.js';
import { throwIfAborted } from '../engine/process.js';
import { GENMOTION_VERSION } from '../version.js';
import { GenmotionError } from '../errors.js';
import { hasErrors, validateProject } from './validate.js';

const manifestEntrySchema = z.object({ path: z.string().min(1).max(2048), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
export const bundleManifestSchema = z.object({
  version: z.literal(1), id: z.string().regex(/^[a-f0-9]{64}$/), engineVersion: z.string().min(1),
  project: z.literal('genmotion.json'), files: z.array(manifestEntrySchema).min(1).max(10000),
}).strict();
export type BundleManifest = z.infer<typeof bundleManifestSchema>;
export interface BundleOptions { signal?: AbortSignal; maxBytes?: number; maxFiles?: number }
const manifestName = 'genmotion.manifest.json';

function portablePath(value: string): string {
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  if (normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized) || /^[a-z]:/i.test(normalized)) throw new GenmotionError('BUNDLE_PATH_INVALID', 'Bundle dependency paths must remain inside the project.');
  return normalized;
}
async function digestFile(file: string, signal?: AbortSignal, limit = Number.MAX_SAFE_INTEGER): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256'); let bytes = 0;
  const stream = createReadStream(file, { highWaterMark: 1024 * 1024, ...(signal ? { signal } : {}) });
  for await (const chunk of stream) { throwIfAborted(signal); const buffer = chunk as Buffer; bytes += buffer.length; if (bytes > limit) { stream.destroy(); throw new GenmotionError('BUNDLE_INTEGRITY_FAILED', 'Dependency exceeds its recorded size.'); } hash.update(buffer); }
  return { sha256: hash.digest('hex'), bytes };
}
function identity(manifest: Omit<BundleManifest, 'id'>): string {
  const canonical = { version: manifest.version, engineVersion: manifest.engineVersion, project: manifest.project, files: manifest.files.map((entry) => ({ path: entry.path, sha256: entry.sha256, bytes: entry.bytes })) };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

async function copyDependency(source: string, target: string, limit: number, signal?: AbortSignal) {
  const hash = createHash('sha256'); let bytes = 0;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > limit) { callback(new GenmotionError('BUNDLE_LIMIT', 'Dependency exceeded the remaining byte budget.')); return; }
    hash.update(chunk); callback(null, chunk);
  } });
  await pipeline(createReadStream(source, { highWaterMark: 1024 * 1024 }), meter, createWriteStream(target, { flags: 'wx' }), signal ? { signal } : {});
  return { bytes, sha256: hash.digest('hex') };
}

export async function verifyProjectBundle(directory: string, options: BundleOptions = {}): Promise<BundleManifest> {
  throwIfAborted(options.signal);
  const file = resolveProjectAsset(directory, manifestName);
  const metadata = await stat(file);
  if (metadata.size > 4 * 1024 * 1024) throw new GenmotionError('BUNDLE_MANIFEST_LIMIT', 'Bundle manifest exceeds 4 MiB.');
  const manifest = bundleManifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  const { id, ...payload } = manifest;
  if (id !== identity(payload)) throw new GenmotionError('BUNDLE_ID_MISMATCH', 'Bundle manifest content does not match its ID.');
  const names = manifest.files.map((entry) => portablePath(entry.path));
  if (new Set(names.map((name) => process.platform === 'win32' ? name.toLowerCase() : name)).size !== names.length || !names.includes(manifest.project) || names.includes(manifestName)) throw new GenmotionError('BUNDLE_MANIFEST_INVALID', 'Bundle entries must be unique and include the project document.');
  const maxBytes = options.maxBytes ?? 32 * 1024 ** 3;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || options.maxFiles !== undefined && (!Number.isSafeInteger(options.maxFiles) || options.maxFiles < 1 || options.maxFiles > 10000)) throw new GenmotionError('BUNDLE_LIMIT', 'Invalid dependency budget.');
  if (manifest.files.length > (options.maxFiles ?? 10000) || manifest.files.reduce((sum, entry) => sum + entry.bytes, 0) > maxBytes) throw new GenmotionError('BUNDLE_LIMIT', 'Bundle exceeds the requested dependency budget.');
  for (const entry of manifest.files) {
    const target = resolveProjectAsset(directory, entry.path);
    if ((await stat(target)).size !== entry.bytes) throw new GenmotionError('BUNDLE_INTEGRITY_FAILED', `Bundle dependency changed: ${entry.path}`);
    const actual = await digestFile(target, options.signal, entry.bytes);
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) throw new GenmotionError('BUNDLE_INTEGRITY_FAILED', `Bundle dependency changed: ${entry.path}`);
  }
  const projectFile = resolveProjectAsset(directory, manifest.project);
  const project = projectSchema.parse(JSON.parse(await readFile(projectFile, 'utf8')));
  const { references } = await bundleSources({ project, sourceProject: project, projectFile, projectDir: directory });
  for (const name of references.keys()) if (!names.includes(name)) throw new GenmotionError('BUNDLE_DEPENDENCY_UNLISTED', `Dependency is absent from the manifest: ${name}`);
  return manifest;
}

async function bundleSources(loaded: LoadedProject) {
  const project = structuredClone(loaded.sourceProject);
  project.parameterValues = structuredClone(loaded.project.parameterValues);
  const references = new Map<string, string>();
  const aliases = new Map<string, string>();
  const asset = (reference: string): string => {
    const normalized = portablePath(reference);
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    const name = aliases.get(key) ?? normalized;
    if ([manifestName, 'genmotion.json'].includes(name.toLowerCase())) throw new GenmotionError('BUNDLE_RESERVED_PATH', 'A dependency conflicts with a reserved bundle document name.');
    const source = resolveProjectAsset(loaded.projectDir, reference);
    const previous = references.get(name);
    if (previous && (process.platform === 'win32' ? previous.toLowerCase() !== source.toLowerCase() : previous !== source)) throw new GenmotionError('BUNDLE_PATH_COLLISION', 'Two dependencies resolve to one bundle path.');
    references.set(name, source); aliases.set(key, name);
    if (references.size >= 10000) throw new GenmotionError('BUNDLE_LIMIT', 'Bundle has too many dependencies.');
    return name;
  };
  const defaults = (definition: Parameter): void => {
    if (definition.items) defaults(definition.items);
    for (const child of Object.values(definition.properties ?? {})) defaults(child);
    definition.default = parameter(definition, definition.default)!;
  };
  const parameter = (definition: Parameter, value: ParameterValue | undefined): ParameterValue | undefined => {
    if (value === undefined || value === null) return value;
    if (['file', 'asset', 'font'].includes(definition.type) && typeof value === 'string') return asset(value);
    if (definition.type === 'array' && definition.items && Array.isArray(value)) return value.map((item) => parameter(definition.items!, item)!);
    if (definition.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, definition.properties?.[key] ? parameter(definition.properties[key], item)! : item]));
    return value;
  };
  for (const font of project.brand.fonts) font.file = asset(font.file);
  for (const track of project.audio) track.src = asset(track.src);
  for (const shot of project.productionWorkflow?.shots ?? []) for (const reference of shot.references) reference.path = asset(reference.path);
  for (const stage of project.productionWorkflow?.stages ?? []) for (const evidence of stage.evidence) evidence.path = asset(evidence.path);
  for (const definition of project.parameters) {
    defaults(definition);
    if (Object.hasOwn(project.parameterValues, definition.id)) project.parameterValues[definition.id] = parameter(definition, project.parameterValues[definition.id])!;
    for (const variant of project.variants) if (Object.hasOwn(variant.values, definition.id)) variant.values[definition.id] = parameter(definition, variant.values[definition.id])!;
  }
  for (const container of [...project.scenes, ...project.compositions]) {
    for (const effect of [...(container.effects ?? []), ...container.layers.flatMap((layer) => layer.effects ?? [])]) if (effect.lut?.source) effect.lut.source.path = asset(effect.lut.source.path);
    if ('parameters' in container) for (const definition of container.parameters ?? []) defaults(definition);
    for (const layer of container.layers) {
      if (layer.type === 'image' || layer.type === 'video') layer.src = asset(layer.src);
      if (layer.type === 'image' && layer.sourceAnimation?.type === 'sequence') layer.sourceAnimation.frames = layer.sourceAnimation.frames.map(asset);
      if ((layer.type === 'text' || layer.type === 'caption') && layer.fontFile) layer.fontFile = asset(layer.fontFile);
      if (layer.type === 'composition' && layer.parameterValues) {
        const definition = project.compositions.find((item) => item.id === layer.compositionId);
        for (const input of definition?.parameters ?? []) if (Object.hasOwn(layer.parameterValues, input.id)) layer.parameterValues[input.id] = parameter(input, layer.parameterValues[input.id])!;
      }
    }
  }
  const libraryDirectory = resolveProjectAsset(loaded.projectDir, '.genmotion/motions');
  try { for (const file of (await readdir(libraryDirectory)).filter((name) => name.endsWith('.json')).sort()) asset('.genmotion/motions/' + file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return { project, references };
}

/** Export a source-editable project snapshot, including inactive parameter variants and local recipes. */
export async function createProjectBundle(loaded: LoadedProject, outputRoot: string, options: BundleOptions = {}): Promise<{ directory: string; manifest: BundleManifest; reused: boolean }> {
  throwIfAborted(options.signal);
  const maxBytes = options.maxBytes ?? 32 * 1024 ** 3, maxFiles = options.maxFiles ?? 10000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 10000) throw new GenmotionError('BUNDLE_LIMIT', 'Bundle budgets must be positive integers, with at most 10000 files.');
  const { project, references } = await bundleSources(loaded);
  if (references.size + 1 > maxFiles) throw new GenmotionError('BUNDLE_LIMIT', 'Bundle has too many dependencies.');
  const root = path.resolve(outputRoot); await mkdir(root, { recursive: true });
  const staging = resolveProjectAsset(root, '.bundle-' + randomUUID());
  await mkdir(staging);
  try {
    const document = JSON.stringify(project, null, 2) + '\n';
    let totalBytes = Buffer.byteLength(document);
    if (totalBytes > maxBytes) throw new GenmotionError('BUNDLE_LIMIT', 'Bundle exceeds its byte budget.');
    await writeFile(path.join(staging, 'genmotion.json'), document, { flag: 'wx' });
    const entries: BundleManifest['files'] = [{ path: 'genmotion.json', sha256: createHash('sha256').update(document).digest('hex'), bytes: totalBytes }];
    for (const [name, source] of [...references].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      throwIfAborted(options.signal);
      const before = await stat(source);
      if (!before.isFile() || totalBytes + before.size > maxBytes) throw new GenmotionError('BUNDLE_LIMIT', 'Dependency is not a file or exceeds the byte budget.');
      const target = resolveProjectAsset(staging, name); await mkdir(path.dirname(target), { recursive: true });
      const digest = await copyDependency(source, target, maxBytes - totalBytes, options.signal);
      const after = await stat(source);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new GenmotionError('BUNDLE_SOURCE_CHANGED', `Source changed during snapshot: ${name}`);
      totalBytes += digest.bytes;
      if (totalBytes > maxBytes) throw new GenmotionError('BUNDLE_LIMIT', 'Bundle exceeds its byte budget.');
      entries.push({ path: name, ...digest });
    }
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const payload = { version: 1 as const, engineVersion: GENMOTION_VERSION, project: 'genmotion.json' as const, files: entries };
    const manifest: BundleManifest = { id: identity(payload), ...payload };
    await writeFile(path.join(staging, manifestName), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await verifyProjectBundle(staging, options);
    const checked = await loadProject(staging);
    const findings = await validateProject(checked);
    if (hasErrors(findings)) throw new GenmotionError('BUNDLE_PROJECT_INVALID', 'Frozen project failed native preflight.', findings);
    const destination = resolveProjectAsset(root, manifest.id);
    throwIfAborted(options.signal);
    try { await rename(staging, destination); return { directory: destination, manifest, reused: false }; }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      const existing = await verifyProjectBundle(destination, options);
      if (existing.id !== manifest.id) throw new GenmotionError('BUNDLE_ID_MISMATCH', 'Existing bundle has the wrong identity.');
      return { directory: destination, manifest: existing, reused: true };
    }
  } finally { await rm(resolveProjectAsset(root, path.basename(staging)), { recursive: true, force: true }); }
}

export async function restoreProjectBundle(directory: string, destination: string, options: BundleOptions = {}): Promise<{ directory: string; sourceBundle: string }> {
  const manifest = await verifyProjectBundle(directory, options);
  const target = path.resolve(destination), parent = path.dirname(target);
  try { await stat(target); throw new GenmotionError('BUNDLE_DESTINATION_EXISTS', 'Restore requires a new directory.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(parent, { recursive: true });
  const staging = resolveProjectAsset(parent, '.bundle-restore-' + randomUUID());
  await mkdir(staging);
  try {
    for (const entry of manifest.files) {
      throwIfAborted(options.signal);
      const output = resolveProjectAsset(staging, entry.path); await mkdir(path.dirname(output), { recursive: true });
      const copied = await copyDependency(resolveProjectAsset(directory, entry.path), output, entry.bytes, options.signal);
      if (copied.sha256 !== entry.sha256 || copied.bytes !== entry.bytes) throw new GenmotionError('BUNDLE_INTEGRITY_FAILED', 'A dependency changed during restore.');
    }
    await loadProject(staging);
    throwIfAborted(options.signal);
    await rename(staging, resolveProjectAsset(parent, path.basename(target)));
    return { directory: target, sourceBundle: manifest.id };
  } finally { await rm(resolveProjectAsset(parent, path.basename(staging)), { recursive: true, force: true }); }
}
