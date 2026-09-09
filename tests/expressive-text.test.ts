import { describe, expect, it } from 'vitest';
import { projectSchema, renderFrame, type GenmotionProject } from '../src/index.js';

function project(text: Record<string, unknown>): GenmotionProject {
  return projectSchema.parse({ schemaVersion: 1, id: 'expressive-text', title: 'Expressive text', width: 320, height: 180, fps: 30, brand: { background: '#08090b', foreground: '#fff', accent: '#ff4d00', muted: '#777' }, scenes: [{ id: 'main', purpose: 'Type', duration: 2, background: '#08090b', layers: [{ id: 'title', type: 'text', text: 'Motion feels alive', x: 20, y: 60, width: 280, height: 70, fontFamily: 'Arial', fontSize: 34, color: '#fff', fit: 'none', wrap: 'none', ...text }] }] });
}

describe('expressive native text', () => {
  it('renders ordered run styles and timed current-word emphasis deterministically', async () => {
    const value = project({ runs: [{ start: 0, end: 6, style: { color: '#ff4d00', fontWeight: 700 } }, { start: 7, end: 12, style: { color: '#55ddff', fontStyle: 'italic' } }], timedWords: [{ start: 0, end: .8, startOffset: 0, endOffset: 6 }, { start: .8, end: 1.6, startOffset: 7, endOffset: 12 }], currentWordStyle: { background: '#ffffff44', scale: 1.12 } });
    const first = await renderFrame(value, process.cwd(), 8), second = await renderFrame(value, process.cwd(), 32);
    expect(first.equals(second)).toBe(false); expect(await renderFrame(value, process.cwd(), 8)).toEqual(first);
  });
  it('lays grapheme-safe text onto an oriented path and animates notation drawing', async () => {
    const path = project({ text: 'Design motion', textPath: { path: 'M 20 100 C 90 20 230 20 300 100', startOffset: .05, progress: 1, orient: true }, notations: [] });
    const straight = project({ text: 'Design motion' });
    expect((await renderFrame(path, process.cwd(), 15)).equals(await renderFrame(straight, process.cwd(), 15))).toBe(false);
    const notation = project({ notations: [{ id: 'mark', type: 'rough-underline', start: 0, end: 6, color: '#ff4d00', width: 4, padding: 3, seed: 7, progress: { keyframes: [{ at: 0, value: 0 }, { at: 1, value: 1 }] } }] });
    expect((await renderFrame(notation, process.cwd(), 3)).equals(await renderFrame(notation, process.cwd(), 27))).toBe(false);
  });
  it('rejects overlapping, out-of-range, and wrapped path styling', () => {
    expect(() => project({ runs: [{ start: 0, end: 8, style: {} }, { start: 7, end: 9, style: {} }] })).toThrow(/ordered/);
    expect(() => project({ notations: [{ id: 'bad', type: 'circle', start: 0, end: 99, color: '#fff' }] })).toThrow(/exceeds/);
    expect(() => project({ wrap: 'word', textPath: { path: 'M0 0 L100 0' } })).toThrow(/wrap none/);
  });
});
