import { z } from 'zod';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const identifier = z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema).max(1000), z.record(z.string(), jsonValueSchema)]));
export const preferenceHistorySchema = z.object({
  action: z.enum(['created', 'confirmed', 'overridden', 'removed']),
  at: z.string().datetime(),
  source: z.enum(['user', 'inferred', 'import']),
  note: z.string().max(2000).default(''),
}).strict();
export const creativePreferenceSchema = z.object({
  id: identifier,
  key: z.string().min(1).max(500),
  scope: z.enum(['project', 'personal']),
  value: jsonValueSchema,
  state: z.enum(['proposed', 'active', 'removed']),
  source: z.object({ kind: z.enum(['user', 'inferred', 'import']), reference: z.string().max(4000).default('') }).strict(),
  history: z.array(preferenceHistorySchema).min(1).max(1000),
}).strict().superRefine((item, context) => {
  if (item.scope === 'personal' && item.source.kind === 'inferred' && item.state === 'active' && !item.history.some(event => event.action === 'confirmed' && event.source === 'user')) context.addIssue({ code: 'custom', path: ['state'], message: 'An inferred preference requires explicit user confirmation before becoming a personal default' });
  if (item.state === 'removed' && item.history.at(-1)?.action !== 'removed') context.addIssue({ code: 'custom', path: ['history'], message: 'Removed preferences require a final removal event' });
});
export const creativePreferencesSchema = z.array(creativePreferenceSchema).max(1000).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Preference IDs must be unique');
export type CreativePreference = z.infer<typeof creativePreferenceSchema>;

export function resolveCreativePreferences(project: CreativePreference[], personal: CreativePreference[] = []): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const item of [...personal.filter(item => item.scope === 'personal'), ...project.filter(item => item.scope === 'project')]) if (item.state === 'active') resolved[item.key] = structuredClone(item.value);
  return resolved;
}

export function inspectCreativePreferences(project: CreativePreference[], personal: CreativePreference[] = []) {
  const all = [...personal, ...project];
  return {
    version: 1 as const,
    resolved: resolveCreativePreferences(project, personal),
    project: project.map(item => structuredClone(item)),
    personal: personal.map(item => structuredClone(item)),
    proposed: all.filter(item => item.state === 'proposed').map(item => item.id),
    removed: all.filter(item => item.state === 'removed').map(item => item.id),
  };
}

export function upsertCreativePreference(items: CreativePreference[], input: { id: string; key: string; scope: 'project' | 'personal'; value: unknown; source: 'user' | 'inferred' | 'import'; reference?: string; confirm?: boolean; at?: string }): CreativePreference[] {
  const at = input.at ?? new Date().toISOString(), existing = items.find(item => item.id === input.id);
  const confirmed = input.source === 'user' || input.confirm === true;
  const next = creativePreferenceSchema.parse({
    id: input.id, key: input.key, scope: input.scope, value: input.value,
    state: input.scope === 'personal' && input.source === 'inferred' && !confirmed ? 'proposed' : 'active',
    source: { kind: input.source, reference: input.reference ?? '' },
    history: [...existing?.history ?? [], { action: existing ? 'overridden' : 'created', at, source: input.source, note: input.reference ?? '' }, ...(confirmed && input.source === 'inferred' ? [{ action: 'confirmed' as const, at, source: 'user' as const, note: 'Explicitly confirmed as a personal default.' }] : [])],
  });
  return [...items.filter(item => item.id !== input.id), next];
}

export function removeCreativePreference(items: CreativePreference[], id: string, note = '', at = new Date().toISOString()): CreativePreference[] {
  const existing = items.find(item => item.id === id);
  if (!existing) return items;
  const removed = creativePreferenceSchema.parse({ ...existing, state: 'removed', history: [...existing.history, { action: 'removed', at, source: 'user', note }] });
  return items.map(item => item.id === id ? removed : item);
}

/** Read an explicit host-owned personal preference store. Missing stores are empty. */
export async function readPersonalPreferences(file: string): Promise<CreativePreference[]> {
  try { return creativePreferencesSchema.parse(JSON.parse(await readFile(path.resolve(file), 'utf8'))).filter(item => item.scope === 'personal'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}

/** Atomically persist only personal-scope records to the caller-selected host store. */
export async function writePersonalPreferences(file: string, items: CreativePreference[]): Promise<void> {
  const target = path.resolve(file), parsed = creativePreferencesSchema.parse(items);
  if (parsed.some(item => item.scope !== 'personal')) throw new Error('A personal preference store cannot contain project-scoped records');
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { flag: 'wx' });
  try { await rename(temporary, target); } catch (error) { const { rm } = await import('node:fs/promises'); await rm(temporary, { force: true }); throw error; }
}
