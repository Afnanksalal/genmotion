# Native capability implementation status — 2026-09-07

The full checklist is **not complete**. Genmotion is **not production-ready against the full native capability program**. This record describes implemented and tested changes without treating narrower fixes as completion of larger requirements.

## 2.4.0 editing and export milestone

The editing tranche has passed native tests and Studio browser QA. It adds shared editing sessions, atomic batches, bounded history, reopenable checkpoints, nested sparse overrides, conflict reconciliation, live agent permissions and context, timestamped canvas recording, Unicode text controls, direct path nodes, derived preflight metadata and frozen JSON/CSV inputs. Export controls include scenes, frame intervals, standalone compositions, parented groups and explicit alpha preservation or flattening.

The [2.4.0 milestone QA report](MILESTONE-QA-2026-09-07.md) records acceptance evidence and limits. Nine additional complete requirements brought the recorded milestone count to **75/317**. A later provenance audit expanded the canonical program to 324 requirements; the current implementation and acceptance audit now records **125/324** complete requirements. This includes stronger typography/captions, composition/media timing, editing history/context, audio analysis and repair, reproducible render manifests, review artifacts, motion diagnostics, native variant comparison, capability diagnostics and typed delivery variants. Broader requirements stay open where their complete contracts remain unimplemented.

Studio now uses [shared custom controls](STUDIO-CONTROLS.md) throughout its inspectors and dialogs, with anchored dropdowns, numeric steppers, themed toggles/sliders, file selection, color editing and audio transport.

All eight public examples were freshly rendered at 1920×1080, decoded and validated. Display typography and scene handoffs were improved after inspecting native and encoded frames. These examples demonstrate the native renderer; they do not certify the entire remaining roadmap.

## Validated implementation milestone

The implementation accumulated after the earlier checkpoint has now undergone native/integration testing, browser QA, package installation and fresh render inspection. See [the milestone QA report](MILESTONE-QA-2026-09-06.md) and [machine-readable audit](audits/genmotion-implementation-2026-09-06.json) for current results, fixes and limits. The full checklist remains incomplete.

## Earlier verified checkpoint (before this milestone)

| Area | Implemented behavior | Evidence |
| --- | --- | --- |
| Frame delivery | Bounded frame reservations by count/bytes, ordered output, backpressure including small writes, effective worker limits, stage/queue/memory diagnostics | Frame-stream, render, Studio API and browser tests |
| Render lifecycle | Cancellation and deadlines through preparation, workers, encoding, mux and probing; staged verification before replacing a master; process reaping and temporary-output cleanup | Process tests; real render cancellation, deadline, contention and output-preservation tests |
| Export formats | Explicit container compatibility; VP9/WebM Opus audio; correct variant extensions; Studio codec/filename synchronization | H.264, H.265, VP9 and ProRes encode/decode tests with audio; visual 1080p WebM export |
| Media memory and preparation | Bounded decoded-image retention; invalidation and failed-decode eviction; isolated clip variants; complete video generations; failed preparation cleanup; nested composition media and caption fonts | Native image-cache, video preparation and native render tests |
| Project persistence | Shared validated transactions, process locks, dry runs, revision rechecks, no-op detection, raw-source history, atomic replacement, structured receipts | SDK tests, separate Node-process contention, MCP and Studio tests |
| Semantic editing | Stable scene/composition/layer addressing; text, property, timing, asset, layer and track operations; structural refusal queries; inverse patches | Semantic tests; MCP inspect/refuse/dry-run/apply/undo; Studio semantic API tests |
| Studio consistency | Submitted render revisions remain fixed; external conflicts return authoritative state; text-only inspector saves use semantic transactions | Studio API tests and browser suite |
| Typed parameters and variants | Structured/optional values, local dependency hashes, safe nested bindings, bounded matrices, CSV/JSON conversion and Studio controls | Parameter and variant tests; Studio persistence/configuration browser scenario |
| Composition instances | Scoped parameters, independent evaluated instances, local FPS, reverse/remapped/trimmed time, finite/ping-pong loops and frame holds | Native RGBA equivalence, timing/validation tests and Studio save/remove coverage |
| Native vector operations | Complete SVG command parser, canonical curves/subpaths, boolean geometry, stroke expansion, corner rounding, native trims and operation stacks | Native pixels, CLI/MCP tools and Studio normalization/stack editing |
| Geometry and morphing | Fifteen native primitives, cutting/reversal/subdivision/corner warp, compatible cubic contour morphs | Native contact sheets, pixel and curve tests, Studio authoring/reload |
| Loudness and stems | Measured normalization, true-peak diagnostics, four pre-master float stems and embedded metadata; isolated PCM preparation prevents concurrent tail loss | PCM/AAC measurements, sample-level stem reconstruction and concurrent output hashes |
| Audio processing | Typed effect racks, gain/rate/reverse controls, configurable voice ducking, source-audio fixes, verified audio-only exports and processed Studio preview | Decoded PCM measurements, four audio/video containers, browser rack and ducking controls |
| Animation controls | Native gradients, spatial stagger, derivative plots, exact subframes, group mute/solo, edit locks and typed property links | Native pixels/math, CLI/MCP and Studio persistence/visual QA |
| Text layout | Shared native fitting, full-content line limits, grapheme wrapping, explicit overflow and automatic dimensions | Measurement and native contact-sheet QA, CLI/MCP/Studio checks |
| Text readability treatments | Rounded whole-block and resolved-line backgrounds with independent padding/radius | Native pixel assertions for block and multiline backgrounds |
| Temporal sampling | Deterministic project shutter sampling with premultiplied-alpha accumulation and delivery-quality sample caps | Native moving-edge blur and repeated-render equivalence tests |
| Path confinement | Existing and not-yet-created asset/cache/history paths check canonical ancestors; dangling links are refused | Loader confinement tests and native pipeline tests |

