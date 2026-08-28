import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENMOTION_BRAND_COLOR = '#2563EB';

export const GENMOTION_BRAND_ASSETS = [
  'apple-touch-icon.png',
  'favicon-32.png',
  'genmotion-social.png',
  'genmotion-social.svg',
  'genmotion-symbol-512.png',
  'genmotion-symbol-monochrome.svg',
  'genmotion-symbol.svg',
  'genmotion.webmanifest',
] as const;

export type GenmotionBrandAsset = typeof GENMOTION_BRAND_ASSETS[number];

const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
const assetNames = new Set<string>(GENMOTION_BRAND_ASSETS);

export function isGenmotionBrandAsset(name: string): name is GenmotionBrandAsset {
  return assetNames.has(name);
}

export function readGenmotionBrandAsset(name: GenmotionBrandAsset): Buffer {
  return readFileSync(path.join(assetRoot, name));
}

export const GENMOTION_SYMBOL_SVG = readGenmotionBrandAsset('genmotion-symbol.svg').toString('utf8');
