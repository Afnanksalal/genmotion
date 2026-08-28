import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { briefSchema, type CreativeBrief } from '../creative/types.js';
import { DEFAULT_TRANSFORM, projectSchema } from '../ir/schema.js';

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
  const project = projectSchema.parse({
    schemaVersion: 1,
    id,
    title: brief.title,
    width: 1920,
    height: 1080,
    fps: 30,
    seed: 1,
    brand: { background: brief.brand.background, foreground: brief.brand.foreground, accent: brief.brand.accent, muted: brief.brand.muted, fonts: [], radius: 24, tone: brief.brand.tone },
    scenes: [{
      id: 'canvas', purpose: brief.promise, duration: brief.duration, background: brief.brand.background,
      layers: [{
        id: 'artboard', type: 'shape', shape: 'rect', x: 0, y: 0, width: 1920, height: 1080,
        fill: brief.brand.background, strokeWidth: 0, radius: 0, progress: 1, start: 0, duration: brief.duration,
        z: 0, visible: true, transform: { ...DEFAULT_TRANSFORM }, blendMode: 'source-over', tags: ['agent-canvas'], motion: [], tracks: [],
      }],
      transitionIn: { type: 'cut', duration: 0, ease: 'linear' }, transitionOut: { type: 'cut', duration: 0, ease: 'linear' },
      referenceDecisions: [], notes: ['Neutral artboard. Author the composition from the brief with an agent or Studio.'],
    }],
    audio: [],
    metadata: { mode: brief.mode, audience: brief.audience, desiredAction: brief.desiredAction, authoringState: 'awaiting-agent-direction' },
  });
  const briefFile = path.join(target, 'brief.json');
  const projectFile = path.join(target, 'genmotion.json');
  await Promise.all([
    writeFile(briefFile, `${JSON.stringify(brief, null, 2)}\n`, { flag: 'wx' }),
    writeFile(projectFile, `${JSON.stringify(project, null, 2)}\n`, { flag: 'wx' }),
  ]);
  return { directory: target, projectFile, briefFile };
}
