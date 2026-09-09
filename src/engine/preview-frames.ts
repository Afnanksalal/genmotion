import { NativeFramePool } from './frame-pool.js';
import type { RenderDimensions } from './draw.js';
import type { GenmotionProject } from '../ir/schema.js';
import { GenmotionError } from '../errors.js';

interface Task { frame: number; resolve: (value: Buffer) => void; reject: (error: unknown) => void }
interface Context { key: string; pool: NativeFramePool; active: number; queue: Task[] }

/** A bounded, revision-scoped preview queue, separate from export workers and the HTTP event loop. */
export class PreviewFrameRenderer {
  private context: Context | undefined;
  private switching: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private readonly workers = 2, private readonly maxPending = 8) {
    if (!Number.isInteger(workers) || workers < 1 || workers > 8 || !Number.isInteger(maxPending) || maxPending < workers || maxPending > 64) throw new GenmotionError('INVALID_PREVIEW_LIMITS', 'Preview workers must be 1–8 and pending frames must be between worker count and 64.');
  }
  private async acquire(key: string, project: GenmotionProject, directory: string, dimensions: RenderDimensions, format: 'rgba' | 'png'): Promise<Context> {
    const setup = this.switching.then(async () => {
      if (this.closed) throw new GenmotionError('PREVIEW_CLOSED', 'Preview renderer is closed.');
      if (this.context?.key === key) return;
      const previous = this.context;
      this.context = undefined;
      if (previous) { for (const task of previous.queue.splice(0)) task.reject(new GenmotionError('PREVIEW_SUPERSEDED', 'Preview revision changed.')); await previous.pool.close(); }
      this.context = { key, pool: await NativeFramePool.create(project, directory, dimensions, this.workers, undefined, format), active: 0, queue: [] };
    });
    this.switching = setup.catch(() => undefined);
    await setup;
    if (!this.context || this.context.key !== key) throw new GenmotionError('PREVIEW_SUPERSEDED', 'Preview revision changed.');
    return this.context;
  }
  async render(key: string, project: GenmotionProject, directory: string, frame: number, dimensions: RenderDimensions, format: 'rgba' | 'png' = 'png'): Promise<Buffer> {
    const context = await this.acquire(`${key}:${dimensions.width}x${dimensions.height}:${format}`, project, directory, dimensions, format);
    if (this.closed || this.context !== context) throw new GenmotionError('PREVIEW_SUPERSEDED', 'Preview revision changed.');
    if (context.active + context.queue.length >= this.maxPending) throw new GenmotionError('PREVIEW_BUSY', 'Preview queue is full.');
    return await new Promise<Buffer>((resolve, reject) => { context.queue.push({ frame, resolve, reject }); this.pump(context); });
  }
  private pump(context: Context): void {
    while (!this.closed && this.context === context && context.active < this.workers && context.queue.length) {
      const task = context.queue.shift()!; context.active++;
      void context.pool.render(task.frame).then(task.resolve, task.reject).finally(() => { context.active--; this.pump(context); });
    }
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.switching;
    const context = this.context; this.context = undefined;
    if (context) { for (const task of context.queue.splice(0)) task.reject(new GenmotionError('PREVIEW_CLOSED', 'Preview renderer is closed.')); await context.pool.close(); }
  }
}
