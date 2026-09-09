import { z } from 'zod';
import type { LoadedProject } from './loader.js';
import { createRenderPlan, renderPlanOptionsSchema, type RenderPlanOptions } from './render-plan.js';
import { reviewSamplePlan } from './review-sampling.js';
import { validateProject, type Finding } from './validate.js';

export const checkReportOptionsSchema = z.object({
  maxSamples: z.number().int().min(2).max(10_000).default(240),
  render: renderPlanOptionsSchema.optional(),
}).strict();
export type CheckReportOptions = { maxSamples?: number; render?: RenderPlanOptions | undefined };

export interface CheckSection {
  id: 'schema' | 'assets' | 'layout' | 'media' | 'contrast' | 'motion' | 'output';
  status: 'passed' | 'warning' | 'failed' | 'incomplete';
  complete: boolean;
  findings: Finding[];
  note: string;
}

const category = (finding: Finding): CheckSection['id'] => {
  if (/ASSET|FONT|SOURCE|LUT/.test(finding.code)) return 'assets';
  if (/TEXT|CAPTION|OVERFLOW|OFF_CANVAS/.test(finding.code)) return 'layout';
  if (/CONTRAST|READAB/.test(finding.code)) return 'contrast';
  if (/TRACK|KEYFRAME|MOTION|STAGGER|TRANSITION/.test(finding.code)) return 'motion';
  if (/MEDIA|VIDEO|AUDIO|COLOR|HDR/.test(finding.code)) return 'media';
  if (/OUTPUT|RENDER|RANGE|RESOLUTION|ALPHA/.test(finding.code)) return 'output';
  return 'schema';
};

export function repairSuggestion(finding: Finding): { code: string; location?: string; automatic: false; suggestion: string } {
  const suggestion = /MISSING|UNKNOWN|ASSET|FONT/.test(finding.code) ? 'Restore or explicitly relink the referenced project-local dependency, then rerun validation.'
    : /OVERFLOW|OFF_CANVAS|SAFE_AREA/.test(finding.code) ? 'Inspect the evaluated target and adjust its authored bounds, fit, or declared safe-area exception.'
      : /TRACK|KEYFRAME|MOTION|TRANSITION/.test(finding.code) ? 'Inspect the owning native track or transition at the reported location and resolve its timing or ownership conflict.'
        : 'Inspect the precise source location and submit a revision-safe edit that preserves unrelated fields.';
  return { code: finding.code, ...(finding.location ? { location: finding.location } : {}), automatic: false, suggestion };
}

/** One bounded, versioned report over the native source and delivery contract. */
export async function createCheckReport(loaded: LoadedProject, input: CheckReportOptions = {}) {
  const options = checkReportOptionsSchema.parse(input);
  const [findings, render] = await Promise.all([validateProject(loaded), createRenderPlan(loaded, options.render ?? {})]);
  const sampling = reviewSamplePlan(loaded.project, options.maxSamples);
  const ids: CheckSection['id'][] = ['schema', 'assets', 'layout', 'media', 'contrast', 'motion', 'output'];
  const sections = ids.map((id): CheckSection => {
    const own = findings.filter((finding) => category(finding) === id);
    const failed = own.some((finding) => finding.severity === 'error');
    const incomplete = (id === 'motion' && sampling.coverage === 'truncated');
    return { id, status: failed ? 'failed' : own.length ? 'warning' : incomplete ? 'incomplete' : 'passed', complete: !incomplete, findings: own, note: id === 'motion' ? `${sampling.times.length}/${sampling.totalCandidates} planned review times covered.` : `${own.length} finding(s).` };
  });
  const incompleteChecks = sections.filter((section) => !section.complete).map((section) => section.id);
  return {
    version: 1 as const, sourceHash: render.sourceHash, ok: !findings.some((finding) => finding.severity === 'error') && incompleteChecks.length === 0,
    severity: findings.some((finding) => finding.severity === 'error') ? 'error' as const : findings.length ? 'warning' as const : incompleteChecks.length ? 'incomplete' as const : 'passed' as const,
    sampling, incompleteChecks, sections, findings, repairs: findings.map(repairSuggestion), render,
  };
}
