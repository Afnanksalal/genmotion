import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject } from '../src/ir/loader.js';
import { renderFrame, renderFramePng } from '../src/engine/draw.js';
import { PreviewFrameRenderer } from '../src/engine/preview-frames.js';

describe('bounded native preview rendering', () => {
  it('encodes the drawn surface with the same opaque pixels as the export path', async () => {
    const loaded = await loadProject('tests/fixtures/basic');
    const expected = await renderFrame(loaded.project, loaded.projectDir, 15);
    const png = await renderFramePng(loaded.project, loaded.projectDir, 15);
    const canvas = createCanvas(loaded.project.width, loaded.project.height);
    canvas.getContext('2d').drawImage(await loadImage(png), 0, 0);
    expect(Buffer.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)).toEqual(expected);
  });
  it('bounds pending work, changes revision, and closes workers without stranded promises', async () => {
    const loaded = await loadProject('tests/fixtures/basic');
    const renderer = new PreviewFrameRenderer(1, 2), dimensions = { width: 160, height: 90 };
    try {
      const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => renderer.render('one', loaded.project, loaded.projectDir, i, dimensions)));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
      for (const result of results) if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'PREVIEW_BUSY' });
      const png = await renderer.render('two', loaded.project, loaded.projectDir, 10, dimensions);
      expect(await loadImage(png)).toMatchObject(dimensions);
      const rgba = await renderer.render('two', loaded.project, loaded.projectDir, 10, dimensions, 'rgba');
      expect(rgba).toEqual(await renderFrame(loaded.project, loaded.projectDir, 10, dimensions));
    } finally { await renderer.close(); }
    await expect(renderer.render('two', loaded.project, loaded.projectDir, 10, dimensions)).rejects.toMatchObject({ code: 'PREVIEW_CLOSED' });
  });
  it('settles superseded generations and rejects invalid capacity', async () => {
    expect(() => new PreviewFrameRenderer(0)).toThrow(/Preview workers/);
    expect(() => new PreviewFrameRenderer(2, 1)).toThrow(/Preview workers/);
    const loaded = await loadProject('tests/fixtures/basic');
    const renderer = new PreviewFrameRenderer(1, 2);
    try {
      const requests = ['old', 'intermediate', 'current'].map(key => renderer.render(key, loaded.project, loaded.projectDir, 0, { width: 160, height: 90 }));
      const outcomes = await Promise.allSettled(requests);
      expect(outcomes[2]?.status).toBe('fulfilled');
      expect(outcomes).toHaveLength(3);
    } finally { await renderer.close(); }
  });

});
