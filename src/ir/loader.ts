import { prepareLutSources } from './lut-import.js';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { GenmotionError } from '../errors.js';
import { projectSchema, type GenmotionProject, type Parameter } from './schema.js';
import { compileProjectMotions } from '../engine/motion.js';
import { loadMotionLibraries } from '../catalog/custom.js';
import { resolveParameters, validateParameterValue, type ParameterValue } from './parameters.js';

export interface LoadedProject {
  project: GenmotionProject;
  sourceProject: GenmotionProject;
  projectDir: string;
  projectFile: string;
  parameterDependencies?: Array<{ path: string; sha256: string; bytes: number }>;
  dataDependencies?: Array<{ id: string; parameterId: string; sha256: string; bytes: number }>;
}

export async function findProjectFile(input: string): Promise<string> {
  const resolved = path.resolve(input);
  const extension = path.extname(resolved).toLowerCase();
  if (extension === '.json' || extension === '.yaml' || extension === '.yml') return resolved;

  for (const name of ['genmotion.json', 'genmotion.yaml', 'genmotion.yml']) {
    const candidate = path.join(resolved, name);
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // Continue to the next supported project filename.
    }
  }
  throw new GenmotionError('PROJECT_NOT_FOUND', `No genmotion.json, genmotion.yaml, or genmotion.yml found in ${resolved}`);
}

export async function loadProject(input: string, parameterOverrides: Record<string, ParameterValue> = {}): Promise<LoadedProject> {
  const projectFile = await findProjectFile(input);
  await verifyBundleIfPresent(projectFile);
  let raw: unknown;
  try {
    const content = await readFile(projectFile, 'utf8');
    raw = path.extname(projectFile).toLowerCase() === '.json' ? JSON.parse(content) : YAML.parse(content);
  } catch (error) {
    throw new GenmotionError('PROJECT_READ_FAILED', `Could not read ${projectFile}`, error);
  }
  return loadProjectDocument(raw, projectFile, parameterOverrides);
}

export async function verifyBundleIfPresent(projectFile: string): Promise<boolean> {
  const directory = path.dirname(path.resolve(projectFile));
  try { await stat(resolveProjectAsset(directory, 'genmotion.manifest.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  const { verifyProjectBundle } = await import('./bundle.js');
  const manifest = await verifyProjectBundle(directory);
  if (path.basename(projectFile) !== manifest.project) throw new GenmotionError('BUNDLE_PROJECT_MISMATCH', 'Load the project document named by the bundle manifest.');
  return true;
}

/** Compile an in-memory document using the same catalog and parameter rules as disk loading. */
export async function loadProjectDocument(raw: unknown, projectFile: string, parameterOverrides: Record<string, ParameterValue> = {}): Promise<LoadedProject> {
  projectFile = path.resolve(projectFile);
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GenmotionError('PROJECT_INVALID', `Invalid Genmotion project: ${projectFile}`, parsed.error.issues);
  }
  const projectDir = path.dirname(projectFile);
  const catalog = await loadMotionLibraries(projectDir);
  const resolved = resolveParameters(parsed.data, parameterOverrides);
  const references = new Set<string>();
  const collect = (definition: Parameter, value: ParameterValue): void => {
    if (value === null) return;
    if (['file', 'asset', 'font'].includes(definition.type) && typeof value === 'string') references.add(value);
    if (definition.type === 'array' && definition.items && Array.isArray(value)) for (const item of value) collect(definition.items, item);
    if (definition.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(definition.properties ?? {})) collect(child, value[key]!);
    }
  };
  for (const definition of resolved.parameters) collect(definition, resolved.parameterValues[definition.id]!);
  for (const composition of resolved.compositions) for (const definition of composition.parameters ?? []) collect(definition, validateParameterValue(definition, definition.default));
  for (const container of [...resolved.scenes, ...resolved.compositions]) for (const layer of container.layers) {
    if (layer.type !== 'composition') continue;
    const definition = resolved.compositions.find((composition) => composition.id === layer.compositionId);
    for (const parameter of definition?.parameters ?? []) {
      const value = layer.parameterValues && Object.hasOwn(layer.parameterValues, parameter.id) ? layer.parameterValues[parameter.id]! : parameter.default;
      collect(parameter, validateParameterValue(parameter, value));
    }
  }
  const parameterDependencies = [];
  for (const reference of [...references].sort()) {
    const content = await readFile(resolveProjectAsset(projectDir, reference));
    parameterDependencies.push({ path: reference, sha256: createHash('sha256').update(content).digest('hex'), bytes: content.length });
  }
  const project = compileProjectMotions(resolved, catalog.motions);
  await prepareLutSources(project, projectDir);
  const dataDependencies = (parsed.data.dataSources ?? []).map(source => ({ id: source.id, parameterId: source.parameterId, sha256: source.valueHash, bytes: Buffer.byteLength(JSON.stringify(source.value)) }));
  return { project, sourceProject: parsed.data, projectDir, projectFile, parameterDependencies, dataDependencies };
}

function canonicalFuturePath(target: string): string {
  let cursor = target;
  const suffix: string[] = [];
  for (;;) {
    try { return path.join(realpathSync.native(cursor), ...suffix.reverse()); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        if (lstatSync(cursor).isSymbolicLink()) throw new GenmotionError('ASSET_OUTSIDE_PROJECT', 'Cannot establish confinement through a dangling symlink or junction.');
      } catch (linkError) { if ((linkError as NodeJS.ErrnoException).code !== 'ENOENT') throw linkError; }
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      suffix.push(path.basename(cursor)); cursor = parent;
    }
  }
}

export function resolveProjectAsset(projectDir: string, assetPath: string): string {
  if (/^https?:\/\//i.test(assetPath)) {
    throw new GenmotionError('REMOTE_ASSET_FORBIDDEN', `Freeze remote assets locally before rendering: ${assetPath}`);
  }
  const root = path.resolve(projectDir);
  const resolved = path.resolve(root, assetPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GenmotionError('ASSET_OUTSIDE_PROJECT', `Asset must stay inside the project directory: ${assetPath}`);
  }
  const canonicalRoot = canonicalFuturePath(root);
  const canonicalAsset = canonicalFuturePath(resolved);
  const canonicalRelative = path.relative(canonicalRoot, canonicalAsset);
  if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) {
    throw new GenmotionError('ASSET_OUTSIDE_PROJECT', `Asset symlink or junction escapes the project directory: ${assetPath}`);
  }
  return resolved;
}
