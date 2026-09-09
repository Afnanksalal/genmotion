import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { runProcess, type ProcessOptions } from '../engine/process.js';
import { projectAssetReferences } from './asset-references.js';
import { resolveProjectAsset, type LoadedProject } from './loader.js';

export type RenderInputRole = 'font' | 'audio' | 'visual-media' | 'reference-source' | 'evidence' | 'lut' | 'parameter-asset' | 'other';
export interface RenderInputAttestation { version: 1; sourceHash: string; inputs: Array<{ path: string; roles: RenderInputRole[]; bytes: number; sha256: string }>; excludedOutputs: string[]; dependencyHash: string }
export interface RenderOutputAttestation { encodedSha256: string; decodedVideoSha256: string; decodedAudioSha256?: string; fullyDecoded: true }

async function fileHash(file: string): Promise<string> { const digest = createHash('sha256'); for await (const chunk of createReadStream(file)) digest.update(chunk as Buffer); return digest.digest('hex'); }
function rolesFor(loaded: LoadedProject, reference: string): RenderInputRole[] {
  const project = loaded.sourceProject, roles = new Set<RenderInputRole>();
  if (project.brand.fonts.some(font => font.file === reference) || [...project.scenes, ...project.compositions].some(container => container.layers.some(layer => ('fontFile' in layer && layer.fontFile === reference)))) roles.add('font');
  if (project.audio.some(track => track.src === reference)) roles.add('audio');
  if ([...project.scenes, ...project.compositions].some(container => container.layers.some(layer => ('src' in layer && layer.src === reference)))) roles.add('visual-media');
  if (project.referenceSources.some(source => source.path === reference)) roles.add('reference-source');
  if ((project.productionWorkflow?.stages ?? []).some(stage => stage.evidence.some(item => item.path === reference))) roles.add('evidence');
  if ([...project.scenes, ...project.compositions].some(container => [...(container.effects ?? []), ...container.layers.flatMap(layer => layer.effects ?? [])].some(effect => effect.lut?.source?.path === reference))) roles.add('lut');
  if (!roles.size) roles.add(project.parameters.some(parameter => ['file', 'asset', 'font'].includes(parameter.type)) ? 'parameter-asset' : 'other');
  return [...roles].sort();
}

export async function createRenderInputAttestation(loaded: LoadedProject, excludedOutputs: string[]): Promise<RenderInputAttestation> {
  const canonicalExcluded = excludedOutputs.map(output => path.resolve(output)).sort();
  const audible = loaded.sourceProject.audio.some(track => track.solo && !track.muted) ? loaded.sourceProject.audio.filter(track => track.solo && !track.muted) : loaded.sourceProject.audio.filter(track => !track.muted);
  const attested: LoadedProject = { ...loaded, sourceProject: { ...loaded.sourceProject, audio: audible }, project: { ...loaded.project, audio: audible } };
  const inputs = await Promise.all(projectAssetReferences(attested.sourceProject).sort().map(async reference => {
    const file = resolveProjectAsset(loaded.projectDir, reference), absolute = path.resolve(file);
    if (canonicalExcluded.includes(absolute)) throw new Error(`Render output is present in its own input closure: ${reference}`);
    const info = await stat(file), sha256 = await fileHash(file);
    const declared = loaded.sourceProject.referenceSources.find(item => item.path === reference)?.contentHash ?? loaded.sourceProject.mediaLedger.records.find(item => item.path === reference)?.sha256;
    if (declared && declared !== sha256) throw new Error(`Frozen render input changed: ${reference}`);
    return { path: reference, roles: rolesFor(attested, reference), bytes: info.size, sha256 };
  }));
  const sourceHash = createHash('sha256').update(JSON.stringify(loaded.sourceProject)).digest('hex');
  return { version: 1, sourceHash, inputs, excludedOutputs: canonicalExcluded, dependencyHash: createHash('sha256').update(JSON.stringify(inputs)).digest('hex') };
}

async function decodedHash(file: string, kind: 'video' | 'audio', options: ProcessOptions): Promise<string | undefined> {
  const args = ['-v', 'error', '-i', path.resolve(file), '-map', kind === 'video' ? '0:v:0' : '0:a:0?', ...(kind === 'video' ? ['-c:v', 'rawvideo', '-pix_fmt', 'rgba'] : ['-c:a', 'pcm_s32le']), '-f', 'hash', '-hash', 'sha256', '-'];
  const result = await runProcess('ffmpeg', args, undefined, { ...options, maxOutputBytes: 64 * 1024 });
  const match = /SHA256=([a-f0-9]{64})/i.exec(result.stdout);
  return match?.[1]?.toLowerCase();
}

export async function attestRenderOutput(file: string, hasAudio: boolean, options: ProcessOptions = {}): Promise<RenderOutputAttestation> {
  const encodedSha256 = await fileHash(file), decodedVideoSha256 = await decodedHash(file, 'video', options);
  if (!decodedVideoSha256) throw new Error('Full decoded video hash was not produced');
  const decodedAudioSha256 = hasAudio ? await decodedHash(file, 'audio', options) : undefined;
  if (hasAudio && !decodedAudioSha256) throw new Error('Full decoded audio hash was not produced');
  return { encodedSha256, decodedVideoSha256, ...(decodedAudioSha256 ? { decodedAudioSha256 } : {}), fullyDecoded: true };
}
