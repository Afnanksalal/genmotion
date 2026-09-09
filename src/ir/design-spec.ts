import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { LoadedProject } from './loader.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const color = z.string().regex(/^(#[0-9a-fA-F]{3,8}|transparent)$/);
export const designSpecSchema = z.object({
  version: z.literal(1), id: identifier, revision: z.string().min(1).max(200), sourceHash: sha256,
  provenance: z.object({ source: z.string().min(1).max(4000), importedAt: z.string().datetime(), rights: z.enum(['owned', 'licensed', 'reference-only', 'unknown']), attribution: z.string().max(4000).default('') }).strict(),
  palette: z.record(identifier, color).default({}),
  exactBindings: z.record(z.string().min(1).max(500), z.union([color, z.string().min(1).max(1000), z.number().finite(), z.boolean()])).default({}),
  fonts: z.record(identifier, z.object({ family: z.string().min(1), file: z.string().min(1).optional(), sha256: sha256.optional(), license: z.string().min(1).max(1000), provenance: z.string().min(1).max(4000) }).strict()).default({}),
  immutableAssets: z.array(z.object({ role: identifier, path: z.string().min(1), sha256 }).strict()).max(1000).default([]),
  recommendations: z.record(identifier, z.array(z.string().min(1).max(1000)).max(100)).default({}),
  enforcePalette: z.boolean().default(false),
}).strict();
export type DesignSpec = z.infer<typeof designSpecSchema>;

function at(value: unknown, path: string): unknown { return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value); }
function colors(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === 'string' && /^(#[0-9a-fA-F]{3,8}|transparent)$/.test(value)) result.add(value.toLowerCase());
  else if (Array.isArray(value)) for (const item of value) colors(item, result);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) if (!['path', 'src', 'file'].includes(key)) colors(item, result);
  return result;
}

/** Audit exact bindings, immutable identities, fonts, variants and medium guidance without mutating the project. */
export async function auditDesignSpec(loaded: LoadedProject) {
  const [{ resolveProjectAsset }, { resolveParameters }] = await Promise.all([import('./loader.js'), import('./parameters.js')]);
  const spec = loaded.project.designSpec;
  if (!spec) return { version: 1 as const, present: false as const, ok: false, findings: [{ code: 'DESIGN_SPEC_MISSING', severity: 'warning' as const, target: 'designSpec', message: 'No versioned design specification is attached.' }], variants: [] };
  const findings: Array<{ code: string; severity: 'warning' | 'error'; target: string; message: string }> = [];
  for (const [target, expected] of Object.entries(spec.exactBindings)) if (JSON.stringify(at(loaded.project, target)) !== JSON.stringify(expected)) findings.push({ code: 'DESIGN_BINDING_DRIFT', severity: 'error', target, message: `Expected ${JSON.stringify(expected)}; found ${JSON.stringify(at(loaded.project, target))}.` });
  for (const [role, expected] of Object.entries(spec.fonts)) {
    const font = loaded.project.brand.fonts.find(candidate => candidate.family === expected.family);
    if (!font || expected.file && font.file !== expected.file) findings.push({ code: 'DESIGN_FONT_DRIFT', severity: 'error', target: `designSpec.fonts.${role}`, message: `Required font ${expected.family}${expected.file ? ` at ${expected.file}` : ''} is not bound.` });
    if (font && expected.sha256) try { const actual = createHash('sha256').update(await readFile(resolveProjectAsset(loaded.projectDir, font.file))).digest('hex'); if (actual !== expected.sha256) findings.push({ code: 'DESIGN_FONT_IDENTITY_DRIFT', severity: 'error', target: font.file, message: 'Font bytes do not match the approved design specification.' }); } catch { findings.push({ code: 'DESIGN_FONT_IDENTITY_DRIFT', severity: 'error', target: font.file, message: 'Approved font bytes are unavailable.' }); }
  }
  for (const asset of spec.immutableAssets) try { const actual = createHash('sha256').update(await readFile(resolveProjectAsset(loaded.projectDir, asset.path))).digest('hex'); if (actual !== asset.sha256) findings.push({ code: 'DESIGN_ASSET_IDENTITY_DRIFT', severity: 'error', target: asset.path, message: `${asset.role} bytes changed from the approved identity.` }); } catch { findings.push({ code: 'DESIGN_ASSET_MISSING', severity: 'error', target: asset.path, message: `${asset.role} is unavailable.` }); }
  if (spec.enforcePalette) { const allowed = new Set(Object.values(spec.palette).map(value => value.toLowerCase())); for (const used of colors(loaded.project)) if (!allowed.has(used)) findings.push({ code: 'DESIGN_PALETTE_DRIFT', severity: 'warning', target: used, message: `${used} is outside the approved palette.` }); }
  const variants = loaded.project.variants.map(variant => { const resolved = resolveParameters(loaded.sourceProject, variant.values), drift = Object.entries(spec.exactBindings).filter(([target, expected]) => JSON.stringify(at(resolved, target)) !== JSON.stringify(expected)).map(([target]) => target); return { id: variant.id, drift }; });
  const medium = loaded.project.productionBrief?.destination?.value;
  if (medium && !spec.recommendations[medium]) findings.push({ code: 'DESIGN_MEDIUM_GUIDANCE_MISSING', severity: 'warning', target: 'productionBrief.destination', message: `No ${medium} recommendation is recorded.` });
  return { version: 1 as const, present: true as const, ok: !findings.some(finding => finding.severity === 'error'), identity: { id: spec.id, revision: spec.revision, sourceHash: spec.sourceHash }, provenance: spec.provenance, findings, variants, recommendation: medium ? spec.recommendations[medium] ?? [] : [] };
}
