# Shared editing sessions

## Receipt evidence

Accepted edit receipts carry a separate `changed` flag, persistence status, source revisions, affected targets, validation findings and inverse patches. After persistence, the session reads the adapter again. `state: "verified"` means only that the source document and revision matched the accepted write; `evidence.verificationScope` is `source-document`. It does not mean visual QA or a verified rendered frame. Frame evidence is an empty list until real revision-bound frame evidence is available. Dry runs remain `validated`, with readback marked `not-applicable`.

If persistence succeeds but readback fails or sees a different revision, the receipt remains `saved`, with `unavailable` or `mismatched` readback evidence. This does not imply rollback. Proposal refusals and rejected adapter writes attach a structured `failureReceipt` to the error details, including stage, error code, origin and the observed source revision. This relies on the adapter contract that a rejected write is atomic and leaves its previous document intact. Transport dispatch and frame-verification receipts remain separate work.

Implemented in 2.4.0. See the [milestone QA report](MILESTONE-QA-2026-09-07.md) for tested paths and remaining acceptance limits.

`EditingSession` coordinates a single mutation queue over an `EditingAdapter`. The filesystem adapter uses the existing validated, revision-checked project transaction. The memory adapter performs schema validation and accepts an optional asynchronous host validator. Custom hosts implement `read` and an atomic compare-and-swap `write`; rejected writes must leave the previous document intact. Receipts identify whether validation was schema-only, native, or host-provided.

```ts
const session = new EditingSession(filesystemEditingAdapter(projectDirectory));
const before = await session.read();
await session.apply([
  { op: 'text', target: { kind: 'scene', id: 'intro', layerId: 'headline' }, text: 'Revised title' }
], { expectedRevision: before.revision, origin: 'author' });
await session.undo();
const checkpoint = await session.checkpoint();
await session.dispose();
```

One successful batch produces one adapter write, one history entry and one event. Failed writes retain undo/redo state so callers can retry. Observer exceptions do not invalidate saved edits. Disposal aborts outstanding work, prevents new operations and releases owned adapters.

History defaults to 100 entries and 32 MiB. Property and timing edits can coalesce only when the caller supplies a matching group, the ordered targets/properties and origin match, and the edits fall within the configured window. Structural edits never coalesce. External document changes invalidate history rather than allowing an undo to replace another writer's changes.

Checkpoints carry their document revision and bounded undo/redo entries. Hosts own checkpoint storage; restore refuses a different project revision. Studio writes `.genmotion/editing-checkpoint.json` after accepted session edits and restores matching history when reopened. Checkpoint writes are serialized and atomically replace the prior checkpoint. Checkpoint failures are reported separately as `checkpointError`: they do not falsely report that an already accepted project write failed. A checkpoint command retries storage. Recovery rejects oversized, malformed or stale files and starts with empty history while retaining a diagnostic.

## Public surfaces

- SDK: `EditingSession`, memory/filesystem adapters, typed commands, checkpoints and subscriptions.
- CLI: `editing-session <project> --command <json-file>`, with optional `--checkpoint <json-file>` and `--include-checkpoint`.
- MCP: `genmotion_editing_session`, accepting the same typed command and optional checkpoint.
- Studio: `/api/editing-session`, plus the existing project-save and semantic-edit endpoints routed through the shared session. Project undo/redo controls now use server history. Workflow-only local changes keep their own history, while native input fields retain normal text undo. Accepted legacy revision restores also enter shared undo history.

Commands support read, compact query, inspect, capability query, history state, semantic apply, whole-document replacement, three-way reconciliation, undo, redo and checkpoint. Semantic edits also include style batches, layer duplication and explicit layer reordering. A memory adapter without a host validator does not certify asset existence or evaluated media/render behavior.

## Live context and agent connection

`context` reports the shared playhead, scene/local frame, up to 32 selected stable targets, nested instance paths, viewport, frame range, source revision, undo depths, selected track locks and the 16 nearest markers/comments. Marker labels and note excerpts are bounded. `context-update` requires both the document revision and context sequence; stale navigation cannot silently overwrite a newer selection. Missing targets are reported in context rather than replaced with unrelated layers. Paginated marker/range queries provide additional timeline context.

Studio publishes user navigation and consumes agent navigation through this same session. Nested targets receive a dedicated text/geometry inspector using sparse semantic edits. Project changes refresh the native preview. Context ranges can drive preview loops without modifying the saved project's named ranges.

Studio persists the last navigation state on a two-second interval while it changes and flushes it on normal close. Reopening restores matching stable targets and playhead state; invalid stored navigation reports a recovery error. Studio state writes are serialized. Shortcut settings and live context have separate update paths so a stale workflow autosave cannot replace them.

The `studio-session` CLI command, `genmotion_studio_session` MCP tool and SDK `executeStudioCommand` connect to an already open Studio for the chosen canonical source file. A private, source-scoped descriptor provides a random session handle and a dedicated token; neither appears in command responses. Connections use loopback, refuse redirects and have a deadline. The token is accepted only by the typed bridge endpoint, not general Studio mutations. Closing Studio removes its own descriptor without deleting a newer session's handle.

Descriptors live in the current user's `.genmotion/studio-sessions` directory, outside the project tree, so exporting a project cannot accidentally package a live bridge credential.

Agents can negotiate `capabilities`. Read and navigation access are enabled initially; project editing is disabled until enabled under Project history → Live agent permissions. Permissions apply to that Studio lifetime and reset on reopen. Edits require the file revision returned by a live query and enter the human's shared undo history. The bridge accepts no browser code, arbitrary URL, or source-path replacement. Local filesystem editing tools remain independent of Studio bridge permissions.

## Named checkpoints

