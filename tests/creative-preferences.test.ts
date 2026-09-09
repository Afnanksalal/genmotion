import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { creativePreferenceSchema, inspectCreativePreferences, readPersonalPreferences, removeCreativePreference, resolveCreativePreferences, upsertCreativePreference, writePersonalPreferences } from '../src/ir/creative-preferences.js';

describe('creative preferences', () => {
  it('keeps inferred personal choices proposed until explicit confirmation', () => {
    const proposed = upsertCreativePreference([], { id: 'pace', key: 'motion.pace', scope: 'personal', value: 'fast', source: 'inferred', at: '2026-09-09T00:00:00.000Z' });
    expect(proposed[0]?.state).toBe('proposed');
    expect(resolveCreativePreferences([], proposed)).toEqual({});
    const confirmed = upsertCreativePreference(proposed, { id: 'pace', key: 'motion.pace', scope: 'personal', value: 'fast', source: 'inferred', confirm: true, at: '2026-09-09T00:01:00.000Z' });
    expect(resolveCreativePreferences([], confirmed)).toEqual({ 'motion.pace': 'fast' });
    expect(confirmed[0]?.history.map(item => item.action)).toEqual(['created', 'overridden', 'confirmed']);
  });

  it('applies project overrides and retains inspectable removal history', () => {
    const personal = upsertCreativePreference([], { id: 'accent', key: 'design.accent', scope: 'personal', value: 'blue', source: 'user', at: '2026-09-09T00:00:00.000Z' });
    const project = upsertCreativePreference([], { id: 'accent-project', key: 'design.accent', scope: 'project', value: 'green', source: 'user', at: '2026-09-09T00:00:00.000Z' });
    expect(resolveCreativePreferences(project, personal)).toEqual({ 'design.accent': 'green' });
    const removed = removeCreativePreference(project, 'accent-project', 'Reset for this project', '2026-09-09T00:02:00.000Z');
    expect(inspectCreativePreferences(removed, personal)).toMatchObject({ resolved: { 'design.accent': 'blue' }, removed: ['accent-project'] });
    expect(() => creativePreferenceSchema.parse({ ...personal[0], source: { kind: 'inferred', reference: '' }, history: personal[0]?.history.filter(item => item.action !== 'confirmed') })).toThrow();
  });

  it('persists personal defaults atomically in an explicit host store', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-preferences-')), file = path.join(directory, 'personal.json');
    try {
      const preferences = upsertCreativePreference([], { id: 'type', key: 'design.type', scope: 'personal', value: { family: 'Inter' }, source: 'user', at: '2026-09-09T00:00:00.000Z' });
      await writePersonalPreferences(file, preferences);
      expect(await readPersonalPreferences(file)).toEqual(preferences);
      await expect(writePersonalPreferences(file, upsertCreativePreference([], { id: 'bad', key: 'x', scope: 'project', value: true, source: 'user' }))).rejects.toThrow(/personal preference store/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
