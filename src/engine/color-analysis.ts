import { createHash } from 'node:crypto';

export interface SourceFrame { time: number; width: number; height: number; pixels: Uint8Array; colorMetadata?: { transfer?: string; primaries?: string; matrix?: string; range?: string } }
export interface ColorPatch { exposureStops: number; saturation: number; highlightCompression: number }
export interface ColorAnalysisReport { version: 1; sourceSha256: string; frames: { time: number; meanLuminance: number; p05Luminance: number; p95Luminance: number; meanChroma: number; meanSaturation: number; shadowClipRatio: number; highlightClipRatio: number }[]; aggregate: { luminance: number; chroma: number; saturation: number; shadowClipRatio: number; highlightClipRatio: number }; metadata: SourceFrame['colorMetadata'][]; suggestedPatch: ColorPatch; supported: boolean; diagnostics: string[] }

const percentile = (values: number[], amount: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * amount))] ?? 0;
export function analyzeSourceFrames(frames: SourceFrame[]): ColorAnalysisReport {
  if (!frames.length) throw new Error('Color analysis requires representative source frames.');
  const measured = frames.map(frame => {
    if (frame.width < 1 || frame.height < 1 || frame.pixels.length !== frame.width * frame.height * 4) throw new Error('Source frame dimensions do not match RGBA pixels.');
    const luminance: number[] = []; let chroma = 0, saturation = 0, shadows = 0, highlights = 0;
    for (let i = 0; i < frame.pixels.length; i += 4) { const r = frame.pixels[i]! / 255, g = frame.pixels[i + 1]! / 255, b = frame.pixels[i + 2]! / 255, high = Math.max(r, g, b), low = Math.min(r, g, b), y = .2126 * r + .7152 * g + .0722 * b; luminance.push(y); chroma += high - low; saturation += high ? (high - low) / high : 0; if (y <= 2 / 255) shadows += 1; if (y >= 253 / 255) highlights += 1; }
    const count = luminance.length;
    return { time: frame.time, meanLuminance: luminance.reduce((a, b) => a + b, 0) / count, p05Luminance: percentile(luminance, .05), p95Luminance: percentile(luminance, .95), meanChroma: chroma / count, meanSaturation: saturation / count, shadowClipRatio: shadows / count, highlightClipRatio: highlights / count };
  });
  const avg = (key: keyof (typeof measured)[number]) => measured.reduce((sum, item) => sum + Number(item[key]), 0) / measured.length;
  const aggregate = { luminance: avg('meanLuminance'), chroma: avg('meanChroma'), saturation: avg('meanSaturation'), shadowClipRatio: avg('shadowClipRatio'), highlightClipRatio: avg('highlightClipRatio') };
  const transfer = frames.map(frame => frame.colorMetadata?.transfer?.toLowerCase()), unsupported = transfer.some(value => value && !['srgb', 'bt709', 'iec61966-2-1'].includes(value));
  const diagnostics = [...(unsupported ? ['Automatic correction is disabled for unsupported log or HDR transfer metadata; conform or provide an explicit transform.'] : []), ...(frames.some(frame => !frame.colorMetadata) ? ['One or more frames have no color metadata; sRGB/Rec.709 cannot be assumed safely for automatic application.'] : [])];
  const suggestedPatch = { exposureStops: Math.max(-.5, Math.min(.5, Math.log2(.42 / Math.max(.01, aggregate.luminance)))), saturation: Math.max(.9, Math.min(1.1, .45 / Math.max(.05, aggregate.saturation))), highlightCompression: Math.max(0, Math.min(.35, aggregate.highlightClipRatio * 4)) };
  return { version: 1, sourceSha256: createHash('sha256').update(frames.reduce((buffers, frame) => Buffer.concat([buffers, Buffer.from(frame.pixels)]), Buffer.alloc(0))).digest('hex'), frames: measured, aggregate, metadata: frames.map(frame => frame.colorMetadata), suggestedPatch, supported: !unsupported, diagnostics };
}

export interface AppliedColorPatch { owner: 'genmotion:color-analysis'; sourceSha256: string; patch: ColorPatch }
export function applySuggestedColorPatch(report: ColorAnalysisReport, dryRun = true): { mode: 'dry-run' | 'applied'; edit?: AppliedColorPatch; evidence: ColorAnalysisReport } {
  if (!report.supported) throw new Error(report.diagnostics[0] ?? 'Unsupported source color metadata.');
  return dryRun ? { mode: 'dry-run', evidence: structuredClone(report) } : { mode: 'applied', edit: { owner: 'genmotion:color-analysis', sourceSha256: report.sourceSha256, patch: structuredClone(report.suggestedPatch) }, evidence: structuredClone(report) };
}
export function clearSuggestedColorPatch(edits: AppliedColorPatch[], sourceSha256: string): AppliedColorPatch[] { return edits.filter(edit => !(edit.owner === 'genmotion:color-analysis' && edit.sourceSha256 === sourceSha256)); }
