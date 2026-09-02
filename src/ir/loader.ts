import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { GenmotionError } from '../errors.js';
import { projectSchema, type GenmotionProject } from './schema.js';
import { compileProjectMotions } from '../engine/motion.js';
import { loadMotionLibraries } from '../catalog/custom.js';
import { resolveParameters, type ParameterValue } from './parameters.js';

export interface LoadedProject {
  project: GenmotionProject;
  sourceProject: GenmotionProject;
  projectDir: string;
  projectFile: string;
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
  let raw: unknown;
  try {
    const content = await readFile(projectFile, 'utf8');
    raw = path.extname(projectFile).toLowerCase() === '.json' ? JSON.parse(content) : YAML.parse(content);
  } catch (error) {
    throw new GenmotionError('PROJECT_READ_FAILED', `Could not read ${projectFile}`, error);
  }
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GenmotionError('PROJECT_INVALID', `Invalid Genmotion project: ${projectFile}`, parsed.error.issues);
  }
  const projectDir = path.dirname(projectFile);
  const catalog = await loadMotionLibraries(projectDir);
  return { project: compileProjectMotions(resolveParameters(parsed.data, parameterOverrides), catalog.motions), sourceProject: parsed.data, projectDir, projectFile };
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
  try {
    const canonicalRoot = realpathSync.native(root);
    const canonicalAsset = realpathSync.native(resolved);
    const canonicalRelative = path.relative(canonicalRoot, canonicalAsset);
    if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) {
      throw new GenmotionError('ASSET_OUTSIDE_PROJECT', `Asset symlink or junction escapes the project directory: ${assetPath}`);
    }
  } catch (error) {
    if (error instanceof GenmotionError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return resolved;
}
