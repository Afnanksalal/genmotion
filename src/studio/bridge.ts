import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { GenmotionError } from '../errors.js';
import { findProjectFile } from '../ir/loader.js';
import { editingCommandSchema, type EditingCommand } from '../ir/session.js';

export const studioBridgePermissionsSchema = z.object({ read: z.literal(true).default(true), navigate: z.boolean().default(true), edit: z.boolean().default(false) }).strict();
export type StudioBridgePermissions = z.infer<typeof studioBridgePermissionsSchema>;
export const studioBridgeCommandSchema: z.ZodType<StudioBridgeCommand> = z.union([z.object({ action: z.literal('capabilities') }).strict(), editingCommandSchema]);
export type StudioBridgeCommand = EditingCommand | { action: 'capabilities' };
export const studioBridgeDescriptorSchema = z.object({ version: z.literal(1), handle: z.string().uuid(), token: z.string().min(32).max(128), port: z.number().int().min(1).max(65535), address: z.enum(['127.0.0.1', '::1']), projectFile: z.string().min(1) }).strict();
export function studioBridgeDescriptorPath(projectFile: string): string {
  const id = createHash('sha256').update(path.resolve(projectFile)).digest('hex').slice(0, 24);
  return path.join(os.homedir(), '.genmotion', 'studio-sessions', `${id}.json`);
}
export function studioBridgePermission(command: StudioBridgeCommand): keyof StudioBridgePermissions {
  if (command.action === 'context-update') return 'navigate';
  if (['apply', 'replace', 'reconcile', 'undo', 'redo', 'checkpoint-save', 'checkpoint-restore', 'checkpoint-delete'].includes(command.action)) return 'edit';
  return 'read';
}
/** Local descriptor tokens never appear in tool responses. Connections and redirects stay source-scoped. */
export async function executeStudioCommand(input: string, raw: StudioBridgeCommand, signal?: AbortSignal): Promise<unknown> {
  const command = studioBridgeCommandSchema.parse(raw);
  const projectFile = await realpath(await findProjectFile(input));
  const descriptorFile = studioBridgeDescriptorPath(projectFile);
  let descriptor: z.infer<typeof studioBridgeDescriptorSchema>;
  try {
    if ((await stat(descriptorFile)).size > 4096) throw new Error('Oversized session descriptor.');
    descriptor = studioBridgeDescriptorSchema.parse(JSON.parse(await readFile(descriptorFile, 'utf8')));
  } catch { throw new GenmotionError('STUDIO_SESSION_UNAVAILABLE', 'Open this project in Studio before sending a live session command.'); }
  if (descriptor.projectFile !== projectFile) throw new GenmotionError('STUDIO_SOURCE_MISMATCH', 'The Studio handle belongs to another source document.');
  const address = descriptor.address === '::1' ? '[::1]' : descriptor.address;
  const response = await fetch(`http://${address}:${descriptor.port}/api/agent-bridge`, {
    method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    headers: { 'content-type': 'application/json', 'x-genmotion-bridge-token': descriptor.token },
    body: JSON.stringify({ handle: descriptor.handle, command }),
  });
  const result = await response.json() as { error?: string; code?: string; details?: unknown };
  if (!response.ok) throw new GenmotionError(result.code ?? 'STUDIO_COMMAND_FAILED', result.error ?? `Studio returned HTTP ${response.status}.`, result.details);
  return result;
}
export function editingCommandIsMutation(command: EditingCommand): boolean {
  return ['apply', 'replace', 'reconcile', 'undo', 'redo', 'checkpoint-restore'].includes(command.action) && !('dryRun' in command && command.dryRun);
}
export function editingResultPersisted(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const value = result as { persisted?: unknown; receipt?: { persisted?: unknown } };
  return value.persisted === true || value.receipt?.persisted === true;
}
