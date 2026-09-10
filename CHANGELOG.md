# Changelog

## 2.10.0

- Reframed the public gallery around four practical, editable starter deliverables: a product launch, feature walkthrough, product demo and cinematic trailer, each with a complete story, exposed parameters, local soundtrack, rendered 1080p master and frame-level QA.
- Improved contrast validation by measuring text against the nearest containing shape behind it, allowing real interface panels to receive accurate accessibility findings.
- Added a canonical typed capability registry that generates focused documentation, schemas and executable examples and fails the repository gate on SDK/CLI/MCP/Studio/skill drift.
- Added focused caption, audio, reference-adaptation and delivery skill packages with explicit contracts, lazy host loading, durable resumable step state and executable examples.
- Added version-safe project upgrades with runtime/library pin checks, bounded migration, representative native-frame validation, immutable backup and atomic rollback across every product surface.

## 2.9.0

- Added render input/output attestations with role-tagged frozen dependency hashes, self-input rejection and full decoded video/audio stream identities.
- Added aligned reference/output comparisons with regional metrics, intentional-change masks, retained frame evidence, boundary indexes and difference contact sheets.
- Added Creative IR reference adaptation maps and reviewable observation records with correction provenance and deterministic native-track compilation.
- Added bounded timing, motion, camera, cursor and visual-region analysis over frozen measurements with confidence, limitations and manual correction history.
- Exposed reference delivery purpose consistently through CLI, MCP, Studio, render plans and native rendering.

## 2.8.0

- Added deterministic JSON/JSONL/CSV batch execution with bounded concurrency, durable row receipts, failure isolation and selective retry.
- Added a quota-bound content-addressed project/provider store with verified deduplication and deterministic local materialization.
- Added offline semantic catalog indexing, skew diagnostics, atomic refresh and inspectable local search/quality feedback without background telemetry.
- Added explicit restricted-asset acceptance, supplied-reference rights enforcement in native rendering, and reversible content-addressed reference-preparation graphs.

## 2.7.0

- Added versioned brand/design specifications with exact binding, font, immutable-asset, variant and delivery-medium drift audits across SDK, CLI, MCP and Studio.
- Expanded native audio racks with shelf filters, saturation, delay, reverb, chorus, phaser and bitcrush; added constant-power pan, stereo balance, track locks and explicit latency/preroll/tail inspection.
- Added inspectable creative preferences and immutable reusable workflow bundles with approval gates, dependency hashes, migration diagnostics and clean re-instantiation.
- Added bounded real-product evidence capture, brand candidate extraction, provider-neutral media resolution, a portable content-addressed media ledger, reviewed transcription and reversible segmentation/matting preparation.

Genmotion follows semantic versioning. GitHub releases contain the verified package archive and its `SHA256SUMS` manifest.

## 2.6.0 - 2026-09-09

- Raised the audited native capability count from 125 to **138/324** with complete caption, typography, temporal-rendering, music authoring, semantic-editing, review, and presentation contracts.
- Added named caption presets, BCP 47 language routing, deterministic entrance/exit animation, absolute-time SRT/WebVTT generation, and embedded subtitle mux plans.
- Added per-layer/effect shutter sampling, bounded motion and directional-light trails, run-level/per-character text styling, timed emphasis, text-on-path, and semantic animated notation.
- Added source-bound music/lyric workflow plans, capability-derived editing controls, dispatched/final/failure receipts, integrity-checked offline review bundles, and deterministic interactive-presentation export routes.
- Regenerated the public examples with native expressive-type and scoped motion-blur coverage. See [milestone QA](docs/MILESTONE-QA-2026-09-09-2.6.md).

## 2.5.0 - 2026-09-09

- Raised the audited native capability count to **125/324**, completing 50 additional contracts across typography, captions, timing, composition, audio, rendering, review and agent editing.
- Added strict acceptance assertions, representative temporal sampling, reproducible render plans, output compatibility reports, review artifacts and native parameter-variant comparison.
- Added source audio diagnostics and repair jobs, spectral-carve proposals with generated-edit ownership, frozen audio feature tracks and deterministic feature-to-animation mappings.
- Added representative-frame color analysis with conservative reversible patches and explicit unsupported HDR/log handling.
- Expanded native Unicode text behavior, caption validation, composition timing, render selection, cancellation cleanup, operation diagnostics, editing checkpoints and capability discovery.
- Regenerated and verified all eight public examples. Final QA passed 275 unit/integration tests, 53 browser tests, package verification and deterministic rendered-example checks; see [milestone QA](docs/MILESTONE-QA-2026-09-09.md).

