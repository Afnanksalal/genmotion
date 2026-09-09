import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LoadedProject } from './loader.js';
import { importMediaRecord, mediaMetadataSchema } from './media-ledger.js';

const primitive = z.union([z.string().max(4096), z.number().finite(), z.boolean(), z.null()]);
export const mediaResolveRequestSchema = z.object({
  operation: z.enum(['resolve', 'search', 'import', 'generate']), provider: z.string().min(1).max(256), kind: z.enum(['image', 'video', 'audio', 'voice', 'sfx', 'icon', 'logo']), intent: z.string().min(1).max(20000),
  source: z.string().max(8192).optional(), destination: z.string().min(1).max(2048).optional(), prompt: z.string().max(20000).optional(),
  settings: z.record(z.string(), z.union([primitive, z.array(primitive).max(128)])).default({}), requireVerifiedLogoSource: z.boolean().default(true),
}).strict();
export type MediaResolveRequest = z.infer<typeof mediaResolveRequestSchema>;
export type MediaResolveInput = z.input<typeof mediaResolveRequestSchema>;
export const providerCandidateSchema = z.object({ id: z.string().min(1), title: z.string().min(1), source: z.string().min(1), license: z.object({ status: z.enum(['unknown', 'user-confirmed', 'documented']), identifier: z.string().optional(), evidence: z.string().optional(), attribution: z.string().optional() }).strict(), score: z.number().finite().min(0).max(1).optional() }).strict();
export const providerDeliverySchema = z.object({ localFile: z.string().min(1), source: z.string().min(1), sourceVerified: z.boolean().default(false), model: z.string().max(256).optional(), tool: z.string().max(256).optional(), license: providerCandidateSchema.shape.license }).strict();
export interface MediaProvider {
  id: string;
  operations: MediaResolveRequest['operation'][];
  search?(request: MediaResolveRequest, signal?: AbortSignal): Promise<z.infer<typeof providerCandidateSchema>[]>;
  deliver?(request: MediaResolveRequest, signal?: AbortSignal): Promise<z.infer<typeof providerDeliverySchema>>;
}

export class MediaResolver {
  readonly #providers = new Map<string, MediaProvider>();
  register(provider: MediaProvider): void { if (this.#providers.has(provider.id)) throw new Error(`Media provider already registered: ${provider.id}`); this.#providers.set(provider.id, provider); }
  capabilities() { return [...this.#providers.values()].map(provider => ({ id: provider.id, operations: [...provider.operations] })); }
  async execute(loaded: LoadedProject, raw: MediaResolveInput, signal?: AbortSignal) {
    const request = mediaResolveRequestSchema.parse(raw), provider = this.#providers.get(request.provider), id = randomUUID(), startedAt = new Date().toISOString();
    if (!provider || !provider.operations.includes(request.operation)) return { version: 1 as const, id, state: 'failed' as const, startedAt, completedAt: new Date().toISOString(), provider: request.provider, operation: request.operation, error: 'Provider or operation is unavailable.', project: loaded.sourceProject };
    try {
      if (request.operation === 'search') { if (!provider.search) throw new Error('Provider does not implement search'); const candidates = z.array(providerCandidateSchema).max(1000).parse(await provider.search(request, signal)); return { version: 1 as const, id, state: 'complete' as const, startedAt, completedAt: new Date().toISOString(), provider: provider.id, operation: request.operation, candidates, project: loaded.sourceProject }; }
      if (!provider.deliver || !request.destination) throw new Error('Delivery operations require a destination and provider delivery implementation');
      const delivery = providerDeliverySchema.parse(await provider.deliver(request, signal));
      if (request.kind === 'logo' && request.requireVerifiedLogoSource && !delivery.sourceVerified) throw new Error('Logo acquisition requires a provider-verified source identity');
      const origin = request.operation === 'generate' ? 'generated' : request.operation === 'resolve' && /^https?:/i.test(delivery.source) ? 'captured' : 'imported';
      const metadata = mediaMetadataSchema.parse({ kind: request.kind === 'voice' || request.kind === 'sfx' ? 'audio' : request.kind, title: request.intent, origin, source: { uri: delivery.source, provider: provider.id, model: delivery.model, prompt: request.prompt, tool: delivery.tool, settings: request.settings }, license: delivery.license });
      const imported = await importMediaRecord(loaded, { id: `media-${id}`, sourceFile: delivery.localFile, path: request.destination, metadata });
      return { version: 1 as const, id, state: 'complete' as const, startedAt, completedAt: new Date().toISOString(), provider: provider.id, operation: request.operation, sourceVerified: delivery.sourceVerified, record: imported.record, project: imported.project };
    } catch (error) { return { version: 1 as const, id, state: signal?.aborted ? 'cancelled' as const : 'failed' as const, startedAt, completedAt: new Date().toISOString(), provider: provider.id, operation: request.operation, error: error instanceof Error ? error.message : String(error), project: loaded.sourceProject }; }
  }
}
