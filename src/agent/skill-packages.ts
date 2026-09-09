import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const field = z.object({ name: z.string().min(1).max(100), description: z.string().min(1).max(1000), required: z.boolean().default(true) }).strict();
export const domainSkillManifestSchema = z.object({ version: z.literal(1), id: z.string().regex(/^[a-z][a-z0-9-]*$/), title: z.string().min(1).max(120), triggers: z.array(z.string().min(2).max(100)).min(1).max(100), capabilities: z.array(z.string().min(1).max(120)).min(1).max(100), inputs: z.array(field).min(1).max(100), outputs: z.array(field).min(1).max(100), skill: z.string().min(1), example: z.string().min(1) }).strict();
export type DomainSkillManifest = z.infer<typeof domainSkillManifestSchema>;
export interface LoadedDomainSkill { manifest: DomainSkillManifest; directory: string; skillFile: string; exampleFile: string; instructions: string; example: { input: Record<string, unknown>; output: Record<string, unknown> } }

const confined = (root: string, value: string): string => { const target = path.resolve(root, value), relative = path.relative(root, target); if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Domain skill file escapes its package'); return target; };
export async function loadDomainSkills(root: string): Promise<LoadedDomainSkill[]> {
  const packages: LoadedDomainSkill[] = [];
  for (const name of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    const directory = path.join(root, name), manifest = domainSkillManifestSchema.parse(JSON.parse(await readFile(path.join(directory, 'contract.json'), 'utf8')));
    if (manifest.id !== name) throw new Error(`Domain skill directory and ID differ: ${name}`);
    const skillFile = confined(directory, manifest.skill), exampleFile = confined(directory, manifest.example), instructions = await readFile(skillFile, 'utf8'), example = z.object({ input: z.record(z.string(), z.unknown()), output: z.record(z.string(), z.unknown()) }).strict().parse(JSON.parse(await readFile(exampleFile, 'utf8')));
    for (const item of manifest.inputs.filter(item => item.required)) if (!Object.hasOwn(example.input, item.name)) throw new Error(`${manifest.id} example misses input ${item.name}`);
    for (const item of manifest.outputs.filter(item => item.required)) if (!Object.hasOwn(example.output, item.name)) throw new Error(`${manifest.id} example misses output ${item.name}`);
    packages.push({ manifest, directory, skillFile, exampleFile, instructions, example });
  }
  return packages;
}
export async function selectDomainSkills(root: string, request: string, limit = 3): Promise<LoadedDomainSkill[]> { const query = request.toLowerCase(); return (await loadDomainSkills(root)).map(skill => ({ skill, score: skill.manifest.triggers.filter(trigger => query.includes(trigger.toLowerCase())).length })).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.skill.manifest.id.localeCompare(b.skill.manifest.id)).slice(0, z.number().int().min(1).max(8).parse(limit)).map(item => item.skill); }

export const domainSkillStateSchema = z.object({ version: z.literal(1), skillId: z.string(), projectRevision: z.string().min(1), updatedAt: z.string().datetime(), steps: z.array(z.object({ id: z.string().min(1), status: z.enum(['pending', 'running', 'complete', 'failed']), artifactHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]), error: z.string().optional() }).strict()).max(1000) }).strict();
export async function loadDomainSkillState(file: string) { try { return domainSkillStateSchema.parse(JSON.parse(await readFile(file, 'utf8'))); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
export async function saveDomainSkillState(file: string, state: z.input<typeof domainSkillStateSchema>) { const parsed = domainSkillStateSchema.parse(state), target = path.resolve(file); await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`); await rename(temporary, target); return parsed; }
export async function executeDomainSkillExample(skill: LoadedDomainSkill, handlers: Record<string, (input: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>>) { const handler = handlers[skill.manifest.id]; if (!handler) throw new Error(`No executable example handler for ${skill.manifest.id}`); const output = await handler(skill.example.input); for (const item of skill.manifest.outputs.filter(item => item.required)) if (!Object.hasOwn(output, item.name)) throw new Error(`${skill.manifest.id} handler omitted output ${item.name}`); return { input: skill.example.input, output }; }
