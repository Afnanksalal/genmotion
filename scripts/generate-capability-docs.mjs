import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditCapabilityContracts, capabilityContracts, capabilityContractsMarkdown } from '../dist/capabilities/contracts.js';
const root = process.cwd(), destination = path.join(root, 'docs', 'generated'); await mkdir(path.join(destination, 'schemas'), { recursive: true }); await mkdir(path.join(destination, 'examples'), { recursive: true });
for (const contract of capabilityContracts) { await writeFile(path.join(destination, 'schemas', `${contract.id}.schema.json`), `${JSON.stringify(contract.inputSchema, null, 2)}\n`); await writeFile(path.join(destination, 'examples', `${contract.id}.json`), `${JSON.stringify(contract.example, null, 2)}\n`); }
await writeFile(path.join(destination, 'CAPABILITIES.md'), capabilityContractsMarkdown()); await writeFile(path.join(destination, 'capabilities.json'), `${JSON.stringify({ version: 1, contracts: capabilityContracts }, null, 2)}\n`);
const audit = await auditCapabilityContracts(root); await writeFile(path.join(destination, 'audit.json'), `${JSON.stringify({ version: 1, ...audit }, null, 2)}\n`); if (!audit.ok) { console.error(JSON.stringify(audit.drift, null, 2)); process.exitCode = 1; } else console.log(`generated and verified ${audit.contracts} cross-surface capability contracts`);
