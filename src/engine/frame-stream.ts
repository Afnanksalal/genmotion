import { GenmotionError } from '../errors.js';
import { throwIfAborted } from './process.js';

export interface FrameStreamState {
  renderedFrames: number;
  encodedFrames: number;
  inFlightFrames: number;
  bufferedFrames: number;
  bufferedBytes: number;
  maxBufferedFrames: number;
  maxBufferedBytes: number;
}
export interface FrameStreamOptions {
  totalFrames: number;
  frameBytes: number;
  capacity: number;
  render: (frame: number) => Promise<Buffer>;
  write: (frame: Buffer) => Promise<void>;
  signal?: AbortSignal;
  onProgress?: (state: FrameStreamState) => void;
}

/** Reservations include rendering, ready and currently-written frames. New
 * reservations are issued only after the oldest frame's write has drained. */
export async function streamOrderedFrames(options: FrameStreamOptions): Promise<FrameStreamState> {
  const { totalFrames, frameBytes, capacity, signal } = options;
  for (const [name, value] of Object.entries({ totalFrames, frameBytes, capacity })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new GenmotionError('INVALID_FRAME_STREAM', `${name} must be a positive safe integer.`);
  }
  throwIfAborted(signal);
  const pending = new Map<number, Promise<Buffer>>();
  const state: FrameStreamState = { renderedFrames: 0, encodedFrames: 0, inFlightFrames: 0, bufferedFrames: 0, bufferedBytes: 0, maxBufferedFrames: Math.min(capacity, totalFrames), maxBufferedBytes: Math.min(capacity, totalFrames) * frameBytes };
  let nextFrame = 0;
  let stopped = false;
  let rejectFailure: (error: unknown) => void = () => undefined;
  const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject; });
  void failure.catch(() => undefined);
  const abort = (): void => { rejectFailure(new GenmotionError('PROCESS_ABORTED', 'Frame streaming was aborted.', signal?.reason)); };
  const report = (): void => { options.onProgress?.({ ...state }); };
  const dispatch = (): void => {
    while (!stopped && nextFrame < totalFrames && pending.size < state.maxBufferedFrames) {
      const frame = nextFrame++;
      state.inFlightFrames++;
      const task = Promise.resolve().then(async () => options.render(frame)).then((buffer) => {
        if (buffer.length !== frameBytes) throw new GenmotionError('INVALID_FRAME_BUFFER', `Frame ${String(frame)} returned ${String(buffer.length)} bytes; expected ${String(frameBytes)}.`);
        state.inFlightFrames--;
        state.renderedFrames++;
        state.bufferedFrames++;
        state.bufferedBytes += buffer.length;
        if (!stopped) report();
        return buffer;
      });
      void task.catch(rejectFailure);
      pending.set(frame, task);
    }
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    throwIfAborted(signal);
    dispatch();
    for (let frame = 0; frame < totalFrames; frame++) {
      const task = pending.get(frame);
      if (!task) throw new GenmotionError('FRAME_STREAM_GAP', `No task for frame ${String(frame)}.`);
      const buffer = await Promise.race([task, failure]);
      throwIfAborted(signal);
      await Promise.race([options.write(buffer), failure]);
      pending.delete(frame);
      state.encodedFrames++;
      state.bufferedFrames--;
      state.bufferedBytes -= frameBytes;
      report();
      throwIfAborted(signal);
      dispatch();
    }
    return { ...state };
  } finally {
    stopped = true;
    signal?.removeEventListener('abort', abort);
  }
}
