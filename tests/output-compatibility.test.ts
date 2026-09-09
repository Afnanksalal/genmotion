import { describe, expect, it } from 'vitest';
import { outputCompatibilityMatrix, resolveOutputCompatibility } from '../src/engine/output-compatibility.js';

describe('output compatibility matrix', () => {
  it('publishes every supported native codec contract', () => {
    expect(Object.keys(outputCompatibilityMatrix)).toEqual(['h264', 'h265', 'vp9', 'prores']);
    expect(resolveOutputCompatibility({ codec: 'vp9', filename: 'alpha.webm', width: 1920, height: 1080, alphaMode: 'preserve' })).toMatchObject({ compatible: true, pixelFormat: 'yuva420p', audioCodec: 'opus', backend: 'software', fallback: null });
    expect(resolveOutputCompatibility({ codec: 'h264', filename: 'master.mp4', width: 1920, height: 1080, hardwareAcceleration: true })).toMatchObject({ pixelFormat: 'yuv420p', backend: 'hardware', fallback: null });
  });
  it('rejects impossible combinations instead of silently falling back', () => {
    expect(() => resolveOutputCompatibility({ codec: 'h265', filename: 'master.mp4', width: 1920, height: 1080, hardwareAcceleration: true })).toThrow(/unavailable/);
    expect(() => resolveOutputCompatibility({ codec: 'h264', filename: 'alpha.mp4', width: 1920, height: 1080, alphaMode: 'preserve' })).toThrow(/requires/);
    expect(() => resolveOutputCompatibility({ codec: 'prores', filename: 'wrong.mp4', width: 1920, height: 1080 })).toThrow(/requires/);
    expect(() => resolveOutputCompatibility({ codec: 'vp9', filename: 'odd.webm', width: 1919, height: 1080 })).toThrow(/even/);
  });
});
