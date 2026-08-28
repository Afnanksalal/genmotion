import { createHash } from 'node:crypto';
import { sceneBlueprints } from '../catalog/blueprints.js';
import { motionRecipes } from '../catalog/motions.js';
import { conceptSchema, type CreativeBrief, type CreativeConcept, type ScoredConcept } from './types.js';
import { retrieveReferences } from './retrieval.js';
import { generateStructured, type ProviderConfig } from './provider.js';
import { rankConcepts } from './critic.js';
import { GenmotionError } from '../errors.js';

function conceptId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

function selectBlueprints(brief: CreativeBrief, count: number) {
  const role = brief.mode === 'walkthrough' ? 'walkthrough' : brief.mode === 'pitch' ? 'proof' : brief.mode === 'launch' ? 'launch' : 'platform';
  return [...sceneBlueprints].sort((a, b) => Number(b.roles.includes(role)) - Number(a.roles.includes(role)) + Number(b.energy === brief.energy) - Number(a.energy === brief.energy)).slice(0, count);
}

function deterministicConcepts(brief: CreativeBrief, count: number): CreativeConcept[] {
  const references = retrieveReferences(brief, Math.min(6, Math.max(4, count + 1)));
  const blueprints = selectBlueprints(brief, Math.min(count, sceneBlueprints.length));
  return Array.from({ length: count }, (_, index) => {
    const blueprint = blueprints[index % blueprints.length];
    if (!blueprint) throw new GenmotionError('CATALOG_EMPTY', 'No scene blueprints are installed.');
    const first = references[index % references.length];
    const second = references[(index + 2) % references.length];
    if (!first || !second) throw new GenmotionError('CATALOG_EMPTY', 'At least two taste references are required.');
    const phases = blueprint.phases.map((phase, phaseIndex) => ({
      purpose: phase.purpose,
      composition: `${phaseIndex === 0 ? first.composition[0] : second.composition[phaseIndex % second.composition.length]} The focal order follows ${phase.name}.`,
      motion: phase.recipes.filter((id) => motionRecipes.some((recipe) => recipe.id === id)),
      holdSeconds: Math.max(0.4, brief.duration * (phase.range[1] - phase.range[0]) * 0.45),
    }));
    return conceptSchema.parse({
      id: conceptId(`${brief.id}:${blueprint.id}:${first.id}:${second.id}`),
      title: `${blueprint.title}: ${first.family} × ${second.family}`,
      thesis: `${brief.promise} is expressed through ${blueprint.signatureMove.toLowerCase()} with ${first.family} restraint and ${second.family} structure.`,
      blueprintId: blueprint.id,
      referenceIds: [first.id, second.id],
      borrow: [first.borrow[index % first.borrow.length], second.borrow[(index + 1) % second.borrow.length]].filter(Boolean),
      avoid: [...first.avoid.slice(0, 1), ...second.avoid.slice(0, 1)],
      transform: [first.transform[0], second.transform[0]].filter(Boolean),
      sceneDirections: phases,
      negativeConstraints: [...new Set([...brief.forbiddenClaims, ...first.avoid, ...second.avoid, ...blueprint.constraints])],
    });
  });
}

export async function createConcepts(brief: CreativeBrief, options: { count?: number; provider?: ProviderConfig } = {}): Promise<ScoredConcept[]> {
  const count = Math.max(2, Math.min(options.count ?? 8, 16));
  let concepts: CreativeConcept[];
  if (!options.provider) concepts = deterministicConcepts(brief, count);
  else {
    const references = retrieveReferences(brief, 6);
    const system = 'You are Genmotion Creative Director. Produce distinct, feasible motion-design concepts as strict JSON. References are abstract design knowledge, not visuals to copy. Every concept must state what it borrows, avoids, and transforms. Use only supplied blueprint and motion recipe IDs.';
    const prompt = JSON.stringify({ task: `Generate ${String(count)} distinct concepts. Return {"concepts": [...]}.`, brief, references, blueprints: sceneBlueprints, motionRecipes });
    const raw = await generateStructured(options.provider, system, prompt) as { concepts?: unknown[] };
    if (!Array.isArray(raw.concepts)) throw new GenmotionError('PROVIDER_OUTPUT_INVALID', 'Creative provider did not return a concepts array.');
    concepts = raw.concepts.map((concept) => conceptSchema.parse(concept));
  }
  return rankConcepts(brief, concepts);
}
