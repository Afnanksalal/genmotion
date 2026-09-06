# Authoring schema discovery

Implemented in 2.4.0. See the [milestone QA report](MILESTONE-QA-2026-09-07.md) for tested paths and remaining acceptance limits.

`genmotion schema` returns a compact description generated from the live project Zod schema. `--kind` selects a focused contract such as `layer`, `text`, `track`, `parameter`, `expression`, `gesture`, `edit` or `query`. The command help lists the available kinds directly from the registry.

`genmotion schema --kind project --full` emits the full input JSON Schema. `--output project.schema.json` writes that full schema for editor integration. The generated schema preserves recursive references, defaults and constraints that JSON Schema can represent. A JSON Schema validator cannot replace Genmotion's runtime refinements, dependency checks, asset validation or native renderer checks.

MCP `genmotion_schema` accepts the same `kind`, with `full: false` by default. Its compact response now contains schema-derived field entries, required flags, types, enums, bounds and small defaults, rather than a manually maintained list of supported fields. Union variants are listed separately. SDK callers use `describeAuthoringSchema` and `authoringSchemaKindSchema`.

Generation is cached in process; each response is isolated from the cache. This provides generated schema export and focused discovery, not a language server or editor installation.
