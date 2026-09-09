import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { auditCapabilityContracts, capabilityContracts, capabilityContractsMarkdown } from '../dist/capabilities/contracts.js';
const root = process.cwd(), destination = path.join(root, 'docs', 'generated'), failures = [];
const exact = async (file, expected) => { try { if (await readFile(file, 'utf8') !== expected) failures.push(path.relative(root, file)); } catch { failures.push(path.relative(root, file)); } };
const stored = JSON.parse(await readFile(path.join(destination, 'capabilities.json'), 'utf8')); if (JSON.stringify(stored.contracts) !== JSON.stringify(capabilityContracts)) failures.push('docs/generated/capabilities.json');
await exact(path.join(destination, 'CAPABILITIES.md'), capabilityContractsMarkdown());
for (const contract of capabilityContracts) { await exact(path.join(destination, 'schemas', `${contract.id}.schema.json`), `${JSON.stringify(contract.inputSchema, null, 2)}\n`); await exact(path.join(destination, 'examples', `${contract.id}.json`), `${JSON.stringify(contract.example, null, 2)}\n`); }
const audit = await auditCapabilityContracts(root); if (!audit.ok) failures.push(...audit.drift.map(item => `${item.capability}:${item.surface}`));
await exact(path.join(destination, 'audit.json'), `${JSON.stringify({ version: 1, ...audit }, null, 2)}\n`);
if (failures.length) { console.error(`Capability contract drift: ${[...new Set(failures)].join(', ')}`); process.exitCode = 1; } else console.log(`verified ${audit.contracts} generated cross-surface capability contracts`);
