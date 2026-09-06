import { describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseCubeLut, sampleLookupTable } from '../src/engine/lut.js';
import { importCubeLut } from '../src/ir/lut-import.js';
import { loadProject } from '../src/ir/loader.js';

const spaces = { inputColorSpace: 'srgb', outputColorSpace: 'srgb' } as const;
describe('frozen CUBE LUTs', () => {
  it('honors red-fastest 3D indexing and distinct tetrahedral/trilinear interpolation', () => {
    const rows: string[] = [];
    for (let b = 0; b < 2; b += 1) for (let g = 0; g < 2; g += 1) for (let r = 0; r < 2; r += 1) rows.push(`${r * g} ${b} ${r}`);
    const lut = parseCubeLut('TITLE "Nonlinear test"\nLUT_3D_SIZE 2\n' + rows.join('\n'), spaces);
    expect(sampleLookupTable(lut, [.2, .4, .3])).toEqual([.2, .3, .2]);
    const trilinear = sampleLookupTable({ ...lut, interpolation: 'trilinear' }, [.2, .4, .3]);
    expect(trilinear[0]).toBeCloseTo(.08, 12); expect(trilinear[1]).toBeCloseTo(.3, 12); expect(trilinear[2]).toBeCloseTo(.2, 12);
    expect(sampleLookupTable(lut, [1, 1, 1])).toEqual([1, 1, 1]);
  });
  it('supports independent 1D domains and rejects malformed or oversized tables', () => {
    const lut = parseCubeLut('LUT_1D_SIZE 2\rDOMAIN_MAX 1 2 4\r0 0 0\r1 2 4\r', spaces);
    expect(sampleLookupTable(lut, [.3, .8, 1.6])).toEqual([.3, .8, 1.6]);
    expect(sampleLookupTable(lut, [-1, 3, 5])).toEqual([0, 2, 4]);
    for (const source of ['LUT_3D_SIZE 256', 'LUT_1D_SIZE 2\n0 0 0', 'LUT_1D_SIZE 2\nLUT_3D_SIZE 2', 'LUT_1D_SIZE 2\nDOMAIN_MIN 2 0 0\n0 0 0\n1 1 1', 'LUT_1D_SIZE 2\n0x0 0 0\n1 1 1', 'LUT_1D_SIZE 2\n0 0 0\nTITLE "Late"\n1 1 1']) expect(() => parseCubeLut(source, spaces)).toThrow();
  });
  it('keeps authored payloads compact, prepares native data and refuses source corruption', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-lut-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
      const lut = await importCubeLut(directory, '\uFEFFLUT_1D_SIZE 2\n0 0 0\n1 1 1\n', spaces);
      expect(lut.data).toBeUndefined();
      const original = await loadProject(directory); original.sourceProject.scenes[0]!.effects = [{ id: 'grade', type: 'lut', enabled: true, lut }];
      await writeFile(original.projectFile, JSON.stringify(original.sourceProject));
      const loaded = await loadProject(directory);
      expect(loaded.sourceProject.scenes[0]!.effects![0]!.lut!.data).toBeUndefined(); expect(loaded.project.scenes[0]!.effects![0]!.lut!.data).toHaveLength(6);
      await writeFile(path.join(directory, lut.source!.path), 'LUT_1D_SIZE 2\n1 1 1\n0 0 0\n');
      await expect(loadProject(directory)).rejects.toThrow('hash changed');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
