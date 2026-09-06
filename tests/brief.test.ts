import { describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { productionBriefSchema, resumeProductionBrief } from '../src/ir/brief.js';
import { loadProject } from '../src/ir/loader.js';
import { readProjectSnapshot } from '../src/ir/store.js';
import { renderFrame } from '../src/engine/draw.js';
import { runProcess } from '../src/engine/process.js';
import { buildPrompt } from '../src/agent/runtime.js';

describe('resumable production brief', () => {
  it('retains provenance, resumes resolved intake and validates bounded versioned requirements', () => {
    const brief = productionBriefSchema.parse({ version: 1, destination: { value: 'Product launch', origin: 'user' }, audience: { value: 'Engineers', origin: 'inferred', rationale: 'Product category' }, duration: { value: 30, origin: 'user' }, sourceRequirements: [{ id: 'logo', kind: 'logo', description: 'Official local logo', origin: 'user' }] });
    expect(resumeProductionBrief(brief)).toMatchObject({ resolved: ['destination', 'audience', 'duration'], missing: ['aspect', 'language', 'message'], userStated: ['destination', 'duration'], inferred: ['audience'], openRequiredSources: ['logo'] });
    expect(resumeProductionBrief().missing).toHaveLength(6);
    const prompt = buildPrompt({ host: 'codex', prompt: 'Continue the opening scene.', selection: {}, projectDir: '/project', projectFile: '/project/genmotion.json', projectTitle: 'Film', productionBrief: brief });
    expect(prompt).toContain('Reuse resolved production brief requirements');
    expect(prompt).toContain('Engineers'); expect(prompt).toContain('inferred');
    expect(() => productionBriefSchema.parse({ ...brief, version: 2 })).toThrow();
    expect(() => productionBriefSchema.parse({ ...brief, sourceRequirements: [...brief.sourceRequirements, ...brief.sourceRequirements] })).toThrow('unique');
    expect(() => productionBriefSchema.parse({ version: 1, sourceRequirements: Array.from({ length: 5 }, (_, index) => ({ id: String(index), kind: 'other', description: 'x'.repeat(9000), origin: 'user' })) })).toThrow('32768');
  });
  it('persists CLI brief revisions without changing native output or accepting stale updates', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-brief-'));
    try {
      await cp(path.resolve('tests/fixtures/basic'), directory, { recursive: true });
      const before = await loadProject(directory), revision = (await readProjectSnapshot(directory)).revision;
      const file = path.join(directory, 'brief.json');
      await writeFile(file, JSON.stringify({ version: 1, message: { value: 'A complete launch film', origin: 'user' }, duration: { value: 1, origin: 'user' } }));
      const args = [path.resolve('dist/cli.js'), 'brief', directory, '--file', file, '--expected-revision', revision];
      await runProcess(process.execPath, args);
      const after = await loadProject(directory);
      expect(after.sourceProject.productionBrief?.message?.value).toBe('A complete launch film');
      expect((await renderFrame(before.project, directory, 15)).equals(await renderFrame(after.project, directory, 15))).toBe(true);
      await expect(runProcess(process.execPath, args)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