## 2.4.1 - 2026-09-09

- Fixed Studio playback starvation when native frames arrive after the playhead advances.
- Replaced live PNG delivery with viewport-sized RGBA frames, canvas presentation, bounded prefetch/cache and dedicated native workers. Paused inspection uses a separate worker and full-resolution PNGs.
- Removed duplicate pixel copies from PNG encoding and made preview caches revision/resolution/format safe.
- Added sustained playback performance checks to CI and releases. Three 1080p example projects measured approximately 30 presented FPS locally; see [playback evidence and limits](docs/STUDIO-PLAYBACK.md).

## 2.4.0 - 2026-09-07

- Replaced Studio browser-default widgets with shared custom dropdowns, steppers, checkboxes, sliders, file controls, color selection, search clearing and audio playback controls. Added keyboard navigation and synchronized disabled states.

- Added shared headless editing sessions, coalesced undo/redo, durable named checkpoints, sparse nested overrides and explicit conflict reconciliation.
- Added permission-scoped live Studio agent sessions, shared playhead/selection context, canvas gesture recording with native previews, and path-node editing.
- Added deterministic derived metadata, frozen typed JSON/CSV inputs, generated schema discovery, Unicode-aware text controls and native cap-height/ink alignment.
- Added scene/range/composition/group exports and explicit VP9/ProRes alpha preservation or opaque flattening.
- Fixed oversized MCP tool schemas, missing gesture-button wiring, blocked preview images and floating-point frame-boundary drift during QA.
- Regenerated all eight 1080p examples; improved typography and replaced overlapping or empty scene handoffs with readable cuts.
- Nine further checklist requirements accepted: **75/317** checked. See [milestone QA](docs/MILESTONE-QA-2026-09-07.md) for evidence and limits.

### Earlier changes included in this release

- Added three editable 1080p motion studies: Chromatic Orbit, Route Study and Type / Beat, with local assets, original audio, rendered masters, inspected contact sheets and reproducible generation/render/verification scripts.

- Completed 24 additional checklist requirements with acceptance evidence (66/317 checked). Added native Player variant switching and thumbnails, viewport keyboard controls, serialized Studio saves and production actions, and preview shutdown cleanup. See [checklist reconciliation](docs/CHECKLIST-RECONCILIATION-2026-09-06.md) for tests and remaining scope.

- Added native effects, masks, adjustment layers, LUTs and declarative custom kernels; expanded vector, animation, text and composition controls.
- Added shared revisioned editing, typed variants, immutable bundles, production planning/review, Player embedding and Studio authoring controls.
- Added audio processing, analysis and nested source timing; sequences/sprites, media geometry, caption editing, stream inspection and SDR conforming.
- Hardened bounded rendering, cancellation, persistence and media preparation. Fixed schema export, asset inventory refresh, checkbox visibility, Player development serving and conforming color/timing defects during QA.
- Validation evidence and remaining scope: [milestone QA report](docs/MILESTONE-QA-2026-09-06.md). This milestone does not mark the full capability checklist complete.

## 2.3.0 - 2026-09-02

### Animation kernel

- Added typed numeric, perceptual OKLab color, point, rectangle, discrete, and shortest-angle interpolation with hold keyframes and independent left/right clamp, extend, wrap, identity, loop, and ping-pong extrapolation.
- Added physical spring duration measurement, normalization, optional overshoot clamping, velocity-aware presets, settling analysis, and deterministic easing reversal/mirroring.
- Added project-seeded one- through four-dimensional fractal noise and deterministic start, end, center, edge, and random stagger schedules with trail windows.
- Added dependency-ordered parent transform inheritance and follow, look-at, maintain-distance, and anchor-to constraints for scene and reusable-composition layers.

### Authoring and verification

- Exposed animation inspection through CLI, MCP, and the public SDK, and added complete Studio controls for typed values, holds, extrapolation, noise, hierarchy, constraints, and stagger timing.
- Added the editable Animation Kernel example with a strictly validated 1080p native master and inspected contact sheet.
- Added composition-level typed-track validation and real browser coverage for the new Studio editing paths.

