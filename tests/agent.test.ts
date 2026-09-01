import { describe, expect, it } from 'vitest';
import { agentProviderFailure, buildPrompt, isNonExecutionResponse, requestRequiresProjectChange } from '../src/agent/runtime.js';

describe('local agent bridge', () => {
  it('builds bounded production context without credentials or fabricated permissions', () => {
    const prompt = buildPrompt({
      host: 'codex', prompt: 'Hold the proof frame for eight more frames.',
      selection: { sceneId: 'proof', layerId: 'result', frame: 88 }, projectDir: '/project',
      projectFile: '/project/genmotion.json', projectTitle: 'Launch film',
    });
    expect(prompt).toContain('scene proof, layer result, frame 88');
    expect(prompt).toContain('Hold the proof frame for eight more frames.');
    expect(prompt).toContain('Do not commit, publish, install packages, access credentials, or use the network.');
    expect(prompt).toContain('Do not render the full video');
    expect(prompt).toContain('genmotion MCP tools');
    expect(prompt).toContain('Before the first write in a new ACP authoring session, call genmotion_schema and genmotion_project_read');
    expect(prompt).toContain('Build a schema-valid static scene system first');
    expect(prompt).toContain('Never duplicate layer x/y into transform x/y');
    expect(prompt).toContain('Named recipes are optional references');
    expect(prompt).toContain('inspect at least one representative native frame');
    expect(prompt).not.toMatch(/API[_ -]?key/i);
  });

  it('authorizes requested full-timeline review and rejects scope-only blockers', () => {
    const prompt = buildPrompt({
      host: 'hermes', prompt: 'Create a four-scene launch film, render it, and inspect every transition boundary.',
      selection: { frame: 0 }, projectDir: '/project', projectFile: '/project/genmotion.json', projectTitle: 'Arc One',
    });
    expect(prompt).toContain('This is an authoring request. Begin with the project tools');
    expect(prompt).toContain('The user explicitly requested rendering or full-timeline review.');
    expect(prompt).toContain('Scope, iteration count, an initially blank artboard, and the need to inspect your own work are not blockers.');
    expect(requestRequiresProjectChange('Create a premium four-scene launch film.')).toBe(true);
    expect(requestRequiresProjectChange('Review the current frame and explain the spacing.')).toBe(false);
    expect(isNonExecutionResponse('**Exact blocker:** This cannot be completed safely in one pass.')).toBe(true);
    expect(isNonExecutionResponse('The four-scene structure was partially applied where possible.')).toBe(true);
  });

  it('classifies ACP provider failures instead of presenting them as completed turns', () => {
    expect(agentProviderFailure('API call failed after 3 retries: HTTP 429: rate limit exceeded')).toContain('HTTP 429');
    expect(agentProviderFailure('HTTP 503: upstream unavailable')).toContain('HTTP 503');
    expect(agentProviderFailure('The project is valid and contains four scenes.')).toBeUndefined();
  });
});
