import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { GenmotionError } from '../errors.js';

export interface ProcessResult { stdout: string; stderr: string }
export interface ProcessOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
}
export interface ManagedProcess {
  child: ChildProcessWithoutNullStreams;
  completed: Promise<ProcessResult>;
  /** Resolves only after the process and its stdio have closed. */
  terminate: () => Promise<void>;
}
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new GenmotionError('PROCESS_ABORTED', 'Operation was aborted.', signal.reason);
}

/** Owns error, close, cancellation, deadline and bounded output for one direct child. */
export function startProcess(command: string, args: string[], cwd?: string, options: ProcessOptions = {}): ManagedProcess {
  throwIfAborted(options.signal);
  const maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw new GenmotionError('INVALID_PROCESS_LIMIT', 'Process output limit must be a positive safe integer.');
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 2_147_483_647)) throw new GenmotionError('INVALID_PROCESS_LIMIT', 'Process timeout must be an integer between 1 and 2147483647 milliseconds.');
  const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let failure: Error | undefined;
  let closed = false;
  const stop = (error: Error): void => {
    failure ??= error;
    if (!closed) child.kill('SIGKILL');
  };
  const abort = (): void => { stop(new GenmotionError('PROCESS_ABORTED', command + ' was aborted.', options.signal?.reason)); };
  const completed = new Promise<ProcessResult>((resolve, reject) => {
    const collect = (stream: 'stdout' | 'stderr', chunk: string): void => {
      if (failure) return;
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maxOutputBytes) {
        stop(new GenmotionError('PROCESS_OUTPUT_LIMIT', command + ' exceeded its diagnostic output limit.', { maxOutputBytes }));
        return;
      }
      if (stream === 'stdout') stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => collect('stdout', chunk));
    child.stderr.on('data', (chunk: string) => collect('stderr', chunk));
    child.on('error', (error) => { failure ??= new GenmotionError('PROCESS_START_FAILED', 'Could not start ' + command, error); });
    child.stdin.on('error', (error) => { stop(new GenmotionError('PROCESS_PIPE_FAILED', command + ' closed its input pipe.', error)); });
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      stop(new GenmotionError('PROCESS_TIMEOUT', command + ' exceeded its deadline.', { timeoutMs: options.timeoutMs }));
    }, options.timeoutMs);
    timer?.unref();
    child.once('close', (code, signal) => {
      closed = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new GenmotionError('PROCESS_FAILED', command + ' exited with code ' + String(code) + ': ' + stderr.trim(), { command, code, signal }));
      else resolve({ stdout, stderr });
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
  });
  // A child can fail while its caller is still writing frames.
  void completed.catch(() => undefined);
  return { child, completed, terminate: async () => {
    if (!closed) child.kill('SIGKILL');
    await completed.catch(() => undefined);
  } };
}
export async function runProcess(command: string, args: string[], cwd?: string, options: ProcessOptions = {}): Promise<ProcessResult> {
  const process = startProcess(command, args, cwd, options);
  process.child.stdin.end();
  return process.completed;
}
