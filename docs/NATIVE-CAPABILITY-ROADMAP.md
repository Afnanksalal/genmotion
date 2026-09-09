# Genmotion native capability roadmap

Planning baseline: 2026-09-06, package 2.3.0. This document records Genmotion's baseline gaps, implementation order and acceptance scenarios. Later completion status belongs to the [canonical checklist](NATIVE-CAPABILITY-BACKLOG.md) and its linked verification reports.

Genmotion uses a typed scene graph, native frames, revision-safe edits and a human editor over the same data. The roadmap connects those foundations into a complete creative workflow. The requirements describe product behavior; implementation must use Genmotion's shared Creative IR and services.

## Baseline gaps

These are historical planning observations, not claims about current completion. The [current gallery](../examples/README.md) contains eleven examples; the five-example count below records the planning baseline.

| Area | Genmotion baseline and gap | Requirement owner |
| --- | --- | --- |
| Intent and workflow routing | `creative/types.ts` provides a brief/concept schema and `init` a neutral artboard; no equivalent persisted production-stage system | §21/23 → GM-001–003 |
| Storyboard review | Workflow graph and reference board exist; planned shots are not a first-class storyboard with build/approval traceability | §15/21 → GM-004–005 |
| Brand direction | Brand tokens and reference decisions exist; no versioned source-to-brand binding and drift report | §2/14 → GM-006 |
| Reuse of approved direction | Motion-library JSON is reusable, but an approved brief/brand/storyboard workflow is not a reusable package | §14/23 → GM-007–008 |
| Website evidence capture | Real capture is delegated to external tools; no integrated evidence ingestion/coverage report | §20 → GM-009–011 |
| Design imports | Paths and images can be authored manually; no importer with fidelity/editability reports | §19/20 → GM-012 |
| Media acquisition and provenance | Asset confinement and local upload exist; no common acquisition/derivation ledger across media providers | §14/20 → GM-013–014 |
| Source preparation | Video frame cache and caption conversion exist; local transcription, segmentation and reversible preparation jobs are gaps | §6/8/20 → GM-015–017 |
| Library discovery | Catalog ranks motions/references, supports local motion libraries; no equivalent component packaging or semantic index contract | §14/23 → GM-018–023 |
| Visual content breadth | Five examples and a smaller recipe/reference catalog; need native, parameterized content families and preview coverage | §4/23 → GM-024–025 |
| Audio effect racks | FFmpeg mix supports gain, pan, fades, limiting and ducking; no editable effect rack or parameter automation | §7 → GM-026–029 |
| Audio submixes | Audio tracks are flat; no submix graph or group editing | §7/12 → GM-030 |
| Spectral voice/music carving | `sidechaincompress` ducks a marked music bus, without spectral analysis or editable generated envelopes | §7 → GM-031–032 |
| Mix diagnosis and repair | No loudness/repair proposal workflow or integrated quality report | §7/16 → GM-033–034 |
| Music-driven structure | Stagger/noise are deterministic, but there is no source-derived analysis timeline or feature-track binding | §3/7/12 → GM-035–037 |
| Color grading | Color interpolation and layer filters exist; there is no comparable grading stack | §9 → GM-038–039 |
| Source-aware treatments | No media diagnosis-to-edit path or focused treatment capability query | §9/21 → GM-040 |
| Media effects | Some generic filters/blend modes exist; most parameterized treatment families and their Studio controls are absent | §9 → GM-041–043 |
| Treatment comparison | Contact sheets sample one output; no common candidate comparison operation | §15/16 → GM-044 |
| Selective treatment and cost | Clips/shadows are not a general mask/effect compositor; no per-effect capability/cost report | §9/18 → GM-045–046 |
| Headless editing SDK | Public exports and MCP JSON patches exist; no equivalent shared editing session used by all clients | §21/22 → GM-047–051 |
| Sparse instance overrides | Project parameters/variants exist; per-instance sparse structural overrides and base-update reconciliation do not | §1/2 → GM-052 |
| Agent-visible Studio state | Studio prompts include selection; MCP inspection does not expose the full live editing context as a common session | §21 → GM-053–054 |
| Evidence of edits | Revision changes and acceptance checks exist; no common evidence-bearing receipt across all edits | §21 → GM-055 |
| Gesture authoring | Direct canvas transforms and typed tracks exist, but no record/smooth/review gesture workflow | §11/13 → GM-056 |
| Visual quality gate | Validation checks structure, geometry and some readability; no comprehensive rendered-state evidence report | §16/24 → GM-057–061 |
| Behavioral assertions | Animation values can be inspected; user-authored motion acceptance assertions are absent | §21/24 → GM-062–063 |
| Motion debugging | Easing/track/path inspection exists; temporal ownership and composed trajectory diagnosis need expansion | §3/13/21 → GM-064–065 |
| Measurable visual regressions | Deterministic frame/transition tests exist; no broad golden-media and historical performance program | §24 → GM-066, GM-081–082 |
| Embedding and review | Native preview server exists; no embeddable public Player or review-product contract | §15 → GM-067–069 |
| Interactive presentations | Timeline is linear; interactive routes and a reproducible linearization policy are gaps | §1/15 → GM-070–072 |
| Editor accessibility | Basic keyboard/accessibility work exists; no demonstrated large-timeline focus/virtualization contract | §12/22 → GM-073 |
| Export breadth and color | Four codecs and resolution verification exist; alpha/HDR/image-sequence delivery are incomplete | §6/16 → GM-074–076 |
| Distributed/batch delivery | Local parallel workers and named variants exist; distributed orchestration and per-row batch lifecycle are gaps | §2/17 → GM-077–080 |
| Reproducible runtime and lifecycle | Shrinkwrap, release verification, capped workers and cleanup exist; stage-level limits and durable render manifests need work | §16/22/24 → GM-083–085 |
| Documentation and onboarding | One main skill and broad CLI/MCP schema; need generated capability guidance, migration checks and executable recipes | §21/23/24 → GM-086–091 |

