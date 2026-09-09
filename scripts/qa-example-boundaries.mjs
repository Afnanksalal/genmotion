import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { loadProject } from '../dist/ir/loader.js';
import { runProcess } from '../dist/engine/process.js';

GlobalFonts.registerFromPath(path.resolve('examples/_shared/fonts/Inter.ttf'), 'QA Inter');
const manifest = JSON.parse(await readFile(path.resolve('examples/manifest.json'), 'utf8'));
const ids = manifest.map(example => example.id);
for (const id of ids) {
  const directory = path.resolve('examples', id), loaded = await loadProject(directory), fps = loaded.project.fps;
  const frames = [], boundaries = []; let elapsed = 0;
  for (const scene of loaded.project.scenes.slice(0, -1)) {
    elapsed += scene.duration; const frame = Math.ceil(elapsed * fps - 1e-9); boundaries.push(frame);
    frames.push(frame - 1, frame, frame + 1);
  }
  if (!frames.length) continue;
  const output = path.resolve('output/example-boundaries', id); await mkdir(output, { recursive: true });
  const select = frames.map(frame => `eq(n,${frame})`).join('+');
  await runProcess('ffmpeg', ['-v', 'error', '-y', '-i', path.join(directory, `${id}.mp4`), '-vf', `select='${select}',scale=480:270`, '-fps_mode', 'vfr', path.join(output, 'encoded-%02d.png')]);
  const canvas = createCanvas(1440, boundaries.length * 304), ctx = canvas.getContext('2d'); ctx.fillStyle = '#151719'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const hashes = [];
  for (const [index, frame] of frames.entries()) {
    const file = path.join(output, `encoded-${String(index + 1).padStart(2, '0')}.png`), bytes = await readFile(file);
    const x = index % 3 * 480, y = Math.floor(index / 3) * 304;
    ctx.drawImage(await loadImage(bytes), x, y); ctx.fillStyle = '#ffffff'; ctx.font = '16px "QA Inter"'; ctx.fillText(`${id} / frame ${frame} / ${(frame / fps).toFixed(3)}s`, x + 10, y + 292);
    hashes.push({ frame, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(path.join(output, 'boundaries.png'), await canvas.encode('png'));
  const reportFile = path.join(directory, 'render-report.json'), report = JSON.parse(await readFile(reportFile, 'utf8'));
  report.encodedBoundaryFrames = hashes; await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(`${id}: decoded ${frames.length} boundary frames`);
}
