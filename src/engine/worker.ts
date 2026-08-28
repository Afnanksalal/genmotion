import { parentPort, workerData } from 'node:worker_threads';
import type { GenmotionProject } from '../ir/schema.js';
import { renderFrame } from './draw.js';

interface RenderWorkerData {
  project: GenmotionProject;
  projectDir: string;
}

interface RenderRequest { frame: number }

const data = workerData as RenderWorkerData;

if (!parentPort) throw new Error('The frame worker must run inside a worker thread.');

parentPort.on('message', (message: RenderRequest) => {
  void renderFrame(data.project, data.projectDir, message.frame)
    .then((buffer) => {
      const array = Uint8Array.from(buffer).buffer;
      parentPort?.postMessage({ frame: message.frame, buffer: array }, [array]);
    })
    .catch((error: unknown) => {
      parentPort?.postMessage({ frame: message.frame, error: error instanceof Error ? error.message : String(error) });
    });
});
