import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/ir/loader.js';
import { compareNativeVariants } from '../src/engine/variant-comparison.js';

describe('native variant comparison', () => {
  it('renders labeled candidates at identical times and retains failures/truncation', async () => {
    const loaded = await loadProject('examples/native-milestones');
    const report = await compareNativeVariants(loaded, [{ id: 'green', label: 'Green', values: { accent: '#00ff00' } }, { id: 'invalid', label: 'Invalid', values: { missing: true } }], [0, 1, 2], 2);
    expect(report).toMatchObject({ version: 1, times: [0, 1], omittedTimes: 1, layout: { columns: 3, rows: 2, labels: ['Original', 'Green', 'Invalid'] }, candidates: [{ id: 'green', settings: { accent: '#00ff00' }, status: 'truncated' }, { id: 'invalid', status: 'failed', reason: expect.stringContaining('Unknown') }] });
    expect(report.candidates[0]!.frames).toHaveLength(2);
    expect(report.candidates[0]!.frames[0]).toMatchObject({ time: 0, sha256: expect.stringMatching(/^[a-f0-9]{64}$/), meanAbsoluteError: expect.any(Number) });
    expect(report.sheet.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });
});
 
