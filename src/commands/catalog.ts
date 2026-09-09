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

export function describeCatalogItem(type: 'motion' | 'blueprint' | 'reference', id: string) {
  if (type === 'motion') {
    const item = motionRecipes.find(candidate => candidate.id === id); if (!item) throw new Error(`Unknown motion catalog item: ${id}`);
    return { type, id, title: item.title, parameterRanges: { duration: item.duration, intensity: [0, 4] }, animation: { properties: item.properties, seekSafe: true }, example: { motion: [{ recipe: item.id, start: 0, duration: item.duration[0], intensity: 1 }] }, cost: item.cost, unsupported: item.incompatibleWith.map(value => `Cannot share ownership with ${value}`), accessibility: item.accessibility, directAuthoringAvailable: true };
  }
  if (type === 'blueprint') {
    const item = sceneBlueprints.find(candidate => candidate.id === id); if (!item) throw new Error(`Unknown blueprint catalog item: ${id}`);
    return { type, id, title: item.title, parameterRanges: { duration: item.duration }, animation: { phases: item.phases, seekSafe: true }, example: { scene: { id: 'scene-id', purpose: item.title, duration: item.duration[0], layers: [] } }, cost: Math.max(1, Math.min(5, item.phases.length)) as 1 | 2 | 3 | 4 | 5, unsupported: item.constraints, directAuthoringAvailable: true };
  }
  const item = tasteReferences.find(candidate => candidate.id === id); if (!item) throw new Error(`Unknown reference catalog item: ${id}`);
  return { type, id, title: item.title, parameterRanges: {}, animation: { observations: item.motion, seekSafe: true }, example: { referenceDecisions: [{ referenceId: item.id, borrow: item.borrow, avoid: item.avoid, transform: item.transform }] }, cost: 1 as const, unsupported: ['Reference studies are direction only and are not applied as executable renderer content.'], provenance: item.provenance, license: item.license, directAuthoringAvailable: true };
}