GM-083 and the verified frame-hold, SVG parser, easing clipboard, boolean/stroke geometry, ducking and audio-effect requirements are checked in the canonical backlog. GM-084 and the broader editing, media, export and production requirements remain unchecked where their full acceptance contract exceeds the behavior verified here.

## Earlier checkpoint verification

- Lint and TypeScript checks passed.
- Native/unit/integration suite: **161 tests across 46 files passed**.
- Coverage: **92.51% lines/statements, 97.39% functions, 80.05% branches**, above the repository thresholds. Browser JavaScript embedded in the Studio HTML string is validated by browser tests; its TypeScript coverage percentage is not browser execution coverage.
- Studio browser suite: **36 tests passed**, including export, resource controls, cancellation, semantic text editing, layout and accessibility flows.
- All four supported video codecs encoded and decoded with the full audio rack. WAV, FLAC, M4A and Opus standalone exports also passed decode verification.
- A follow-up MCP startup closed before handshake during concurrent checks; its sequential rerun passed. Test startup now captures stderr for diagnosis if this recurs.
- Existing example verification passed for kinetic-type, data-pulse, arc-one, native-milestones and animation-kernel. This validates their existing encoded artifacts; it is not a new render of every example.
- Package installation smoke test passed: packaged CLI version and native dependency doctor verified in a temporary installation.
- Visual QA artifacts are in `output/playwright/render-qa/`; these are local generated artifacts, not committed source fixtures.

Verification was performed on this Windows host. It does not establish Linux/macOS compatibility or exhaustively certify all new failure paths.

## Remaining acceptance work

The [canonical checklist](NATIVE-CAPABILITY-BACKLOG.md) remains authoritative. Major open systems include full nested timing/group semantics, derived parameters and advanced data variants, complete visual-effect coverage and audio bus routing, broader color management, professional compositing/3D, media acquisition and provenance, complete reproducibility and production-workflow acceptance, editing sessions and persistent gesture history, time-aware visual assertions, distributed rendering and the AE tracking/roto/cleanup/deformation/interchange requirements.

The checklist currently contains **110 checked items and 214 unchecked items** across **324 requirements**, including its architectural guardrails. The [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md) records the earlier 24 newly closed requirements and final verification; the remaining requirements stay open.

Specific limits of the changes above remain explicit:

- Filesystem project locks are advisory. External editors can ignore them. Dead-owner locks require inspection; automatic crash recovery is not implemented.
- Studio layout state is a separate file from the Creative IR and does not share its atomic rename.
- Semantic composition edits modify definitions. Typed per-instance parameter overrides are implemented; arbitrary sparse property overrides and complete headless session/history adapters remain open.
- Image cache fingerprints use filesystem metadata. Immutable content-hashed bundles are implemented; ordinary editable-project rendering still uses metadata fingerprints.
- Completed video generations remain on disk. A bounded disk cache and media ledger are not implemented.
- The frame reservation limit is not a total-process memory limit.
- Output probing verifies metadata, not every possible visual, audio or delivery-quality defect.

These remaining capabilities must be implemented and verified before claiming the user's requested full-checklist pass.
