import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { resolveProjectAsset } from './loader.js';
import { projectSchema, type GenmotionProject } from './schema.js';

export const namedCheckpointSchema = z.object({ version: z.literal(1), id: z.string().uuid(), name: z.string().trim().min(1).max(200), createdAt: z.string().datetime(), revision: z.string().min(1), project: projectSchema }).strict();
export type NamedCheckpoint = z.infer<typeof namedCheckpointSchema>;
export type CheckpointSummary = Omit<NamedCheckpoint, 'project'>;
export interface NamedCheckpointStore {
  list(): Promise<CheckpointSummary[]>;
  read(id: string): Promise<NamedCheckpoint>;
  create(checkpoint: NamedCheckpoint): Promise<void>;
  remove(id: string): Promise<void>;
}
const checkpointId = z.string().uuid();
const summarize = (entry: NamedCheckpoint): CheckpointSummary => ({ version: entry.version, id: entry.id, name: entry.name, createdAt: entry.createdAt, revision: entry.revision });
export function memoryCheckpointStore(): NamedCheckpointStore {
  const entries = new Map<string, NamedCheckpoint>();
  return {
    list() { return Promise.resolve([...entries.values()].map(summarize).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); },
    async read(id) { await Promise.resolve(); checkpointId.parse(id); const entry = entries.get(id); if (!entry) throw new GenmotionError('CHECKPOINT_MISSING', 'Named checkpoint does not exist.'); return structuredClone(entry); },
    async create(input) { await Promise.resolve(); const entry = namedCheckpointSchema.parse(input); if (entries.has(entry.id)) throw new GenmotionError('CHECKPOINT_EXISTS', 'Named checkpoint ID already exists.'); entries.set(entry.id, structuredClone(entry)); },
    async remove(id) { await Promise.resolve(); checkpointId.parse(id); if (!entries.delete(id)) throw new GenmotionError('CHECKPOINT_MISSING', 'Named checkpoint does not exist.'); },
  };
}
/** Each immutable checkpoint is written completely before an atomic hard-link publishes it.
 * IDs are UUIDs and all paths remain within the project's checkpoint directory. */
export function filesystemCheckpointStore(projectDirectory: string, namespace: string): NamedCheckpointStore {
  if (!/^[a-f0-9]{16,64}$/.test(namespace)) throw new GenmotionError('CHECKPOINT_NAMESPACE_INVALID', 'Checkpoint namespace must be a source-file hash.');
  const directory = resolveProjectAsset(projectDirectory, `.genmotion/checkpoints/${namespace}`);
  const filename = (id: string): string => resolveProjectAsset(projectDirectory, path.relative(projectDirectory, path.join(directory, checkpointId.parse(id) + '.json')));
  const read = async (id: string): Promise<NamedCheckpoint> => {
    const file = filename(id);
    if ((await stat(file)).size > 32 * 1024 * 1024) throw new GenmotionError('CHECKPOINT_TOO_LARGE', 'Named checkpoint exceeds 32 MiB.');
    const entry = namedCheckpointSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    if (entry.id !== id) throw new GenmotionError('CHECKPOINT_ID_MISMATCH', 'Checkpoint content does not match its file identity.');
    return entry;
  };
  return {
    async list() {
      let names: string[];
      try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
      const summaries: CheckpointSummary[] = [];
      for (const name of names) if (name.endsWith('.json') && checkpointId.safeParse(name.slice(0, -5)).success) summaries.push(summarize(await read(name.slice(0, -5))));
      return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    read,
    async create(input) {
      const entry = namedCheckpointSchema.parse(input), source = JSON.stringify(entry);
      if (Buffer.byteLength(source) > 32 * 1024 * 1024) throw new GenmotionError('CHECKPOINT_TOO_LARGE', 'Named checkpoint exceeds 32 MiB.');
      await mkdir(directory, { recursive: true });
      const temporary = resolveProjectAsset(projectDirectory, path.relative(projectDirectory, path.join(directory, `.${randomUUID()}.tmp`)));
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(source, 'utf8'); await handle.sync(); await handle.close();
        const { link } = await import('node:fs/promises'); await link(temporary, filename(entry.id));
      } finally { await handle.close().catch(() => undefined); await rm(temporary, { force: true }); }
    },
    async remove(id) { await rm(filename(id)); },
  };
}
export function makeNamedCheckpoint(project: GenmotionProject, revision: string, name: string): NamedCheckpoint {
  return namedCheckpointSchema.parse({ version: 1, id: randomUUID(), name, createdAt: new Date().toISOString(), revision, project: structuredClone(project) });
}
