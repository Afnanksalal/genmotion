import { chromium } from '@playwright/test';
import { cp, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startStudio } from '../dist/studio/server.js';
import { loadProject } from '../dist/ir/loader.js';

// Run after building, with no concurrent build or benchmark. Measures presented frames, not the playhead.
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['kinetic-type', 'data-pulse', 'chromatic-orbit'];
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const name of names) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Use an example directory name.');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'genmotion-playback-bench-'));
    let studio, page;
    try {
      await cp(path.resolve('examples', name), directory, { recursive: true });
      const loaded = await loadProject(directory);
      studio = await startStudio(loaded, { port: 0 });
      page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(studio.url);
      await page.getByRole('tab', { name: 'Editor', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#previewImage')?.naturalWidth > 0);
      await page.locator('#playButton').click();
      await page.waitForTimeout(2500);
      await page.evaluate('window.previewLagSamples=[];window.previewLagTimer=setInterval(()=>{const shown=studioPlayback.stats.displayedFrame;if(shown!==null)window.previewLagSamples.push((S.frame-shown+frames())%frames())},16)');
      const before = await page.evaluate('({...studioPlayback.stats,at:performance.now()})');
      await page.waitForTimeout(5000);
      const after = await page.evaluate('({...studioPlayback.stats,at:performance.now()})');
      const lag = await page.evaluate('clearInterval(window.previewLagTimer);window.previewLagSamples.sort((a,b)=>a-b)');
      const result = { lagP95Frames:lag[Math.floor(lag.length*.95)]??null, lagMaxFrames:lag.at(-1)??null, name, targetFps:loaded.project.fps, viewport: '1920x1080', measurementSeconds: (after.at-before.at)/1000, presentedFps: +(1000*(after.presented-before.presented)/(after.at-before.at)).toFixed(2), previewWidth:after.width,previewHeight:after.height,cacheMiB:+(after.cacheBytes/1024/1024).toFixed(2),errors:after.errors-before.errors,requests:after.requests-before.requests };
      results.push(result); console.log(JSON.stringify(result));
      await mkdir('output/playback-qa', { recursive: true });
      await page.screenshot({ path: 'output/playback-qa/'+name+'.png' });
    } finally {
      await page?.close(); await studio?.close();
      const relative = path.relative(os.tmpdir(), directory);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(directory).startsWith('genmotion-playback-bench-')) throw new Error('Unexpected benchmark directory');
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
} finally { await browser.close(); }
await mkdir('output/playback-qa', { recursive: true });
await writeFile('output/playback-qa/results.json', JSON.stringify({ measuredAt:new Date().toISOString(), node:process.version, platform:process.platform, cpu:os.cpus()[0]?.model, parallelism:os.availableParallelism(), results },null,2)+'\n');
if (results.some(result=>result.errors||result.lagP95Frames===null||result.lagP95Frames>Math.max(2,result.targetFps*.1)||result.presentedFps<result.targetFps*.9)) process.exitCode=1;