## 2.2.0 - 2026-09-02

### Creative IR and renderer

- Added reusable nested compositions with independent dimensions, local time offset/scaling/looping, recursive native rendering, missing-reference validation, and cycle rejection.
- Added typed number, boolean, string, color, and enum parameters; safe layer property bindings; named variants; CLI/MCP overrides; and deterministic batch variant rendering.
- Added a native SVG path geometry kernel for bounds, length, point/tangent sampling, tolerance-controlled flattening, progressive trim drawing, and seek-safe path-follow motion.
- Added first-class caption layers with timed cues, speakers, word timing/highlighting, native backgrounds/outlines, safe-area diagnostics, and SRT/WebVTT/timed-JSON conversion through CLI, SDK, and MCP.
- Separated transition presentation from timing and boundary placement, with symmetric/incoming/outgoing ownership, reusable composition overlays, and native iris and directional wipe presentations.

### Studio, examples, and verification

- Added Studio inspection and editing for caption styles/cues, composition instances, transition presentation/timing/mode, parameter bindings, motion paths, and their animation tracks.
- Added the asset-free Native Milestones example and deterministic integration coverage spanning all five systems in one native render.
- Capped automatic native worker fan-out to a stable four-worker default after 1080p QA exposed FFmpeg pipe loss under excessive native-canvas concurrency; explicit measured overrides remain supported.

## 2.1.0 - 2026-09-02

### Geometry

- Added first-class shared canvas anchors, native cubic Bezier connectors with seek-safe progressive drawing, exact endpoint and marker-center resolution, strict dangling-reference validation, Studio authoring controls, canvas-reframe support, and an anchored Data Pulse example.

## 2.0.0 - 2026-09-02

### Studio

- Added scalable hierarchical workflow layout, persistent graph connections, layer expansion, search, fit-to-content navigation, and large-project browsing.
- Added direct canvas move and resize controls, magnetic frame snapping, keyboard editing, canvas-format reframing, and a visual color picker consistent with the Studio shell.
- Added visual cubic Bezier handles, easing previews, native frame inspection, decoded audio waveforms, stereo pan, gain, mute, solo, fades, looping, and ducking controls.
- Added searchable, usage-aware asset inventory with image and video previews, safe project-local import, and guarded deletion of unused Studio assets.
- Added downloadable persistent exports, serialized render backpressure, user cancellation, deterministic shutdown cancellation, and partial-file cleanup.
- Added responsive phone and desktop layouts, keyboard-accessible tabs and dialogs, focus containment, visible focus states, and reduced-motion behavior.

### Agents and workflow

- Added native Hermes ACP support alongside authenticated local Codex and Claude runtimes.
- Added project-scoped agent tools, durable conversations, bounded provider retries, revision-safe retry rules, cancellation, restart recovery, and acceptance checks that reject no-op or incomplete authoring claims.
- Bounded terminal conversation history while preserving queued and active requests.
- Kept Workflow and Editor as synchronized views of the same Creative IR instead of separate project models.

### Renderer and media

- Added delivery-resolution rendering, direct animation tracks, custom curves, clipping, paths, shadows, blend modes, layered transforms, audio mixing, and deterministic media freezing.
- Added cancellation-safe encoder and audio-mux lifecycle handling with verified cleanup on abort or failure.
- Added bounded decoded-frame caching, serialized full-render scheduling, and post-encode contract probing.

### Examples and distribution

- Added three reproducible public example films: Kinetic Type, Data Pulse, and Arc One. Each includes strict validation, a native 1080p master, and a contact sheet; Arc One includes an original local audio bed.
- Added Windows and Unix installers that resolve the latest release, verify its SHA-256 checksum, install the packaged CLI, and run the runtime doctor.
- Added reproducible package metadata, clean-install package verification, cross-platform Node 22 and 24 CI, browser E2E coverage, enforced coverage gates, and release artifact automation.

### Security

- Added canonical asset-path confinement resistant to symlink and junction escapes, media signature checks, upload limits, mutation tokens, same-origin and Fetch Metadata checks, nonce-authorized scripts, framing protection, and a restrictive browser permissions policy.
