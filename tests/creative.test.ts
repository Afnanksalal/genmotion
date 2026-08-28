import { describe, expect, it } from 'vitest';
import { briefSchema } from '../src/creative/types.js';
import { retrieveReferences } from '../src/creative/retrieval.js';
import { createConcepts } from '../src/creative/planner.js';
import { composeProject } from '../src/creative/compose.js';

const brief = briefSchema.parse({
  id: 'agent-video', title: 'Agent Video', mode: 'launch', audience: 'creative developers',
  promise: 'Turn a product brief into a tasteful motion film', proof: ['Native deterministic renderer', 'Curated motion grammar'],
  desiredAction: 'Install Genmotion', duration: 24, energy: 'energetic',
  brand: { background: '#0b0d10', foreground: '#f5f7fa', accent: '#59e3a6', muted: '#a3abb8', primaryFont: 'Arial', displayFont: 'Arial', tone: ['technical', 'confident'] },
});

describe('creative system', () => {
  it('retrieves references from distinct visual families', () => {
    const references = retrieveReferences(brief, 4);
    expect(references).toHaveLength(4);
    expect(new Set(references.map((reference) => reference.family)).size).toBeGreaterThanOrEqual(3);
  });

  it('generates, ranks, and composes real concepts', async () => {
    const concepts = await createConcepts(brief, { count: 8 });
    expect(concepts).toHaveLength(8);
    expect(new Set(concepts.map((item) => item.concept.id)).size).toBe(8);
    expect(concepts[0]?.score).toBeGreaterThan(0);
    const project = composeProject(brief, concepts[0]!.concept);
    expect(project.scenes.length).toBeGreaterThan(1);
    expect(project.scenes[0]?.layers.some((layer) => layer.type === 'text' && layer.text === brief.promise)).toBe(true);
  });
});
