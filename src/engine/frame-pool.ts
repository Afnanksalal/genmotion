import { Worker } from 'node:worker_threads';
import type { GenmotionProject } from '../ir/schema.js';
import type { RenderDimensions } from './draw.js';
import { GenmotionError } from '../errors.js';
import type { RenderView } from './render-view.js';

interface PendingFrame { frame: number; resolve: (buffer: Buffer) => void; reject: (error: Error) => void }
interface Slot { worker: Worker; pending: PendingFrame | undefined; failure: Error | undefined }

export class NativeFramePool {
  private readonly slots: Slot[] = [];
  private closing = false;
  private constructor() {}
  static async create(project: GenmotionProject, projectDir: string, dimensions: RenderDimensions, count: number, view?: RenderView, format: 'rgba' | 'png' = 'rgba'): Promise<NativeFramePool> {
    const pool = new NativeFramePool();
    try { pool.start(project, projectDir, dimensions, count, view, format); return pool; }
    catch (error) { await pool.close(); throw error; }
  }
  private start(project: GenmotionProject, projectDir: string, dimensions: RenderDimensions, count: number, view?: RenderView, format: 'rgba' | 'png' = 'rgba'): void {
    const url = import.meta.url.includes('/src/engine/frame-pool.')
      ? new URL('../../dist/engine/worker.js', import.meta.url)
      : new URL('./worker.js', import.meta.url);
    for (let index = 0; index < count; index++) {
      const worker = new Worker(url, { workerData: { project, projectDir, dimensions, view, format } });
      const slot: Slot = { worker, pending: undefined, failure: undefined };
      const fail = (error: Error): void => { slot.failure = error; slot.pending?.reject(error); slot.pending = undefined; };
      worker.on('message', (message: { frame: number; buffer?: ArrayBuffer; error?: string }) => {
        if (this.closing) return;
        const task = slot.pending;
        if (!task || message.frame !== task.frame || !message.buffer || message.error) {
          fail(new GenmotionError('FRAME_RENDER_FAILED', `Worker returned an invalid frame: ${message.error ?? String(message.frame)}.`));
          return;
        }
        slot.pending = undefined;
        task.resolve(Buffer.from(message.buffer));
      });
      worker.on('error', fail);
      worker.on('exit', (code) => {
        if (!this.closing) fail(new GenmotionError('FRAME_WORKER_EXIT', `Frame worker exited unexpectedly with code ${String(code)}.`));
      });
      this.slots.push(slot);
    }
  }
  render(frame: number): Promise<Buffer> {
    const slot = this.slots.find((candidate) => !candidate.pending && !candidate.failure);
    if (this.closing || !slot) return Promise.reject(new GenmotionError('FRAME_POOL_UNAVAILABLE', 'No healthy frame worker is available.'));
    return new Promise<Buffer>((resolve, reject) => {
      slot.pending = { frame, resolve, reject };
      try { slot.worker.postMessage({ frame }); }
      catch (error) { slot.pending = undefined; reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }
  async close(): Promise<void> {
    this.closing = true;
    for (const slot of this.slots) {
      slot.pending?.reject(new GenmotionError('FRAME_POOL_CLOSED', 'Frame worker pool was closed.'));
      slot.pending = undefined;
    }
    await Promise.allSettled(this.slots.map(async (slot) => slot.worker.terminate()));
  }
}
