import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GenmotionError } from '../errors.js';

export interface ProviderConfig {
  provider: 'anthropic' | 'openai-compatible';
  model: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export async function loadProviderConfig(projectDir: string): Promise<ProviderConfig | undefined> {
  const file = path.join(projectDir, 'genmotion.config.json');
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { ai?: ProviderConfig };
    return parsed.ai;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return undefined;
    throw new GenmotionError('CONFIG_INVALID', `Could not parse ${file}`, error);
  }
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function request(url: string, init: RequestInit, timeoutMs: number, retries: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok) return response;
      const body = await response.text();
      if (response.status < 500 && response.status !== 429) throw new GenmotionError('PROVIDER_REJECTED', `${String(response.status)} ${body}`);
      lastError = new Error(`${String(response.status)} ${body}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw new GenmotionError('PROVIDER_FAILED', 'Creative provider request failed after retries.', lastError);
}

export async function generateStructured(config: ProviderConfig, system: string, prompt: string): Promise<unknown> {
  const apiKeyEnv = config.apiKeyEnv ?? (config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY');
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) throw new GenmotionError('PROVIDER_KEY_MISSING', `Set ${apiKeyEnv} in the process environment or remove the AI provider configuration to use the deterministic planner.`);
  const timeout = config.timeoutMs ?? 60_000;
  const retries = config.maxRetries ?? 2;
  if (config.provider === 'anthropic') {
    const response = await request(`${config.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 5000, temperature: 0.9, system, messages: [{ role: 'user', content: prompt }] }),
    }, timeout, retries);
    const body = await response.json() as { content: Array<{ type: string; text?: string }> };
    return extractJson(body.content.find((item) => item.type === 'text')?.text ?? '');
  }
  const response = await request(`${config.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: config.model, temperature: 0.9, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  }, timeout, retries);
  const body = await response.json() as { choices: Array<{ message: { content: string } }> };
  return extractJson(body.choices[0]?.message.content ?? '');
}