`checkpoint-save` captures the current revision under a user-supplied name. `checkpoint-list` pages through immutable checkpoint IDs; `checkpoint-compare` returns paginated property changes with a 16 KiB value budget. `checkpoint-restore` performs a validated replacement that can itself be undone. `checkpoint-delete` removes the specified saved checkpoint. Studio exposes save, comparison, restoration and deletion from its history dialog.

Filesystem checkpoints are separated by canonical source-file hash under `.genmotion/checkpoints`, size-limited to 32 MiB each, and published only after their complete temporary file is flushed. Memory adapters provide an in-memory checkpoint store; other hosts can supply `EditingAdapter.checkpoints`. Names are labels, never filesystem paths. Named project checkpoints are separate from the bounded undo/redo recovery checkpoint.

## Studio commands

The Commands button and `Mod+K` open a searchable keyboard command palette. The same declared catalog describes labels, categories and default shortcuts. Project-local shortcut overrides are validated against supported commands and key names; duplicates and application-closing bindings are refused. Empty assignments disable a shortcut. Commands preserve native text undo inside editable fields and do not fire unrelated project actions while a modal is open. The palette provides arrow-key navigation, Enter activation and matching command/shortcut labels. These additions remain untested with the rest of this implementation tranche.

Receipts contain inverse JSON patches. Object changes and changes inside stable arrays identify the affected properties; changes to array identity or length replace that array together. Inverse patches are revision-specific and must be applied through a revision-checked transaction. Undo/redo uses the session's snapshots, preserving history if validation or persistence fails.

## Compact project queries

The `query` command accepts a `summary`, paginated `scopes`, paginated `layers`, selected `properties`, or an instance `overrides` review. Scope/layer pages contain at most 100 entries. Layer summaries omit full text, effects and keyframe payloads. Nested layer queries resolve an explicit stable instance path. Property queries accept at most 32 paths and have a configurable payload budget, defaulting to 16 KiB; oversized values return an omission marker and byte count. The budget covers property values, excluding envelope and path metadata. Queries return a revision for the next write. Studio query responses omit the full project and workspace state.

```json
{"action":"query","query":{"kind":"layers","scope":{"kind":"scene","id":"intro"},"offset":0,"limit":20}}
```

Source reads do not require render evaluation to succeed. A schema-valid project with stale override expectations can therefore be inspected and repaired through the session. Every filesystem write still runs native validation on the proposed result.

## Concurrent edits

`reconcile` takes the original `base`, the agent's `proposed` project, and optional explicit conflict resolutions. It reads the current revision, merges independent property changes and ID-addressed collections, and writes only when all conflicts are resolved. The final write uses compare-and-swap against the revision used for merging. Conflicts return no persistable project and make no write.

Concurrent edits to the same value, removal against modification, conflicting insertions with the same ID, and incompatible ordering are reported. Positional arrays are reconciled as a unit. Identity arrays preserve independent additions and use ordering constraints; cycles require an explicit order choice. Conflict paths use `@layer-id` segments within ID-addressed collections and `@order` for ordering. A resolution chooses `current` or `proposed` for that exact conflict; duplicate or stale resolution paths are refused. Native validation remains necessary after structural merging, including reference integrity and locked tracks.

## Instance-specific edits

A nested target supplies an `instancePath` of composition layer IDs, followed by the leaf `layerId`, within a scene or composition scope. These identities do not depend on array positions. Text, style, property, asset, timing, track and removal operations create versioned sparse overrides on the outer instance, preserving the reusable base definition.

Overrides contain ordered `set`, `unset` or `remove-layer` records and optional base-value expectations. Resolution reports missing/ambiguous targets and changed expected base properties instead of silently applying a stale edit. Explicit field overrides take precedence over parameter bindings for the same field. Native instance specialization includes override data in its cache identity; specialized media joins the asset inventory.

Studio's composition inspector exposes the sparse override document, a conflict review with per-record choices, and a Make independent action. Structural insertion, duplication and reordering inside a sparse instance return a materialization-required refusal. `instance-materialize` creates a private editable composition graph with the current parameters and overrides resolved, preserving the reusable base. Supply an unused `compositionId`; nested edits materialize the outer instance first. The SDK also exports `materializeCompositionInstance`.

An override review covers the instance and its reachable base graph with a revision hash. `instance-reconcile` accepts that review hash and explicit `keep-override` or `use-base` choices by record index. Stale reviews, duplicate choices, unresolved conflicts and implicit orphan retargeting are refused. Retained records receive fresh expectations against the preceding retained edits; dropping a record cannot silently invalidate a later target. Orphans can be discarded, while invalid properties cannot be forced through the schema. Native validation verifies the final project before it is saved. An automatic visual editor for authoring individual nested properties remains work.

## Transitive composition usage

The `composition-usage` query takes a source `compositionId`, offset and page limit. It traverses resolved scene instance graphs, preserving source identities behind specialized definitions, so parameter selections and sparse removals affect the returned paths. Each row identifies the scene and ordered stable instance IDs. Studio exposes this through **Find scene instances** with pagination and navigation. Hidden instances are included; this is structural scene usage, not frame visibility.

Traversal is capped at 10000 instances and 128 levels. A truncated response returns `total: null`, a discovered count and an explicit warning; an incomplete or empty page is not proof that a definition is unused. Unreferenced reusable definitions are outside this scene-rooted query. The existing `compositionUses` SDK function reports direct source references separately.

Whole-document saves also compare inherited track and group locks through composition instances. An override edit cannot replace a locked nested track in the same transaction that unlocks it. Lock comparison ignores stale expected-value metadata and conservatively retains base values for invalid old overrides so reconciliation can clear orphaned records. Traversal is bounded and repeated identical instance comparisons are reused.
