import { parentPort, workerData } from 'node:worker_threads';
import type { GenmotionProject } from '../ir/schema.js';
import { renderFrame, type RenderDimensions } from './draw.js';

interface RenderWorkerData {
  project: GenmotionProject;
  projectDir: string;
  dimensions: RenderDimensions;
}

interface RenderRequest { frame: number }

const data = workerData as RenderWorkerData;

if (!parentPort) throw new Error('The frame worker must run inside a worker thread.');

parentPort.on('message', (message: RenderRequest) => {
  void renderFrame(data.project, data.projectDir, message.frame, data.dimensions)
    .then((buffer) => {
      const array = Uint8Array.from(buffer).buffer;
      parentPort?.postMessage({ frame: message.frame, buffer: array }, [array]);
    })
    .catch((error: unknown) => {
      parentPort?.postMessage({ frame: message.frame, error: error instanceof Error ? error.message : String(error) });
    });
});
