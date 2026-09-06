import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { applyVisualEffects } from '../dist/engine/effects.js';
import { visualEffectSchema, visualEffectTypeSchema } from '../dist/ir/schema.js';
const source = createCanvas(160, 100), ctx = source.getContext('2d');
const gradient = ctx.createLinearGradient(0, 0, 160, 100);
gradient.addColorStop(0, '#fd7654'); gradient.addColorStop(.5, '#55d6b2'); gradient.addColorStop(1, '#4772ff');
ctx.fillStyle = gradient; ctx.fillRect(8, 8, 144, 84);
ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px Arial'; ctx.fillText('Motion', 25, 57);
const types = visualEffectTypeSchema.options;
const sheet = createCanvas(8 * 180, Math.ceil(types.length / 8) * 135), out = sheet.getContext('2d');
out.fillStyle = '#111820'; out.fillRect(0, 0, sheet.width, sheet.height);
for (const [index, type] of types.entries()) {
  const overrides = type.includes('reveal') || ['blinds', 'pixel-dissolve'].includes(type) ? { amount: .55 } : {};
  if (type === 'custom') overrides.kernel = { version: 1, name: 'Identity', rgba: ['r', 'g', 'b', 'a'].map(name => ({ op: 'input', name })) };
  if (type === 'lut') overrides.lut = { version: 1, kind: '1d', size: 2, data: [0, 0, 0, 1, 1, 1], inputColorSpace: 'srgb', outputColorSpace: 'srgb' };
  const effect = visualEffectSchema.parse({ id: 'qa', type, ...overrides });
  const image = applyVisualEffects(source, [effect], .35, 81);
  const x = index % 8 * 180 + 10, y = Math.floor(index / 8) * 135 + 8;
  out.drawImage(image, x, y); out.fillStyle = '#fff'; out.font = '12px Arial'; out.fillText(type, x, y + 118);
}
await mkdir('output/playwright/effects-qa', { recursive: true });
await writeFile('output/playwright/effects-qa/contact-sheet.png', sheet.toBuffer('image/png'));
console.log(`Rendered ${types.length} native effects for visual inspection.`);
