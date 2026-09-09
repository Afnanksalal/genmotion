import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareReferenceOutput } from '../src/ir/reference-comparison.js';

describe('reference versus output comparison', () => {
  it('retains aligned evidence, regional metrics, exclusions and boundary samples', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-reference-compare-'));
    try {
      const reference = path.resolve('examples/kinetic-type/kinetic-type.mp4'), output = path.join(directory, 'output.mp4'); await cp(reference, output);
      const report = await compareReferenceOutput({ reference, output, destination: path.join(directory, 'report'), alignments: [{ id: 'opening', referenceTime: 0, outputTime: 0, boundary: true, regions: [{ id: 'title', x: 0, y: 0, width: 1, height: .5 }], exclusions: [{ id: 'brand-change', x: 0, y: .8, width: 1, height: .2, reason: 'Approved identity replacement.' }] }] });
      expect(report.reference.sha256).toBe(report.output.sha256); expect(report.boundarySamples).toEqual(['opening']); expect(report.samples[0]?.metrics.global).toMatchObject({ changedRatio: 0, rmse: 0 }); expect(report.samples[0]?.metrics.regions).toHaveLength(1); expect(report.intentionalDifferences).toEqual([{ alignmentId: 'opening', regionId: 'brand-change', reason: 'Approved identity replacement.' }]); expect(report.contactSheet.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
