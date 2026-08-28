import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { motionRecipes } from './motions.js';
import type { MotionRecipe } from './types.js';

const ease = z.enum(['linear', 'sine-in-out', 'cubic-out', 'expo-out', 'back-out', 'cubic-in']);
const keyframe = z.object({ at: z.number().min(0).max(1), value: z.number().finite(), ease: ease.optional(), scaleWithIntensity: z.boolean().optional() }).strict();
const trackArray = z.array(keyframe).min(2);
const tracksSchema = z.object({ x: trackArray.optional(), y: trackArray.optional(), scaleX: trackArray.optional(), scaleY: trackArray.optional(), rotation: trackArray.optional(), opacity: trackArray.optional(), blur: trackArray.optional() }).strict();
const customMotionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), title: z.string().min(1).max(100),
  roles: z.array(z.string().min(1).max(50)).min(1).max(12),
  energy: z.array(z.enum(['restrained', 'balanced', 'energetic', 'cinematic'])).min(1),
  signature: z.string().min(1).max(300), duration: z.tuple([z.number().positive(), z.number().positive()]),
  incompatibleWith: z.array(z.string()).default([]), cost: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).default(2),
  accessibility: z.array(z.string().min(1)).min(1),
  tracks: tracksSchema.refine((tracks) => Object.keys(tracks).length > 0, 'At least one animated track is required.'),
  effect: z.enum(['shape-progress', 'text-words', 'text-characters', 'numeric-count']).optional(),
}).strict().refine((motion) => motion.duration[1] >= motion.duration[0], { message: 'duration maximum must be greater than or equal to its minimum.' }).refine((motion) => Object.values(motion.tracks).filter((frames) => frames !== undefined).every((frames) => frames.every((frame, index) => index === 0 || frame.at > frames[index - 1]!.at)), { message: 'Track keyframes must use strictly increasing at values.' });

export const customMotionLibrarySchema = z.object({
  schemaVersion: z.literal(1), id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), title: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), motions: z.array(customMotionSchema).min(1, 'Add at least one motion.').max(100),
}).strict().refine((library) => new Set(library.motions.map((motion) => motion.id)).size === library.motions.length, { message: 'Motion ids must be unique within a library.' });

export type CustomMotionLibrary = z.infer<typeof customMotionLibrarySchema>;
export interface MotionLibrarySummary { id: string; title: string; version: string; motions: number; filename: string }

export function compileCustomLibrary(input: unknown): { library: CustomMotionLibrary; recipes: MotionRecipe[] } {
  const library = customMotionLibrarySchema.parse(input);
  const recipes: MotionRecipe[] = library.motions.map((motion) => {
    const { effect, ...required } = motion;
    const tracks = Object.fromEntries(Object.entries(motion.tracks).filter((entry) => entry[1] !== undefined)) as NonNullable<MotionRecipe['tracks']>;
    const semanticProperty = effect === 'shape-progress' || effect === 'numeric-count' ? 'progress' : effect === 'text-characters' || effect === 'text-words' ? 'reveal' : undefined;
    return {
      ...required, tracks, id: `${library.id}:${motion.id}`, properties: [...Object.keys(motion.tracks).map((key) => key === 'scaleX' || key === 'scaleY' ? 'scale' : key), ...(semanticProperty ? [semanticProperty] : [])] as MotionRecipe['properties'],
      incompatibleWith: motion.incompatibleWith.map((id) => id.includes(':') ? id : `${library.id}:${id}`), source: 'custom', libraryId: library.id, libraryTitle: library.title,
      ...(effect ? { effect } : {}),
    };
  });
  const builtIns = new Set(motionRecipes.map((recipe) => recipe.id));
  if (recipes.some((recipe) => builtIns.has(recipe.id))) throw new Error('Custom motion id collides with a built-in motion.');
  return { library, recipes };
}

export async function loadMotionLibraries(projectDir: string): Promise<{ motions: MotionRecipe[]; libraries: MotionLibrarySummary[] }> {
  const directory = path.join(projectDir, '.genmotion', 'motions');
  let files: string[] = [];
  try { files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort(); } catch { return { motions: [...motionRecipes], libraries: [] }; }
  const custom: MotionRecipe[] = [];
  const libraries: MotionLibrarySummary[] = [];
  const ids = new Set(motionRecipes.map((recipe) => recipe.id));
  for (const filename of files) {
    const parsed = compileCustomLibrary(JSON.parse(await readFile(path.join(directory, filename), 'utf8')));
    for (const recipe of parsed.recipes) {
      if (ids.has(recipe.id)) throw new Error(`Duplicate motion recipe ${recipe.id}.`);
      ids.add(recipe.id); custom.push(recipe);
    }
    libraries.push({ id: parsed.library.id, title: parsed.library.title, version: parsed.library.version, motions: parsed.library.motions.length, filename });
  }
  return { motions: [...motionRecipes, ...custom], libraries };
}

export async function saveMotionLibrary(projectDir: string, input: unknown): Promise<MotionLibrarySummary> {
  const { library } = compileCustomLibrary(input);
  const directory = path.join(projectDir, '.genmotion', 'motions');
  await mkdir(directory, { recursive: true });
  const filename = `${library.id}.json`;
  const target = path.join(directory, filename);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(library, null, 2)}\n`);
  await rename(temporary, target);
  return { id: library.id, title: library.title, version: library.version, motions: library.motions.length, filename };
}
