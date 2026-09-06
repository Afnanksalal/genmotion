# Resumable production brief

Optional `productionBrief` lives in the Creative IR and uses its own `version: 1` contract. Each destination, aspect, language, audience, message and duration decision stores a typed `value`, an `origin` (`user` or `inferred`), and optional `rationale`. Missing decisions remain absent. They are not silently filled or represented as user requirements.

```json
{
  "version": 1,
  "destination": {"value": "Product launch page", "origin": "user"},
  "aspect": {"value": [16,9], "origin": "user"},
  "language": {"value": "en", "origin": "inferred", "rationale": "Current script language"},
  "duration": {"value": 30, "origin": "user"},
  "sourceRequirements": [
    {"id":"brand-logo","kind":"logo","description":"Official local logo artwork","required":true,"origin":"user","status":"open"}
  ]
}
```

Source requirements have stable unique IDs, a media kind, description, required flag, decision origin and status (`open`, `available`, `waived`), plus optional evidence notes. These statuses record authoring decisions; marking a source available does not import it or prove its license. Acquisition and media provenance have separate acceptance requirements.

`resumeProductionBrief` returns resolved and missing fields, user-stated and inferred decisions, and open required source IDs. Every Studio agent turn receives this context, with instructions to reuse resolved requirements and only ask for missing information that blocks the current request. Brief content is treated as project data. The current user request retains precedence.

Studio exposes the brief in the project inspector. Enabling a field creates an explicitly inferred suggestion; editing its value marks it user-stated. Decision provenance can be corrected directly. The brief survives closing/reopening Studio and source-revision history. Its optional presence does not change native frames. Aspect and duration disagreements with the actual composition produce validation warnings.

```sh
genmotion brief project
genmotion brief project --file brief.json --expected-revision HASH_FROM_PROJECT_READ
```

MCP `genmotion_brief` reads the same resume result; writing requires `brief` and `expectedRevision`. SDK exports the schema/resume helper and persists through `commitProject`. All writes share validation, history and stale-revision rejection. Unsupported versions, duplicate requirement IDs, invalid values and briefs over 32768 serialized characters are refused. The size bound keeps resumed agent context finite.

Existing projects need no migration and have no inferred brief until one is explicitly created.
