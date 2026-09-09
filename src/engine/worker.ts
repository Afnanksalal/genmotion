import { parentPort, workerData } from 'node:worker_threads';
import type { GenmotionProject } from '../ir/schema.js';
import { renderFrame, renderFramePng, type RenderDimensions } from './draw.js';
import type { RenderView } from './render-view.js';

interface RenderWorkerData {
  project: GenmotionProject;
  projectDir: string;
  dimensions: RenderDimensions;
  view?: RenderView;
  format?: 'rgba' | 'png';
}

interface RenderRequest { frame: number }

const data = workerData as RenderWorkerData;

if (!parentPort) throw new Error('The frame worker must run inside a worker thread.');

parentPort.on('message', (message: RenderRequest) => {
  void (data.format === 'png' ? renderFramePng : renderFrame)(data.project, data.projectDir, message.frame, data.dimensions, data.view)
    .then((buffer) => {
      const array = Uint8Array.from(buffer).buffer;
      parentPort?.postMessage({ frame: message.frame, buffer: array }, [array]);
    })
    .catch((error: unknown) => {
      parentPort?.postMessage({ frame: message.frame, error: error instanceof Error ? error.message : String(error) });
    });
});
