# Project transactions

## Easing copy and paste

Studio's easing cards provide **Copy easing** and **Paste easing** for named curves, full cubic Bezier controls, and spring settings. The clipboard persists across inspector selections for the current Studio session. Transition timing falls back to its legacy `ease` value when `timing` is absent; pasting creates an explicit timing override.

SDK `copyEasing` and `pasteEasing` are pure, clone-preserving operations. `commitEasing` validates and saves with the shared revision contract, including dry runs and stale-write rejection. An address contains `kind` (`scene` or `composition`), container `id`, optional `layerId`, and a string-segment `path` ending in `ease` or `timing`.

```powershell
genmotion easing-copy ./project --address '{"kind":"scene","id":"intro","path":["transitionIn","timing"]}'
genmotion easing-paste ./project --address '{"kind":"scene","id":"intro","path":["transitionOut","timing"]}' --easing '"sine-out"' --expected-revision <revision>
```

MCP exposes `genmotion_easing_copy` and `genmotion_easing_paste` with the same address and typed easing. Paste returns a standard transaction receipt. Source and target may belong to different projects; copied values contain no executable code or project references. Invalid, inherited, and ambiguous addresses fail explicitly. Existing transition-boundary validation still applies; coordinated changes to both sides can be submitted as one project patch transaction.

Tests cover mutable-value isolation, Bezier/spring preservation, revision-safe commit behavior, MCP copy/paste, and Studio scene-inspector persistence.

## Stable semantic edits

`genmotion edit --edits edits.json --expected-revision <revision> ./project`, MCP's `genmotion_edit`, and SDK `commitSemanticEdits` share the same operation schema. A target is `{ "kind": "scene", "id": "intro", "layerId": "title" }` or a reusable `composition` definition with its own ID. Reordering layers does not retarget an edit. Missing and ambiguous identities are refused.

Operations include `text`, `property`, `timing`, `asset`, `track-put`, `track-remove`, `layer-add` and `layer-remove`. For example:

```json
[
  { "op": "text", "target": { "kind": "scene", "id": "intro", "layerId": "title" }, "text": "New title" },
  { "op": "property", "target": { "kind": "scene", "id": "intro", "layerId": "title" }, "path": ["fontSize"], "value": 24 }
]
```

One operation array is one validated save. Receipts identify affected targets and include an inverse RFC 6902 patch. Apply that inverse against the receipt's resulting revision to undo; intervening edits cause a conflict instead of being erased. Studio routes text-only inspector changes through its authenticated `/api/edit` endpoint; other document changes share the underlying transaction service.

`inspectEditTarget` and MCP `genmotion_edit_inspect` expose direct dependants and composition usages. Editing a composition definition affects its uses; these operations do not materialize per-instance overrides. `canApplySemanticEdit` and `genmotion_edit_capability` are pure structural refusal queries. Their `requiresValidation: true` result makes clear that asset existence and evaluated semantics are checked when the transaction runs.

## Persistence

Studio saves, history restoration, reference-to-scene updates, MCP saves/patches, and CLI saves/patches share `commitProject`. SDK callers can import it together with `readProjectSnapshot` and `applyPatch` from `genmotion`.

```sh
genmotion --json project-read ./project
genmotion --json project-patch ./project --operations changes.json --expected-revision <revision> --dry-run
genmotion --json project-patch ./project --operations changes.json --expected-revision <revision>
```

`changes.json` is an ordered RFC 6902 operation array. `project-save --document proposed.yaml --expected-revision <revision>` accepts a complete JSON or YAML document. `--strict` blocks warnings as well as errors. MCP's `genmotion_project_save` and `genmotion_project_patch` accept `dryRun` and default to strict validation.

The service acquires an exclusive project lock, reads the authoritative disk revision, applies the proposed update to a clone, compiles using the project's motion catalog, and runs semantic validation before saving. A second revision check immediately before atomic replacement detects external edits made while validation ran. Invalid proposals, stale revisions and failed preconditions leave the accepted project intact. A no-op does not rewrite the source.

Receipts distinguish `validated` dry runs from `saved` work and report `changed`, `persisted`, origin, before/after file revisions, document revisions and findings. A dry run's after revision describes the proposal; it is not a revision already saved to disk. A saved receipt establishes persistence and semantic validation, not visual approval. Raw previous source is retained under `.genmotion/history/source/`, including YAML formatting and comments; normalized snapshots remain available to Studio's history browser.

File revisions are 64-character SHA-256 hashes of the exact source. Studio's existing 16-character document revision remains compatible and is checked against the freshly loaded authoritative document inside the lock. JSON/YAML need no schema migration for these runtime transaction controls.

Locks coordinate Genmotion writers across processes. Other editors that ignore these locks can still write files; the final revision check detects most such interference but cannot offer a filesystem compare-and-swap guarantee against an uncooperative writer. Lock acquisition waits up to ten seconds by default and supports cancellation. A lock left by a terminated process is reported with its path for inspection; this service does not automatically break a lock. Studio layout persistence is a separate file and is not part of the project's atomic rename.

Tests cover same-process and separate-process contention, semantic rejection, no-op writes, dry runs, cancellation, raw history and an external edit during validation. The broader session, gesture history, three-way reconciliation and semantic-operation requirements remain in the native capability backlog.
