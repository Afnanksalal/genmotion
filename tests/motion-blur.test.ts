import { describe, expect, it } from 'vitest';
import { renderFrame } from '../src/engine/draw.js';
import { temporalSamplesForQuality } from '../src/engine/render.js';
import { projectSchema } from '../src/ir/schema.js';

function movingProject(motionBlur?: { shutterAngle: number; samples: number }) {
  return projectSchema.parse({
    schemaVersion: 1, id: 'motion-blur', title: 'Motion blur', width: 64, height: 64, fps: 10,
    brand: { background: '#000', foreground: '#fff', accent: '#f00', muted: '#777' }, motionBlur,
    scenes: [{ id: 'scene', purpose: 'Temporal sampling', duration: 1, background: '#000', layers: [{
      id: 'moving', type: 'shape', shape: 'rect', x: 0, y: 24, width: 10, height: 16, fill: '#fff',
      tracks: [{ id: 'travel', target: 'transform.x', keyframes: [{ at: 0, value: 0 }, { at: 1, value: 20 }] }],
    }] }],
  });
}

describe('native temporal motion blur', () => {
  it('averages deterministic shutter samples around an authored frame timestamp', async () => {
    const sharp = await renderFrame(movingProject(), process.cwd(), 5);
    const blurred = await renderFrame(movingProject({ shutterAngle: 360, samples: 5 }), process.cwd(), 5);
    const pixel = (frame: Buffer, x: number) => frame[(32 * 64 + x) * 4]!;
    expect(pixel(sharp, 9)).toBe(0);
    expect(pixel(blurred, 9)).toBeGreaterThan(0);
    expect(pixel(blurred, 9)).toBeLessThan(255);
    expect(await renderFrame(movingProject({ shutterAngle: 360, samples: 5 }), process.cwd(), 5)).toEqual(blurred);
  });

  it('validates temporal settings and bounds samples by render quality', () => {
    expect(() => movingProject({ shutterAngle: 361, samples: 4 })).toThrow();
    expect(() => movingProject({ shutterAngle: 180, samples: 17 })).toThrow();
    expect(temporalSamplesForQuality(12, 'draft')).toBe(2);
    expect(temporalSamplesForQuality(12, 'standard')).toBe(4);
    expect(temporalSamplesForQuality(12, 'high')).toBe(8);
  });
});
