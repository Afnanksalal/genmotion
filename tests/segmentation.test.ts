import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareSegmentation, segmentationIsCurrent } from '../src/ir/segmentation.js';

describe('reversible segmentation preparation', () => {
  it('freezes foreground and inverse alpha with source/model settings and QA', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-segment-'));
    try {
      const source = path.join(directory, 'source.png'), foreground = path.join(directory, 'provider-foreground.png'), inverse = path.join(directory, 'provider-inverse.png'); await Promise.all([writeFile(source, 'source pixels'), writeFile(foreground, 'foreground pixels'), writeFile(inverse, 'inverse pixels')]);
      const result = await prepareSegmentation(source, path.join(directory, 'derived'), { id: 'local-segmenter', segment: () => Promise.resolve({ foreground, inverseAlpha: inverse, edgeError: .04, notes: ['Single-frame source; temporal QA is not applicable.'] }) }, { model: 'matte-v2', kind: 'image', settings: { feather: 2 } });
      expect(result).toMatchObject({ provider: 'local-segmenter', model: 'matte-v2', settings: { feather: 2 }, qa: { passed: true, temporalInstability: null }, inverseAlphaMeaning: 'inverse opacity matte; not an inpainted background' }); expect(result.artifacts.map(item => item.role)).toEqual(['foreground', 'inverse-alpha']); expect(await segmentationIsCurrent(result, source)).toBe(true);
      await writeFile(source, 'changed'); expect(await segmentationIsCurrent(result, source)).toBe(false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
