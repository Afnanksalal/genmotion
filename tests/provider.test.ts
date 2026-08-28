import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateStructured } from '../src/creative/provider.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('creative providers', () => {
  it('uses an OpenAI-compatible JSON response without vendor-specific parsing', async () => {
    vi.stubEnv('TEST_KEY', 'secret');
    const request = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"concepts":[]}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('fetch', request);
    const result = await generateStructured({ provider: 'openai-compatible', model: 'test', apiKeyEnv: 'TEST_KEY', baseUrl: 'https://provider.invalid/v1' }, 'system', 'prompt');
    expect(result).toEqual({ concepts: [] });
    expect(request).toHaveBeenCalledOnce();
  });
});
