import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../src/agent/runtime.js';

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
    expect(prompt).toContain('Named recipes are optional references');
    expect(prompt).toContain('inspect at least one representative native frame');
    expect(prompt).not.toMatch(/API[_ -]?key/i);
  });
});
