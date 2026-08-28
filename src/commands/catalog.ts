import { motionRecipes } from '../catalog/motions.js';
import { sceneBlueprints } from '../catalog/blueprints.js';
import { tasteReferences } from '../catalog/references.js';

function words(value: string): Set<string> { return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []); }
function score(query: Set<string>, value: string): number {
  const candidate = words(value);
  let hits = 0;
  for (const word of query) if (candidate.has(word)) hits += 1;
  return hits / Math.max(1, query.size);
}

export function searchCatalog(queryText: string, limit = 12) {
  const query = words(queryText);
  const entries = [
    ...motionRecipes.map((item) => ({ type: 'motion' as const, id: item.id, title: item.title, description: `${item.signature} ${item.roles.join(' ')} ${item.energy.join(' ')}` })),
    ...sceneBlueprints.map((item) => ({ type: 'blueprint' as const, id: item.id, title: item.title, description: `${item.signatureMove} ${item.roles.join(' ')} ${item.energy}` })),
    ...tasteReferences.map((item) => ({ type: 'reference' as const, id: item.id, title: item.title, description: `${item.family} ${item.keywords.join(' ')} ${item.motion.join(' ')}` })),
  ];
  return entries.map((entry) => ({ ...entry, score: score(query, `${entry.id} ${entry.title} ${entry.description}`) })).filter((entry) => entry.score > 0 || query.size === 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
