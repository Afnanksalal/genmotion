import { describe, expect, it } from 'vitest';
import { runProcess, startProcess } from '../src/engine/process.js';

describe('owned native child processes', () => {
  it('captures output and rejects failed and missing executables', async () => {
    expect(await runProcess(process.execPath, ['-e', 'process.stdout.write("ok");process.stderr.write("note")'])).toEqual({ stdout: 'ok', stderr: 'note' });
    await expect(runProcess(process.execPath, ['-e', 'process.stderr.write("failure");process.exit(2)'])).rejects.toMatchObject({ code: 'PROCESS_FAILED' });
    await expect(runProcess('genmotion-executable-that-does-not-exist', [])).rejects.toMatchObject({ code: 'PROCESS_START_FAILED' });
  });

  it('reaps a running child before cancellation completes', async () => {
    const controller = new AbortController();
    const child = startProcess(process.execPath, ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], undefined, { signal: controller.signal });
    child.child.stdout.once('data', () => controller.abort());
    await expect(child.completed).rejects.toMatchObject({ code: 'PROCESS_ABORTED' });
    expect(() => process.kill(child.child.pid!, 0)).toThrow();
    await child.terminate();
  });

  it('bounds deadlines and diagnostic output', async () => {
    await expect(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], undefined, { timeoutMs: 50 })).rejects.toMatchObject({ code: 'PROCESS_TIMEOUT' });
    await expect(runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000));setInterval(()=>{},1000)'], undefined, { maxOutputBytes: 1024 })).rejects.toMatchObject({ code: 'PROCESS_OUTPUT_LIMIT' });
    const controller = new AbortController(); controller.abort();
    await expect(runProcess(process.execPath, [], undefined, { signal: controller.signal })).rejects.toMatchObject({ code: 'PROCESS_ABORTED' });
  });
});
