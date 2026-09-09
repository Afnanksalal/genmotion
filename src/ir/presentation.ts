import { z } from 'zod';
import type { GenmotionProject } from './schema.js';

const id = z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const presentationManifestSchema = z.object({
  version: z.literal(1), id, title: z.string().min(1).max(200),
  scenes: z.array(z.object({ sceneId: id, notes: z.string().max(20_000).default(''), fragments: z.array(z.object({ id, at: z.number().finite().nonnegative(), label: z.string().max(200).optional() }).strict()).max(1000).default([]), hotspots: z.array(z.object({ id, layerId: id, action: z.discriminatedUnion('type', [z.object({ type: z.literal('next') }).strict(), z.object({ type: z.literal('branch'), branchId: id }).strict()]) }).strict()).max(1000).default([]) }).strict()).min(1).max(10_000),
  branches: z.array(z.object({ id, fromSceneId: id, toSceneId: id, returnSceneId: id.optional() }).strict()).max(10_000).default([]),
}).strict();
export type PresentationManifest = z.infer<typeof presentationManifestSchema>;

export function validatePresentationManifest(project: GenmotionProject, input: z.input<typeof presentationManifestSchema>) {
  const manifest = presentationManifestSchema.parse(input), sceneIds = new Set(project.scenes.map((scene) => scene.id)), ordered = new Set<string>(), diagnostics: Array<{ code: string; target: string; message: string }> = [];
  for (const entry of manifest.scenes) {
    if (!sceneIds.has(entry.sceneId)) diagnostics.push({ code: 'PRESENTATION_SCENE_MISSING', target: entry.sceneId, message: 'Presentation scene is absent from the project.' });
    if (ordered.has(entry.sceneId)) diagnostics.push({ code: 'PRESENTATION_SCENE_DUPLICATE', target: entry.sceneId, message: 'A scene may appear once in the ordered presentation.' }); ordered.add(entry.sceneId);
    const scene = project.scenes.find((candidate) => candidate.id === entry.sceneId), layerIds = new Set(scene?.layers.map((layer) => layer.id));
    for (const fragment of entry.fragments) if (!scene || fragment.at > scene.duration) diagnostics.push({ code: 'PRESENTATION_FRAGMENT_OUTSIDE', target: fragment.id, message: 'Fragment time exceeds its scene.' });
    for (const hotspot of entry.hotspots) if (!layerIds.has(hotspot.layerId)) diagnostics.push({ code: 'PRESENTATION_HOTSPOT_TARGET_MISSING', target: hotspot.id, message: 'Hotspot layer is absent from its scene.' });
    if (entry.fragments.some((fragment, fragmentIndex) => fragmentIndex > 0 && fragment.at <= entry.fragments[fragmentIndex - 1]!.at)) diagnostics.push({ code: 'PRESENTATION_FRAGMENT_ORDER', target: entry.sceneId, message: 'Fragment times must increase.' });
  }
  const branchIds = new Set(manifest.branches.map((branch) => branch.id));
  for (const branch of manifest.branches) for (const target of [branch.fromSceneId, branch.toSceneId, branch.returnSceneId].filter(Boolean) as string[]) if (!ordered.has(target)) diagnostics.push({ code: 'PRESENTATION_BRANCH_TARGET_MISSING', target: branch.id, message: `Branch target ${target} is absent from the manifest.` });
  for (const entry of manifest.scenes) for (const hotspot of entry.hotspots) if (hotspot.action.type === 'branch' && !branchIds.has(hotspot.action.branchId)) diagnostics.push({ code: 'PRESENTATION_BRANCH_MISSING', target: hotspot.id, message: 'Hotspot references an unknown branch.' });
  const adjacency = new Map(manifest.branches.filter((branch) => !branch.returnSceneId).map((branch) => [branch.fromSceneId, branch.toSceneId])), visiting = new Set<string>(), visited = new Set<string>();
  const visit = (sceneId: string): void => { if (visiting.has(sceneId)) { diagnostics.push({ code: 'PRESENTATION_BRANCH_CYCLE', target: sceneId, message: 'Non-returning branches form a cycle.' }); return; } if (visited.has(sceneId)) return; visiting.add(sceneId); const next = adjacency.get(sceneId); if (next) visit(next); visiting.delete(sceneId); visited.add(sceneId); };
  for (const entry of manifest.scenes) visit(entry.sceneId);
  return { manifest, ok: diagnostics.length === 0, diagnostics };
}

