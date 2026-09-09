import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeBatch, parseBatchRows } from '../src/ir/batch-render.js';
import { loadProject } from '../src/ir/loader.js';

describe('deterministic resumable batches', () => {
  it.each(['json', 'jsonl', 'csv'] as const)('validates %s rows with deterministic identities', async format => {
    const project = (await loadProject('tests/fixtures/basic')).project; project.parameters = [{ id: 'headline', label: 'Headline', type: 'string', default: 'Default' }];
    const input = format === 'json' ? '[{"values":{"headline":"One"}}]' : format === 'jsonl' ? '{"values":{"headline":"One"}}\n' : '$id,$label,headline\none,One,One\n';
    const rows = parseBatchRows(project, input, format); expect(rows[0]).toMatchObject({ values: { headline: 'One' }, identity: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it('isolates failures, bounds concurrency and skips previously accepted rows on retry', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-batch-'));
    try {
      const project = (await loadProject('tests/fixtures/basic')).project, rows = parseBatchRows(project, '[{"id":"ok","values":{}},{"id":"bad","values":{}}]', 'json'), state = path.join(directory, 'state.json'); let active = 0, peak = 0, calls = 0;
      const first = await executeBatch(project, rows, state, async (_resolved, row) => { calls++; active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 10)); active--; if (row.id === 'bad') throw new Error('isolated failure'); }, { concurrency: 1 });
      expect(first).toMatchObject({ accepted: 1, failed: 1, skipped: 0 }); expect(peak).toBe(1);
      const second = await executeBatch(project, rows, state, () => { calls++; return Promise.resolve(); }, { concurrency: 2 }); expect(second).toMatchObject({ accepted: 1, failed: 0, skipped: 1 }); expect(calls).toBe(3); expect(JSON.parse(await readFile(state, 'utf8'))).toHaveLength(2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
