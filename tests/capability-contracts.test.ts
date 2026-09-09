import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditCapabilityContracts, capabilityContractSchema, capabilityContracts } from '../src/capabilities/contracts.js';

describe('generated cross-surface capability contracts', () => {
  it('keeps typed contracts synchronized and reports exact surface drift', async () => {
    expect(capabilityContracts.map(contract => capabilityContractSchema.parse(contract).id)).toHaveLength(8);
    expect(await auditCapabilityContracts(process.cwd())).toEqual({ ok: true, contracts: 8, drift: [] });
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'genmotion-capabilities-'));
    try {
      for (const file of ['src/index.ts', 'src/cli.ts', 'src/mcp.ts', 'src/studio/server.ts', 'skills/genmotion/SKILL.md']) { const target = path.join(temporary, file); await mkdir(path.dirname(target), { recursive: true }); let content = await readFile(path.resolve(file), 'utf8'); if (file.endsWith('SKILL.md')) content = content.replace('reference adaptation', 'reference provenance'); await writeFile(target, content); }
      const drift = await auditCapabilityContracts(temporary); expect(drift.ok).toBe(false); expect(drift.drift).toEqual(expect.arrayContaining([expect.objectContaining({ capability: 'reference-adaptation', surface: 'skill' })]));
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });
});
