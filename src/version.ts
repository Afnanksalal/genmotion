import { readFileSync } from 'node:fs';

interface PackageManifest {
  version: string;
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as PackageManifest;

export const GENMOTION_VERSION = manifest.version;
