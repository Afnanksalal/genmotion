# Resumable production and storyboards

`productionWorkflow` is optional versioned authoring data. It does not introduce another render timeline. Seven maintained workflow definitions cover product films, explainers, footage edits, captions, music-driven films, short motion units and presentations. Each definition names its inputs, outputs and capabilities. Inspection explicitly reports capabilities whose implementation is still missing; selecting a workflow does not make those capabilities available.

The source, planning, authoring, verification and delivery stages form an ordered dependency chain. Each completed stage stores its input fingerprint, completion time and local evidence hashes. Inspection derives pending, complete, stale or blocked state from current content rather than trusting a saved label. Brief/source changes affect every stage. Storyboard direction changes affect planning onward. Native scene and build-link changes affect authoring onward. Feedback and shot approval affect verification and delivery. Missing or changed stage evidence invalidates that stage and blocks downstream completion. Resetting a stage removes its completion and every downstream completion.

Shots have stable IDs, title, visual direction, narration, planned duration, reference files and evidence IDs. Build states are planned/building/built. Built shots link to native scene and layer IDs; missing links invalidate build state. Studio's storyboard navigates a built shot to its native preview frame. References and completed-stage evidence are included in portable bundles.

Shot comments retain author, timestamp, source revision, optional frame and resolution state. Review decisions retain author, note, reviewed revision and a content fingerprint. That fingerprint includes shot direction, linked native content, composition dependencies, project geometry/seed/parameters/brand and source hashes. A changed subject becomes stale. Approval requires a built shot and resolved feedback. Reviews are explicit actions; the production agent is instructed not to manufacture approval.

The Studio project inspector opens the production storyboard. The same actions are exposed through `genmotion_production`, the SDK and the CLI:

```sh
genmotion production ./project
genmotion production ./project --action-file action.json --expected-revision FILE_HASH
```

Actions are `configure`, `shot`, `remove-shot`, `review`, `comment`, `resolve-comment`, `complete-stage` and `reset-stage`. All mutations require the current file revision in CLI/MCP, or the current document revision in Studio, then use the shared project transaction. A shot update preserves comment and review history; content changes make retained review stale.

Verification and delivery completion require local evidence artifacts. The first verification artifact must be a JSON report with `version: 1`, matching `nativeHash` and `assetsHash` from inspection, `passed: true`, and a nonempty `checks` array containing named passing checks. This verifies report binding and integrity; it does not independently prove that an external test runner executed those checks. Producers must supply authentic results. Delivery artifacts are content-hashed. The workflow does not call a passing schema validation a production quality pass.

Native rendering ignores production workflow metadata. Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md). The cross-project failure catalog, visual review procedure, and delivery acceptance gates are defined in [Motion production and visual QA](MOTION-PRODUCTION-QA.md).
