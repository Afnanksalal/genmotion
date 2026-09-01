import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'genmotion-package-'));

try {
  const packed = await exec('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], { cwd: root, shell: process.platform === 'win32' });
  const [{ filename, files }] = JSON.parse(packed.stdout);
  const required = ['dist/cli.js', 'dist/mcp.js', 'dist/index.js', 'README.md', 'SECURITY.md', 'LICENSE', 'skills/genmotion/SKILL.md'];
  const packaged = new Set(files.map((file) => file.path));
  for (const requiredPath of required) {
    if (!packaged.has(requiredPath)) throw new Error(`Package is missing ${requiredPath}`);
  }

  const tarball = path.join(scratch, filename);
  const prefix = path.join(scratch, 'install');
  await exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', prefix, tarball], { cwd: root, shell: process.platform === 'win32' });
  const manifest = JSON.parse(await readFile(path.join(prefix, 'node_modules', 'genmotion', 'package.json'), 'utf8'));
  const cli = path.join(prefix, 'node_modules', 'genmotion', 'dist', 'cli.js');
  const version = await exec(process.execPath, [cli, '--version'], { cwd: scratch });
  if (version.stdout.trim() !== manifest.version) throw new Error(`Installed CLI reported ${version.stdout.trim()}, expected ${manifest.version}`);
  const doctor = await exec(process.execPath, [cli, 'doctor', '--json'], { cwd: scratch });
  const report = JSON.parse(doctor.stdout);
  if (!report.ok) throw new Error('Packaged CLI doctor did not pass.');
  process.stdout.write(`verified ${filename}: ${String(files.length)} files, CLI ${manifest.version}, doctor passed\n`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
