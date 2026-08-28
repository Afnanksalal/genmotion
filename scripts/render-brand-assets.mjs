import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');

async function renderSvg(input, output, width, height) {
  const svg = await readFile(path.join(assets, input));
  const image = await loadImage(svg);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  await writeFile(path.join(assets, output), canvas.toBuffer('image/png'));
}

await mkdir(assets, { recursive: true });
await Promise.all([
  renderSvg('genmotion-symbol.svg', 'genmotion-symbol-512.png', 512, 512),
  renderSvg('genmotion-symbol.svg', 'favicon-32.png', 32, 32),
  renderSvg('genmotion-symbol.svg', 'apple-touch-icon.png', 180, 180),
  renderSvg('genmotion-social.svg', 'genmotion-social.png', 1280, 640),
]);
