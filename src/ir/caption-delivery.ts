import { z } from 'zod';
import { serializeCaptions } from '../captions.js';
import type { CaptionCue, CaptionLayer, CaptionStyle, GenmotionProject } from './schema.js';

const languageTag = z.string().min(2).max(64).regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/);
export const captionDeliveryOptionsSchema = z.object({
  mode: z.enum(['burned-in', 'sidecar', 'embedded']),
  languages: z.array(languageTag).min(1).max(16).optional(),
  format: z.enum(['srt', 'vtt']).default('vtt'),
  container: z.enum(['mp4', 'mov', 'mkv', 'webm']).optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === 'embedded' && !value.container) context.addIssue({ code: 'custom', path: ['container'], message: 'Embedded captions require an output container' });
});
export type CaptionDeliveryOptions = z.input<typeof captionDeliveryOptionsSchema>;

export interface ResolvedCaptionTrack {
  layerId: string;
  language: string;
  name: string;
  default: boolean;
  cues: CaptionCue[];
}

export function captionLayerStyle(project: GenmotionProject, layer: CaptionLayer, cue?: CaptionCue): CaptionStyle {
  const preset = layer.stylePresetId ? project.captionStylePresets.find((item) => item.id === layer.stylePresetId) : undefined;
  return { ...(preset?.style ?? {}), ...(cue?.speaker ? layer.speakerStyles?.[cue.speaker] : {}), ...(cue?.style ?? {}) };
}

export function captionLayerEnabled(project: GenmotionProject, layer: CaptionLayer): boolean {
  if (!project.captionPreviewLanguages.length) return layer.defaultTrack;
  return Boolean(layer.language && project.captionPreviewLanguages.some((tag) => tag.toLowerCase() === layer.language!.toLowerCase()));
}

/** Resolve authored caption layers into absolute project-time tracks. */
export function resolveCaptionTracks(project: GenmotionProject, languages?: string[]): ResolvedCaptionTrack[] {
  const wanted = languages?.map((item) => item.toLowerCase());
  const output: ResolvedCaptionTrack[] = [];
  let sceneOffset = 0;
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      if (layer.type !== 'caption') continue;
      const language = layer.language ?? 'und';
      if (wanted && !wanted.includes(language.toLowerCase())) continue;
      const offset = sceneOffset + layer.start;
      output.push({ layerId: layer.id, language, name: layer.trackName ?? language, default: layer.defaultTrack,
        cues: layer.cues.map((cue) => ({ ...cue, start: cue.start + offset, end: cue.end + offset, words: cue.words.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset })) })),
      });
    }
    sceneOffset += scene.duration;
  }
  return output.sort((a, b) => a.language.localeCompare(b.language) || a.layerId.localeCompare(b.layerId));
}

const embeddedCodec = (container: 'mp4' | 'mov' | 'mkv' | 'webm'): 'mov_text' | 'srt' | 'webvtt' => container === 'mp4' || container === 'mov' ? 'mov_text' : container === 'mkv' ? 'srt' : 'webvtt';

/** Produce deterministic subtitle artifacts and mux metadata without invoking a renderer or mutating the project. */
export function createCaptionDeliveryPlan(project: GenmotionProject, input: CaptionDeliveryOptions) {
  const options = captionDeliveryOptionsSchema.parse(input), tracks = resolveCaptionTracks(project, options.languages);
  if (!tracks.length) throw new Error('No caption tracks match the requested delivery languages');
  const defaults = new Map<string, number>();
  for (const track of tracks) if (track.default) defaults.set(track.language, (defaults.get(track.language) ?? 0) + 1);
  for (const [language, count] of defaults) if (count > 1) throw new Error(`Caption language ${language} has more than one default track`);
  if (options.mode === 'burned-in') return { version: 1 as const, mode: options.mode, tracks, layerIds: tracks.map((track) => track.layerId), artifacts: [], mux: null };
  const artifacts = tracks.map((track, index) => ({ id: `caption-${index + 1}`, language: track.language, name: track.name, default: track.default,
    filename: `${project.outputName ?? project.id}.${track.language}.${options.format}`, mediaType: options.format === 'vtt' ? 'text/vtt' as const : 'application/x-subrip' as const,
    content: serializeCaptions(track.cues, options.format),
  }));
  if (options.mode === 'sidecar') return { version: 1 as const, mode: options.mode, tracks, artifacts, mux: null };
  const container = options.container!;
  return { version: 1 as const, mode: options.mode, tracks, artifacts, mux: { container, codec: embeddedCodec(container), streams: artifacts.map((artifact, index) => ({ input: artifact.filename, streamIndex: index, language: artifact.language, title: artifact.name, default: artifact.default })) } };
}
