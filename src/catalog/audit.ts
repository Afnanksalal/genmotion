import { motionRecipes } from './motions.js';
import { tasteReferences } from './references.js';
import { sceneBlueprints } from './blueprints.js';
import { motionRecipeClaims } from '../engine/motion.js';

export interface CatalogAudit { ok: boolean; entries: number; findings: string[] }

export function auditCatalog(): CatalogAudit {
  const findings: string[] = [];
  const allIds = [...motionRecipes.map((item) => item.id), ...tasteReferences.map((item) => item.id), ...sceneBlueprints.map((item) => item.id)];
  const duplicates = allIds.filter((id, index) => allIds.indexOf(id) !== index);
  for (const id of new Set(duplicates)) findings.push(`Duplicate catalog id: ${id}`);
  const motionIds = new Set(motionRecipes.map((item) => item.id));
  for (const blueprint of sceneBlueprints) {
    for (const phase of blueprint.phases) for (const recipe of phase.recipes) if (!motionIds.has(recipe)) findings.push(`${blueprint.id} references unknown motion ${recipe}`);
    if (blueprint.phases[0]?.range[0] !== 0 || blueprint.phases.at(-1)?.range[1] !== 1) findings.push(`${blueprint.id} phases must cover the normalized timeline.`);
  }
  for (const reference of tasteReferences) {
    if (!reference.provenance.trim()) findings.push(`${reference.id} is missing provenance.`);
    if (!reference.license.trim()) findings.push(`${reference.id} is missing a license.`);
    if (reference.borrow.length === 0 || reference.avoid.length === 0 || reference.transform.length === 0) findings.push(`${reference.id} must define borrow, avoid, and transform decisions.`);
  }
  for (const recipe of motionRecipes) {
    if (recipe.accessibility.length === 0) findings.push(`${recipe.id} needs an accessibility constraint.`);
    const declared = [...new Set(recipe.properties)].sort();
    const implemented = [...new Set(motionRecipeClaims(recipe))].sort();
    if (JSON.stringify(declared) !== JSON.stringify(implemented)) findings.push(`${recipe.id} declares ${declared.join(', ')} but renders ${implemented.join(', ')}.`);
  }
  return { ok: findings.length === 0, entries: allIds.length, findings };
}