## Implementation order

Priority follows dependency order, not a promised release date.

1. **Make edits and renders trustworthy.** GM-047–055, GM-057–064, GM-083–085. Establish one semantic mutation service, stable nested addresses, receipts, visual evidence, bounded work, and cancellation through every stage. This makes subsequent agent work safer to inspect and undo.
2. **Complete the production loop.** GM-001–017, GM-024–025, GM-033–037. Tie the brief, storyboard, real sources, audio/transcript landmarks, and accepted scenes together. Ship complete workflows rather than more disconnected commands.
3. **Build the compositor and sound system.** GM-026–032, GM-038–046, GM-074–076. Start with a typed ordered effect graph and mask/group semantics, then add individual treatments. Audio needs its own signal-flow semantics and parity fixtures, not just more FFmpeg flags.
4. **Enable reuse and product integration.** GM-018–023, GM-052, GM-067–073, GM-086–091. Components, library previews, semantic discovery, a headless SDK and Player are reusable infrastructure. Interactive decks are optional expansion, not a prerequisite for video compositing.
5. **Scale proven output.** GM-077–082. Distributed work follows a stable local manifest, cache, frame/audio boundary contract and deterministic stitching. Backend adapters must share the same native evaluator.
6. **Advance into shot work.** AE-001–012. Tracking and matte correction should precede more speculative camera solving, generative cleanup or complex simulation. Those features need acceptance clips with measurable temporal quality.

## Native architecture rules

- Preserve the Creative IR as the single rendering contract. Workflow documents can record rationale/review; they cannot secretly override scene timing or pixels.
- Translate HTML/CSS/GSAP/Web Audio/WebGL features into native scene, effect, audio and timing primitives. Keep rendering in the native evaluator.
- Acquisition, transcription, segmentation, generation and tracking may use optional adapters before rendering. Freeze their outputs, model/tool identity, settings and source hashes. Final evaluation must not call a model or network service.
- Expose reusable visual families as parameterized native compositions or vetted native effects. HTML snippets and arbitrary project scripts are not the extension format.
- Preserve agency: a library is an optional starting point. Do not force every request into templates, make provider sign-in a requirement for local editing.
- Solo currently participates in export filtering. Any future audition/output distinction needs migration and clear controls.
- Runtime determinism has a declared envelope: engine version, fonts, source hashes, platform/backend, color pipeline and seeds. Same timestamp alone is not a cross-platform pixel-equivalence claim.

## Acceptance scenarios

| Scenario | Required proof before claiming completion |
| --- | --- |
| 30-second branded product film from a real URL | Frozen source inventory and capture omissions; approved brand bindings; storyboard links to actual scene IDs; no invented product evidence; source/scene revisions in final manifest; representative visual and audio review |
| Narrated film with three voice clips and a music bed | Shared voice bus; generated spectral carve shown as editable lanes; manual EQ survives reanalysis; intentional tails; source/preview/export timing and loudness checks |
| Grade a dark interview and compare three treatments | Measured diagnosis plus a reviewable patch; original remains intact; consistent timestamps in comparison sheet; chosen parameters editable; output matches the accepted treatment |
| “Make this entrance quicker but keep the exit and captions” | Nested stable target; bounded operation scope; changed-track diff; inverse patch; before/after native frames; assertions for unchanged exit and caption readability |
| Reuse a lower third for 100 records | Typed input validation with per-row errors; local assets/fonts; template version and sparse overrides; dry-run manifest; isolated failures/retries; deterministic output naming and verified artifacts |
| Render locally and on a worker backend | Same frozen inputs and manifest; random seek and shard seam fixtures; declared pixel/audio tolerances; verified hashes; cancellation and failure cleanup at every stage |
| Attach a label to a moving phone (AE frontier) | Track confidence and correction controls; approved track frozen into IR; occlusion/matte behavior; no renderer-time inference; corrected segments survive later edits |

## Maintaining the checklist

`GM-*` requirements refine existing domains or add production workflows. `AE-*` identifies the advanced compositor program. Complete a refinement and its parent only when each acceptance contract is satisfied. Preserve all requirements and their individual completion states; a feature count is not a checklist completion count.
