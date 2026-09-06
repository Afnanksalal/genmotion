import { createCanvas, Path2D } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { normalizePath, pathMetrics } from '../src/engine/path.js';
import { absoluteSvgPath, parseSvgPath, serializeSvgPath } from '../src/engine/svg-path.js';

describe('SVG path grammar and canonical geometry', () => {
  it('parses implicit lines, exponents, compact decimals and adjacent arc flags', () => {
    expect(parseSvgPath('m1e1-2.5 3.5.5h4v-2z')).toEqual([
      { command: 'm', values: [10, -2.5] }, { command: 'l', values: [3.5, 0.5] }, { command: 'h', values: [4] }, { command: 'v', values: [-2] }, { command: 'z', values: [] },
    ]);
    expect(parseSvgPath('M0 0A10 20 30 0110 40')[1]).toEqual({ command: 'A', values: [10, 20, 30, 0, 1, 10, 40] });
    expect(parseSvgPath('')).toEqual([]);
    for (const value of ['L0 0', 'M,0 0', 'M0,,0', 'M0 0,', 'M0 0X2 2', 'M0 0 Z 1 2', 'M0 0A1 1 0 2 0 2 2', 'M0 0L1e999 2', 'M0 0C1 2']) expect(() => parseSvgPath(value)).toThrow('SVG path');
  });

  it('expands reflected controls and preserves closure and subpath origins', () => {
    const canonical = normalizePath('m10 10 c0 10 10 10 10 0 s10-10 10 0 q5 10 10 0 t10 0 z m40 0 h10 v10 z');
    expect(canonical).toBe('M10 10 C10 20 20 20 20 10 C20 0 30 0 30 10 Q35 20 40 10 Q45 0 50 10 Z M50 10 L60 10 L60 20 Z');
    expect(normalizePath(canonical)).toBe(canonical);
    expect(normalizePath('M0 0S1 2 3 4T5 6')).toBe('M0 0 C0 0 1 2 3 4 Q3 4 5 6');
    expect(normalizePath('M1 2a-10-20 30 0 1 40 50')).toBe('M1 2 A10 20 30 0 1 41 52');
  });

  it('roundtrips every command without changing native fill or stroke pixels', () => {
    const original = 'M10 10h70v70h-70z M25 25v40h40v-40z M90 15c10 0 10 20 20 20s10-20 20-20q15 5 10 20t-10 20a10 8 20 0 1-15 15z';
    const canonical = serializeSvgPath(absoluteSvgPath(parseSvgPath(original)));
    const draw = (data: string): Buffer => {
      const canvas = createCanvas(160, 100), context = canvas.getContext('2d');
      context.fillStyle = '#ffaa55'; context.fill(new Path2D(data)); context.strokeStyle = '#ffffff'; context.lineWidth = 2; context.stroke(new Path2D(data));
      return Buffer.from(context.getImageData(0, 0, 160, 100).data);
    };
    expect(draw(canonical)).toEqual(draw(original));
    expect(pathMetrics(canonical).length).toBeCloseTo(pathMetrics(original).length, 6);
    expect(canonical.match(/M/g)).toHaveLength(3);
    expect(canonical.match(/Z/g)).toHaveLength(3);
  });

  it('rejects invalid programmatic commands and coordinate overflow', () => {
    expect(() => serializeSvgPath([{ command: 'C', values: [1, 2] }])).toThrow('Invalid');
    expect(() => serializeSvgPath([{ command: 'A', values: [1, 1, 0, 2, 0, 1, 1] }])).toThrow('flags');
    expect(() => absoluteSvgPath('M1e308 0l1e308 0')).toThrow('overflow');
    expect(() => normalizePath('M0 0', 0)).toThrow('positive');
  });
});
