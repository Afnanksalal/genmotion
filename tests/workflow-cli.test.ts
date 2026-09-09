import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile), temporary: string[] = []; afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));
describe('workflow CLI surfaces', () => {
  it('executes caption delivery, music planning, and presentation validation from packaged commands', async () => {
    const root = await mkdtemp(path.resolve('.tmp-workflows-')); temporary.push(root); const project = path.join(root, 'project'); await cp(path.resolve('tests/fixtures/basic'), project, { recursive: true });
    const document = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(project, 'genmotion.json'), 'utf8')) as { scenes: Array<{ id: string; layers: unknown[] }> }; const scene = document.scenes[0]!;
    scene.layers.push({ id: 'captions', type: 'caption', language: 'en', x: 20, y: 120, width: 280, height: 40, fontFamily: 'Arial', fontSize: 20, color: '#fff', cues: [{ id: 'cue', start: 0, end: 1, text: 'Ship motion' }] }); await writeFile(path.join(project, 'genmotion.json'), JSON.stringify(document));
    const captions = JSON.parse((await run(process.execPath, [path.resolve('dist/cli.js'), 'captions-delivery', project, '--mode', 'sidecar', '--languages', 'en', '--json'])).stdout) as { artifacts: unknown[] }; expect(captions.artifacts).toHaveLength(1);
    const features = { version: 1, sourceSha256: 'a'.repeat(64), timeMap: { sourceStart: 0, timelineStart: 0, rate: 1 }, beats: [{ time: 1, strength: 1, confidence: .9 }], onsets: [], phrases: [{ start: 0, end: 2, energy: .8, confidence: .9 }], silence: [], corrections: [], analysisHash: 'b'.repeat(64) }, featureFile = path.join(root, 'features.json'); await writeFile(featureFile, JSON.stringify(features));
    const music = JSON.parse((await run(process.execPath, [path.resolve('dist/cli.js'), 'music-plan', featureFile, '--options', '{"targetDuration":2}', '--json'])).stdout) as { range: { end: number } }; expect(music.range.end).toBe(2);
    const manifestFile = path.join(root, 'presentation.json'); await writeFile(manifestFile, JSON.stringify({ version: 1, id: 'deck', title: 'Deck', scenes: [{ sceneId: scene.id, notes: '', fragments: [], hotspots: [] }], branches: [] }));
    const presentation = JSON.parse((await run(process.execPath, [path.resolve('dist/cli.js'), 'presentation-check', project, manifestFile, '--json'])).stdout) as { ok: boolean }; expect(presentation.ok).toBe(true);
  });
});
