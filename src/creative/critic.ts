import { sceneBlueprints } from '../catalog/blueprints.js';
import { motionRecipes } from '../catalog/motions.js';
import { tasteReferences } from '../catalog/references.js';
import type { CreativeBrief, CreativeConcept, ScoredConcept } from './types.js';

function clamp(value: number): number { return Math.max(0, Math.min(10, value)); }

function tokens(values: string[]): Set<string> {
  return new Set(values.join(' ').toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2) ?? []);
}

function overlap(left: Set<string>, right: Set<string>): number {
  let matches = 0;
  for (const token of left) if (right.has(token)) matches += 1;
  return matches / Math.max(1, Math.min(left.size, right.size));
}

export function scoreConcept(brief: CreativeBrief, concept: CreativeConcept): ScoredConcept {
  const findings: string[] = [];
  const blueprint = sceneBlueprints.find((item) => item.id === concept.blueprintId);
  const references = concept.referenceIds.map((id) => tasteReferences.find((item) => item.id === id)).filter((item) => item !== undefined);
  const recipeIds = new Set(motionRecipes.map((recipe) => recipe.id));
  const selectedMotion = concept.sceneDirections.flatMap((scene) => scene.motion);
  const unknownMotion = selectedMotion.filter((id) => !recipeIds.has(id));
  if (!blueprint) findings.push('The selected blueprint does not exist.');
  if (references.length !== concept.referenceIds.length) findings.push('At least one reference does not exist.');
  if (unknownMotion.length > 0) findings.push(`Unknown motion recipes: ${unknownMotion.join(', ')}`);

  const briefTerms = tokens([brief.promise, ...brief.proof, ...brief.brand.tone]);
  const conceptTerms = tokens([concept.thesis, ...concept.borrow, ...concept.transform, ...concept.sceneDirections.map((scene) => scene.purpose)]);
  const coherence = clamp(4 + overlap(briefTerms, conceptTerms) * 6);
  const families = new Set(references.map((reference) => reference.family));
  const originality = clamp(4 + families.size * 1.4 + Math.min(2, concept.transform.length * 0.4) - Math.max(0, concept.borrow.length - 5) * 0.5);
  const feasibility = clamp(10 - findings.length * 3 - selectedMotion.reduce((sum, id) => sum + (motionRecipes.find((recipe) => recipe.id === id)?.cost ?? 5), 0) / Math.max(4, concept.sceneDirections.length * 4));
  const hierarchy = clamp(5 + concept.sceneDirections.filter((scene) => /first|primary|focal|result|promise|proof/i.test(`${scene.purpose} ${scene.composition}`)).length * 1.2);
  const brandFit = clamp(4 + overlap(tokens(brief.brand.tone), tokens(references.flatMap((reference) => [...reference.keywords, reference.energy]))) * 6);
  const score = coherence * 0.25 + originality * 0.22 + feasibility * 0.2 + hierarchy * 0.18 + brandFit * 0.15;
  return { concept, score, scores: { coherence, originality, feasibility, hierarchy, brandFit }, findings };
}

export function rankConcepts(brief: CreativeBrief, concepts: CreativeConcept[]): ScoredConcept[] {
  return concepts.map((concept) => scoreConcept(brief, concept)).sort((a, b) => b.score - a.score);
}
