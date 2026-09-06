import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const sourceFile = new URL('../vendor/unicode/17.0.0/DerivedBidiClass.txt', import.meta.url);
const source = await readFile(sourceFile, 'utf8');
const values = new Uint8Array(0x110000);
const codes = { L: 1, Left_To_Right: 1, R: 2, Right_To_Left: 2, AL: 3, Arabic_Letter: 3, LRI: 4, RLI: 5, FSI: 6, PDI: 7, B: 8 };
const assign = (range, name) => {
  const [first, last = first] = range.split('..').map(value => Number.parseInt(value, 16));
  values.fill(codes[name] ?? 0, first, last + 1);
};
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^# @missing:\s*([0-9A-F.]+)\s*;\s*(\w+)/);
  if (match) assign(match[1], match[2]);
}
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^([0-9A-F.]+)\s*;\s*(\w+)/);
  if (match) assign(match[1], match[2]);
}
const ranges = [];
for (let start = 0; start < values.length;) {
  const value = values[start]; let end = start;
  while (end + 1 < values.length && values[end + 1] === value) end++;
  if (value) ranges.push([start, end, value]);
  start = end + 1;
}
const target = new URL('../src/engine/unicode-bidi-data.ts', import.meta.url);
await writeFile(target, `// Generated from Unicode 17.0.0 DerivedBidiClass.txt; see UNICODE-LICENSE.txt.\n// Source SHA-256: ${createHash('sha256').update(source).digest('hex')}\n// Regenerate with node scripts/generate-unicode-bidi.mjs.\nexport const unicodeBidiRanges: ReadonlyArray<readonly [number, number, number]> = [\n${ranges.map(range => `  [${range.join(', ')}],`).join('\n')}\n];\n`);
process.stdout.write(`Generated ${ranges.length} ranges in ${fileURLToPath(target)}\n`);
