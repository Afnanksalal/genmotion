import { setImmediate as turn } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { streamOrderedFrames, type FrameStreamState } from '../src/engine/frame-stream.js';

function gate(): { promise: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

describe('bounded ordered frame delivery', () => {
  it.each([4, 3840 * 2160 * 4])('bounds %i-byte frame reservations behind a slow first frame and blocked encoder', async (frameBytes) => {
    const first = gate();
    const drain = gate();
    const started: number[] = [];
    const written: number[] = [];
    const snapshots: FrameStreamState[] = [];
    const result = streamOrderedFrames({ totalFrames: 20, frameBytes, capacity: 3,
      render: async (frame) => { started.push(frame); if (frame === 0) await first.promise; return Buffer.alloc(frameBytes, frame); },
      write: async (buffer) => { written.push(buffer[0]!); if (written.length === 1) await drain.promise; },
      onProgress: (state) => snapshots.push(state),
    });
    await turn();
    expect(started).toEqual([0, 1, 2]);
    expect(written).toEqual([]);
    first.open();
    await turn();
    expect(written).toEqual([0]);
    expect(started).toEqual([0, 1, 2]);
    drain.open();
    expect(await result).toMatchObject({ encodedFrames: 20, inFlightFrames: 0, bufferedFrames: 0, bufferedBytes: 0 });
    expect(written).toEqual(Array.from({ length: 20 }, (_, index) => index));
    for (const state of snapshots) {
      expect(state.inFlightFrames + state.bufferedFrames).toBeLessThanOrEqual(3);
      expect(state.bufferedBytes).toBeLessThanOrEqual(frameBytes * 3);
    }
  });

  it('propagates a later frame failure without waiting for a stalled earlier frame', async () => {
    const result = streamOrderedFrames({ totalFrames: 3, frameBytes: 4, capacity: 2,
      render: async (frame) => { if (frame === 1) throw new Error('bad source'); return new Promise<Buffer>(() => undefined); },
      write: () => Promise.resolve(),
    });
    await expect(result).rejects.toThrow('bad source');
  });

  it('cancels a blocked sink and rejects malformed frame buffers', async () => {
    const controller = new AbortController();
    const entered = gate();
    const result = streamOrderedFrames({ totalFrames: 1, frameBytes: 4, capacity: 1, signal: controller.signal,
      render: () => Promise.resolve(Buffer.alloc(4)), write: async () => { entered.open(); await new Promise<void>(() => undefined); },
    });
    await entered.promise;
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'PROCESS_ABORTED' });
    await expect(streamOrderedFrames({ totalFrames: 1, frameBytes: 4, capacity: 1, render: () => Promise.resolve(Buffer.alloc(3)), write: () => Promise.resolve() })).rejects.toMatchObject({ code: 'INVALID_FRAME_BUFFER' });
  });
});
