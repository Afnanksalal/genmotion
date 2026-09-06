import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { throwIfAborted } from '../engine/process.js';

/** Preserve the destination while Windows readers briefly deny replacement. */
export async function replaceFile(source: string, destination: string, options: { signal?: AbortSignal; beforeRename?: () => Promise<void> } = {}): Promise<void> {
  const started = performance.now();
  for (let attempt = 0; ; attempt++) {
    throwIfAborted(options.signal);
    await options.beforeRename?.();
    try { await rename(source, destination); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || performance.now() - started >= 2000) throw error;
      await delay(Math.min(10 * 2 ** attempt, 100), undefined, options.signal ? { signal: options.signal } : {});
    }
  }
}
