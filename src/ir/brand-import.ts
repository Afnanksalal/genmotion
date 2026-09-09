import { createHash } from 'node:crypto';
import { z } from 'zod';

const candidateSchema = z.object({ value: z.string().min(1).max(4000), occurrences: z.number().int().positive(), confidence: z.number().finite().min(0).max(1), sources: z.array(z.string().min(1).max(4000)).min(1).max(1000) }).strict();
const assetCandidateSchema = z.object({ kind: z.enum(['logo', 'image', 'video', 'icon']), sourceUrl: z.string().url(), localPath: z.string().min(1).max(2048).optional(), rights: z.enum(['owned', 'licensed', 'reference-only', 'unknown']).default('unknown'), attribution: z.string().max(4000).default('') }).strict();
export const brandImportInputSchema = z.object({ captureId: z.string().min(1).max(200), sourceUrl: z.string().url(), css: z.string().max(16 * 1024 * 1024).default(''), assets: z.array(assetCandidateSchema).max(10000).default([]) }).strict();
export type BrandImportInput = z.input<typeof brandImportInputSchema>;

function ranked(values: string[], source: string) {
  const counts = new Map<string, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const max = Math.max(1, ...counts.values()); return [...counts].map(([value, occurrences]) => candidateSchema.parse({ value, occurrences, confidence: Math.min(.99, .45 + .5 * occurrences / max), sources: [source] })).sort((a, b) => b.occurrences - a.occurrences || a.value.localeCompare(b.value));
}

/** Extract candidates only. Ambiguous identity and unknown rights stay unresolved. */
export function extractBrandImportManifest(raw: BrandImportInput) {
  const input = brandImportInputSchema.parse(raw), css = input.css.replace(/\/\*[\s\S]*?\*\//g, ''), sourceHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const colors = ranked([...css.matchAll(/(?:#[0-9a-f]{3,8}|(?:rgb|hsl|oklch)a?\([^)]*\))/gi)].map(match => match[0].toLowerCase()), input.sourceUrl);
  const fonts = ranked([...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)].flatMap(match => match[1]!.split(',').map(value => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)), input.sourceUrl);
  const customProperties = Object.fromEntries([...css.matchAll(/--([a-z0-9_-]+)\s*:\s*([^;}]+)/gi)].map(match => [match[1]!, match[2]!.trim()]));
  const motion = ranked([...css.matchAll(/(?:animation(?:-name)?|transition(?:-property)?)\s*:\s*([^;}]+)/gi)].map(match => match[1]!.trim()), input.sourceUrl);
  const logos = input.assets.filter(asset => asset.kind === 'logo'), findings: Array<{ code: string; severity: 'warning' | 'error'; message: string; targets: string[] }> = [];
  if (logos.length !== 1) findings.push({ code: logos.length ? 'BRAND_LOGO_AMBIGUOUS' : 'BRAND_LOGO_MISSING', severity: 'error', message: logos.length ? 'Multiple logo candidates require an explicit identity decision.' : 'No logo candidate was observed.', targets: logos.map(asset => asset.sourceUrl) });
  const unknown = input.assets.filter(asset => asset.rights === 'unknown'); if (unknown.length) findings.push({ code: 'BRAND_ASSET_RIGHTS_UNKNOWN', severity: 'error', message: 'Candidate assets with unknown rights cannot be accepted silently.', targets: unknown.map(asset => asset.sourceUrl) });
  const unfrozen = input.assets.filter(asset => !asset.localPath); if (unfrozen.length) findings.push({ code: 'BRAND_ASSET_NOT_FROZEN', severity: 'warning', message: 'Remote candidates still require an explicit local import.', targets: unfrozen.map(asset => asset.sourceUrl) });
  return { version: 1 as const, captureId: input.captureId, sourceUrl: input.sourceUrl, sourceHash, candidates: { colors, fonts, customProperties, assets: input.assets, motion }, findings, ready: !findings.some(item => item.severity === 'error'), selection: null, substitutionPolicy: 'No candidate is selected or substituted automatically.' as const };
}
