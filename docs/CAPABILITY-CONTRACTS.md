# Generated cross-surface capability contracts

`src/capabilities/contracts.ts` is the canonical typed registry for focused product operations. Each contract defines its input/output JSON Schema, executable request example, description and required SDK, CLI, MCP, Studio and bundled-skill markers.

Run `npm run capabilities:generate` after intentionally changing a contract. It regenerates `docs/generated/CAPABILITIES.md`, the machine-readable registry, one input schema and one request example per capability, and the current audit report.

`npm run capabilities:check` runs inside the standard repository gate. It fails when a required surface marker disappears or any generated registry, documentation, schema, example or audit artifact differs from the canonical contract. Drift reports identify the capability, surface, missing marker and source file.
