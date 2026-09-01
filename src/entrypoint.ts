import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function isEntrypoint(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (!argvEntry) return false;
  const entry = path.resolve(argvEntry);
  try {
    return moduleUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return moduleUrl === pathToFileURL(entry).href;
  }
}
