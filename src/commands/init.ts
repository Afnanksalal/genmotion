import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { briefSchema, type CreativeBrief } from '../creative/types.js';
import { createConcepts } from '../creative/planner.js';
import { composeProject } from '../creative/compose.js';

export interface InitOptions { title: string; promise: string; proof: string; desiredAction: string; audience: string; mode: CreativeBrief['mode']; duration: number }

export async function initializeProject(directory: string, options: InitOptions): Promise<{ directory: string; projectFile: string; briefFile: string }> {
  const target = path.resolve(directory);
  await mkdir(path.join(target, 'assets'), { recursive: true });
  const id = path.basename(target).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'genmotion-project';
  const brief = briefSchema.parse({
    id,
    title: options.title,
    mode: options.mode,
    audience: options.audience,
    promise: options.promise,
    proof: [options.proof],
    desiredAction: options.desiredAction,
    duration: options.duration,
    energy: options.mode === 'launch' ? 'energetic' : options.mode === 'pitch' ? 'cinematic' : 'balanced',
    brand: { background: '#0b0d10', foreground: '#f5f7fa', accent: '#59e3a6', muted: '#a3abb8', primaryFont: 'Arial', displayFont: 'Arial', tone: ['clear', 'confident', 'human'] },
    requiredScenes: [], forbiddenClaims: [], assets: [],
  });
  const ranked = await createConcepts(brief, { count: 6 });
  const selected = ranked[0];
  if (!selected) throw new Error('The creative planner returned no concepts.');
  const project = composeProject(brief, selected.concept);
  const briefFile = path.join(target, 'brief.json');
  const projectFile = path.join(target, 'genmotion.json');
  await Promise.all([
    writeFile(briefFile, `${JSON.stringify(brief, null, 2)}\n`, { flag: 'wx' }),
    writeFile(projectFile, `${JSON.stringify(project, null, 2)}\n`, { flag: 'wx' }),
  ]);
  return { directory: target, projectFile, briefFile };
}
