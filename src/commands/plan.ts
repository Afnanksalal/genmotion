import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { briefSchema } from '../creative/types.js';
import { createConcepts } from '../creative/planner.js';
import { composeProject } from '../creative/compose.js';
import { loadProviderConfig } from '../creative/provider.js';

export async function planProject(projectDirInput: string, briefFileInput: string, count = 8): Promise<{ conceptsFile: string; projectFile: string; selectedScore: number }> {
  const projectDir = path.resolve(projectDirInput);
  const briefFile = path.resolve(briefFileInput);
  const brief = briefSchema.parse(JSON.parse(await readFile(briefFile, 'utf8')));
  const provider = await loadProviderConfig(projectDir);
  const ranked = await createConcepts(brief, provider ? { count, provider } : { count });
  const selected = ranked[0];
  if (!selected) throw new Error('No valid concepts were generated.');
  const project = composeProject(brief, selected.concept);
  const stateDir = path.join(projectDir, '.genmotion');
  await mkdir(stateDir, { recursive: true });
  const conceptsFile = path.join(stateDir, 'concepts.json');
  const projectFile = path.join(projectDir, 'genmotion.json');
  await Promise.all([
    writeFile(conceptsFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), brief: brief.id, selected: selected.concept.id, concepts: ranked }, null, 2)}\n`),
    writeFile(projectFile, `${JSON.stringify(project, null, 2)}\n`),
  ]);
  return { conceptsFile, projectFile, selectedScore: selected.score };
}
