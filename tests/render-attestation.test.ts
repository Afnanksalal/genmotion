import { describe, expect, it } from 'vitest';
import { createRenderInputAttestation } from '../src/ir/render-attestation.js';
import { loadProject } from '../src/ir/loader.js';

describe('render dependency attestation', () => {
  it('identifies and verifies frozen inputs by role and excludes outputs', async () => {
    const loaded = await loadProject('examples/kinetic-type');
    const output = 'examples/kinetic-type/renders/master.mp4';
    const report = await createRenderInputAttestation(loaded, [output]);
    expect(report.inputs).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'assets/Inter.ttf', roles: expect.arrayContaining(['font']), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })]));
    expect(report.excludedOutputs).toEqual([expect.stringMatching(/master[.]mp4$/)]);
    const original = loaded.sourceProject.brand.fonts[0]!.file;
    loaded.sourceProject.brand.fonts[0]!.file = 'renders/master.mp4';
    await expect(createRenderInputAttestation(loaded, [output])).rejects.toThrow(/own input closure/);
    loaded.sourceProject.brand.fonts[0]!.file = original;
  });
});
