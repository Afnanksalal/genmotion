import { tasteReferences } from '../catalog/references.js';
import type { TasteReference } from '../catalog/types.js';
import type { CreativeBrief } from './types.js';

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2) ?? []);
}

function similarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / Math.sqrt(left.size * right.size);
}

function referenceText(reference: TasteReference): string {
  return [reference.title, reference.family, ...reference.roles, reference.energy, ...reference.keywords, ...reference.composition, ...reference.motion].join(' ');
}

export function retrieveReferences(brief: CreativeBrief, count = 4): TasteReference[] {
  const query = terms([brief.title, brief.mode, brief.audience, brief.promise, ...brief.proof, brief.energy, ...brief.brand.tone].join(' '));
  const scored = tasteReferences.map((reference) => ({ reference, relevance: similarity(query, terms(referenceText(reference))) + (reference.energy === brief.energy ? 0.35 : 0) }));
  const selected: TasteReference[] = [];
  while (selected.length < Math.min(count, scored.length)) {
    let best: { reference: TasteReference; value: number } | undefined;
    for (const candidate of scored) {
      if (selected.some((item) => item.id === candidate.reference.id)) continue;
      const familyPenalty = selected.some((item) => item.family === candidate.reference.family) ? 0.55 : 0;
      const contentPenalty = selected.length === 0 ? 0 : Math.max(...selected.map((item) => similarity(terms(referenceText(item)), terms(referenceText(candidate.reference))))) * 0.35;
      const value = candidate.relevance - familyPenalty - contentPenalty;
      if (!best || value > best.value) best = { reference: candidate.reference, value };
    }
    if (!best) break;
    selected.push(best.reference);
  }
  return selected;
}

export function referenceDistance(left: TasteReference, right: TasteReference): number {
  return 1 - similarity(terms(referenceText(left)), terms(referenceText(right)));
}
