import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeDomainSkillExample, loadDomainSkills, loadDomainSkillState, saveDomainSkillState, selectDomainSkills } from '../src/agent/skill-packages.js';

const root = path.resolve('skills/genmotion/domains');
describe('lazy resumable domain skills', () => {
  it('loads explicit contracts, selects only relevant skills, executes examples and resumes durable state', async () => {
    const skills = await loadDomainSkills(root); expect(skills.map(skill => skill.manifest.id)).toEqual(['audio', 'captions', 'delivery', 'reference-adaptation']);
    const selected = await selectDomainSkills(root, 'Render a captioned master with loudness checks'); expect(selected.map(skill => skill.manifest.id)).toEqual(['delivery', 'audio', 'captions']);
    const executed = await executeDomainSkillExample(selected[0]!, { [selected[0]!.manifest.id]: () => selected[0]!.example.output }); expect(executed.output).toEqual(selected[0]!.example.output);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-skill-state-'));
    try { const file = path.join(directory, 'audio.json'), state = { version: 1 as const, skillId: 'audio', projectRevision: 'abc', updatedAt: '2026-09-09T00:00:00.000Z', steps: [{ id: 'measure', status: 'complete' as const, artifactHashes: ['a'.repeat(64)] }] }; await saveDomainSkillState(file, state); expect(await loadDomainSkillState(file)).toEqual(state); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
});
