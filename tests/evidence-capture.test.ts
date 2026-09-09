import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { captureProductEvidence } from '../src/ir/evidence-capture.js';

describe('bounded real product capture', () => {
  it('freezes pixels, text, URLs, viewport, hashes and a contact sheet', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-capture-'));
    try {
      const url = 'data:text/html,' + encodeURIComponent('<title>Real product</title><main><h1>Evidence</h1><button id="change" onclick="this.textContent=\'Changed\'">Change</button></main>');
      const report = await captureProductEvidence({ startUrl: url, outputDirectory: directory, viewport: { width: 640, height: 360 }, actions: [{ type: 'click', selector: '#change' }, { type: 'screenshot', label: 'changed-state' }], maxBytes: 8 * 1024 * 1024 });
      expect(report).toMatchObject({ status: 'complete', viewport: { width: 640, height: 360 }, navigationStatus: 'complete', limits: { concurrency: 1 } });
      expect(report.artifacts.some(item => item.path === 'contact-sheet.png' && item.pixelOrigin === 'captured-evidence')).toBe(true);
      expect(await readFile(path.join(directory, 'page-text.txt'), 'utf8')).toContain('Changed');
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30000);

  it('reports skipped actions as partial instead of claiming complete capture', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-capture-partial-'));
    try { const report = await captureProductEvidence({ startUrl: 'data:text/html,<p>Visible</p>', outputDirectory: directory, actions: [{ type: 'click', selector: '#missing' }], maxDurationMs: 1000 }); expect(report.status).toBe('partial'); expect(report.skipped[0]?.phase).toBe('action:0'); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }, 30000);
});