export interface PresentationView { sequence: number; sceneId: string; sceneIndex: number; fragmentIndex: number; hold: boolean; notes?: string; branchStack: string[] }
export class PresentationSession {
  private sequence = 0; private sceneIndex = 0; private fragmentIndex = -1; private hold = true; private stack: string[] = []; private listeners = new Set<(view: PresentationView) => void>();
  constructor(private readonly manifest: PresentationManifest, private readonly presenter = false) {}
  view(): PresentationView { const scene = this.manifest.scenes[this.sceneIndex]!; return { sequence: this.sequence, sceneId: scene.sceneId, sceneIndex: this.sceneIndex, fragmentIndex: this.fragmentIndex, hold: this.hold, ...(this.presenter ? { notes: scene.notes } : {}), branchStack: [...this.stack] }; }
  subscribe(listener: (view: PresentationView) => void): () => void { this.listeners.add(listener); listener(this.view()); return () => this.listeners.delete(listener); }
  private publish(): PresentationView { this.sequence += 1; const view = this.view(); for (const listener of this.listeners) listener(view); return view; }
  next(): PresentationView { const scene = this.manifest.scenes[this.sceneIndex]!; if (this.fragmentIndex + 1 < scene.fragments.length) this.fragmentIndex += 1; else if (this.sceneIndex + 1 < this.manifest.scenes.length) { this.sceneIndex += 1; this.fragmentIndex = -1; } this.hold = true; return this.publish(); }
  previous(): PresentationView { if (this.fragmentIndex >= 0) this.fragmentIndex -= 1; else if (this.sceneIndex > 0) { this.sceneIndex -= 1; this.fragmentIndex = this.manifest.scenes[this.sceneIndex]!.fragments.length - 1; } this.hold = true; return this.publish(); }
  branch(id: string): PresentationView { const branch = this.manifest.branches.find((item) => item.id === id); if (!branch || branch.fromSceneId !== this.manifest.scenes[this.sceneIndex]!.sceneId) throw new Error('Branch is unavailable from the current scene'); if (branch.returnSceneId) this.stack.push(branch.returnSceneId); this.sceneIndex = this.manifest.scenes.findIndex((scene) => scene.sceneId === branch.toSceneId); this.fragmentIndex = -1; return this.publish(); }
  return(): PresentationView { const target = this.stack.pop(); if (!target) throw new Error('No presentation branch return is pending'); this.sceneIndex = this.manifest.scenes.findIndex((scene) => scene.sceneId === target); this.fragmentIndex = -1; return this.publish(); }
  sync(remote: PresentationView): PresentationView { if (!Number.isInteger(remote.sequence) || remote.sequence <= this.sequence) throw new Error('Presentation state is stale or invalid'); const index = this.manifest.scenes.findIndex((scene) => scene.sceneId === remote.sceneId); if (index < 0 || remote.fragmentIndex < -1 || remote.fragmentIndex >= this.manifest.scenes[index]!.fragments.length) throw new Error('Presentation state targets an unavailable scene or fragment'); this.sequence = remote.sequence; this.sceneIndex = index; this.fragmentIndex = remote.fragmentIndex; this.hold = remote.hold; this.stack = remote.branchStack.filter((sceneId) => this.manifest.scenes.some((scene) => scene.sceneId === sceneId)); const view = this.view(); for (const listener of this.listeners) listener(view); return view; }
  key(key: string): PresentationView | undefined { if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(key)) return this.next(); if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(key)) return this.previous(); if (key === 'Escape' && this.stack.length) return this.return(); return undefined; }
}

export const presentationExportPolicySchema = z.object({ sceneHold: z.number().finite().positive().max(3600), fragmentHold: z.number().finite().positive().max(3600), route: z.array(id).max(10_000).default([]) }).strict();
export function planPresentationExport(project: GenmotionProject, manifestInput: z.input<typeof presentationManifestSchema>, policyInput: z.input<typeof presentationExportPolicySchema>) {
  const checked = validatePresentationManifest(project, manifestInput); if (!checked.ok) return { version: 1 as const, ok: false as const, diagnostics: checked.diagnostics, segments: [], unreachableScenes: [] };
  const policy = presentationExportPolicySchema.parse(policyInput), manifest = checked.manifest, route = policy.route.length ? policy.route : manifest.scenes.map((scene) => scene.sceneId), seen = new Set<string>(), segments: Array<{ sceneId: string; sourceStart: number; sourceEnd: number; outputDuration: number; kind: 'scene' | 'fragment' }> = [], diagnostics: typeof checked.diagnostics = [];
  if (!policy.route.length && manifest.branches.length) diagnostics.push({ code: 'PRESENTATION_INTERACTION_UNRESOLVED', target: manifest.id, message: 'Interactive branches require an explicit export route.' });
  let offset = 0; const offsets = new Map(project.scenes.map((scene) => { const pair: [string, number] = [scene.id, offset]; offset += scene.duration; return pair; }));
  for (const sceneId of route) { const entry = manifest.scenes.find((scene) => scene.sceneId === sceneId), source = project.scenes.find((scene) => scene.id === sceneId); if (!entry || !source) { diagnostics.push({ code: 'PRESENTATION_ROUTE_UNRESOLVED', target: sceneId, message: 'Export route references an unavailable scene.' }); continue; } seen.add(sceneId); const start = offsets.get(sceneId)!; segments.push({ sceneId, sourceStart: start, sourceEnd: start + source.duration, outputDuration: policy.sceneHold, kind: 'scene' }); for (const fragment of entry.fragments) segments.push({ sceneId, sourceStart: start + fragment.at, sourceEnd: start + fragment.at, outputDuration: policy.fragmentHold, kind: 'fragment' }); }
  const unreachableScenes = manifest.scenes.map((scene) => scene.sceneId).filter((sceneId) => !seen.has(sceneId));
  return { version: 1 as const, ok: diagnostics.length === 0, diagnostics, segments, unreachableScenes, policy };
}
