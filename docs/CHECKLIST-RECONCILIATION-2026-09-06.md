# Checklist reconciliation — 2026-09-06

This follow-up closes the acceptance gaps in the implemented milestone capabilities. The prior milestone commit is `6e8ded9`. Its 42 checked requirements were a historical count, not a count of every implemented feature. This report maps individual requirements to their implementation and tests; effect types and test cases do not count as checklist completions.

## Changes made to finish acceptance

- Added native named-variant switching across Player metadata, frames and audio, and the public GenmotionThumbnail API with request cancellation and image cleanup.
- Preserved fractional playback-clock progress and synchronized custom playback rates with the controls. Verified reduced-motion behavior, playback events, processed audio synchronization and fullscreen.
- Added viewport keyboard zoom, fit, native scale and pan. Serialized preference saves and preserved the open dialog's state across autosave responses.
- Prevented overlapping production mutations, preserved reviewer identity and displayed workflow capability requirements. Enabled the implemented beat-analysis capability.
- Fixed preview shutdown to terminate incomplete client connections, cancel audio work and settle pending frame work before cleanup.
- Added SDK, CLI and MCP contract coverage for bundles, LUTs, effect catalogs, workflow configuration and markers; added native pixel/timing assertions for effect animation, caption paging and media borders.

## Newly completed requirements

| Canonical requirement | Implementation documentation | Acceptance evidence |
| --- | --- | --- |
| Component parameters, defaults, constraints, validation, and per-instance overrides. | [PARAMETERS.md](PARAMETERS.md) | tests/composition-parameters.test.ts; tests/composition-time.test.ts; Studio instance override persistence |
| Typed string, number, boolean, color, enum, file, asset, font, dimension, duration, object, array, and optional parameters. | [PARAMETERS.md](PARAMETERS.md) | tests/parameters.test.ts; generated Studio parameter controls; legacy fixture loading |
| Parameter defaults, constraints, descriptions, groups, presets, and generated Studio controls. | [PARAMETERS.md](PARAMETERS.md) | tests/parameters.test.ts; tests/variants.test.ts; Studio named configurations and nested defaults |
| CLI, MCP, SDK, Player, and render-API parameter overrides. | [PARAMETERS.md](PARAMETERS.md) | tests/mcp.test.ts; parameter/variant tests; Player variant/thumbnail browser tests |
| Batch parameter matrices plus CSV- and JSON-driven variants. | [PARAMETERS.md](PARAMETERS.md) | tests/variants.test.ts; MCP variant conversion; Studio configuration import/export |
| Whole-layer and per-corner radius, borders, outlines, and inner borders. | [MEDIA-GEOMETRY.md](MEDIA-GEOMETRY.md) | tests/media-geometry.test.ts; native rounded-corner and animated inner-border pixels; shared outline effect |
| Word/token timing and correction, caption pages, page duration, forced breaks, speakers, and speaker styles. | [CAPTION-EDITING.md](CAPTION-EDITING.md) | tests/caption-editing.test.ts; caption rendering QA; Studio caption page/word/style editors |
| Ordered, reorderable, toggleable, copyable, animatable multipass effects on layers, groups, compositions, and adjustment layers. | [VISUAL-EFFECTS.md](VISUAL-EFFECTS.md) | tests/visual-effects.test.ts; tests/checklist-contracts.test.ts; Studio stack reorder/bypass/copy/paste/LUT persistence |
| Original native custom-effect SDK using safe declarative kernels or vetted native/WGPU plugins, never arbitrary project code. | [NATIVE-KERNELS.md](NATIVE-KERNELS.md) | tests/native-kernel.test.ts; MCP input-schema export; Studio custom graph save/reload; native effect contact sheet |
| Gesture and keyboard zoom, fit view, 100% view, pan, fullscreen, and onion skinning. | [CANVAS-VIEW.md](CANVAS-VIEW.md) | Studio viewport persistence, keyboard zoom/pan and successive-autosave tests; native neighboring-frame overlays |
| Timeline, scene, comment, and beat markers; named ranges; in/out points; and range looping. | [MARKERS.md](MARKERS.md) | tests/markers.test.ts; CLI/MCP revisioned markers; Studio marker persistence and bounded range playback |
| Play, pause, frame seek, time seek, rate, volume, mute, loop, fullscreen, and custom controls. | [PLAYER.md](PLAYER.md) | real browser Player lifecycle, playback, loop, rate synchronization and custom controls |
| Current-frame, time, end, error, buffering, waiting, and resume events. | [PLAYER.md](PLAYER.md) | Player lifecycle/event browser acceptance and slow-frame cancellation |
| Live parameter and composition-variant updates. | [PLAYER.md](PLAYER.md) | named variant native-frame/thumbnail equality; parameter updates and stale seek rejection in browser |
| Poster images, responsive sizing, letterbox, fit/fill, transparent preview, and reduced-motion preview. | [PLAYER.md](PLAYER.md) | Player native image presentation and reduced-motion/autoplay browser acceptance; transparent frame rendering |
| Local-first telemetry hooks with no default data transmission. | [PLAYER.md](PLAYER.md) | Player optional local telemetry callback and callback-failure isolation in browser |
| Content-addressed frozen project bundles and dependency manifests. | [BUNDLES.md](BUNDLES.md) | tests/bundle.test.ts; SDK/CLI/MCP restore/verify contracts; native relocated-frame equality and corruption refusal |
| **GM-002** Route product films, explainers, existing-footage edits, captions, music-driven films, short motion units, and presentations through maintained workflows with explicit inputs, outputs, and capability requirements. | [PRODUCTION-WORKFLOWS.md](PRODUCTION-WORKFLOWS.md) | seven maintained workflows with explicit inputs/outputs/capabilities; SDK/CLI/MCP configure and Studio workflow selection |
| **GM-003** Track resumable production stages and dependencies from source collection through planning, authoring, verification, and delivery; invalidate only affected stages when the brief or assets change. | [PRODUCTION-WORKFLOWS.md](PRODUCTION-WORKFLOWS.md) | tests/production.test.ts stage invalidation and evidence binding; persisted Studio stage completion |
| **GM-004** Provide a storyboard with stable shot IDs, sketches/references, visual direction, narration, source evidence, planned duration, and separate build and review states; link built shots to real IR scene/layer IDs. | [PRODUCTION-WORKFLOWS.md](PRODUCTION-WORKFLOWS.md) | stable shot schema and native build-link validation; Studio storyboard authoring and reload |
| **GM-005** Support shot-level comments, resolved feedback, and navigation from storyboard to native preview; bind review decisions to a revision so a later change cannot inherit stale approval. | [PRODUCTION-WORKFLOWS.md](PRODUCTION-WORKFLOWS.md) | revision-bound review invalidation, comment resolution and native-preview navigation; Studio acceptance |
| **GM-039** Import and validate local LUTs with dimensions/domain/interpolation/intensity, hashes and color-space expectations; preview the same grade and parameter order used for export. | [LUTS.md](LUTS.md) | tests/lut.test.ts parser/domain/interpolation/hash rejection; native stack and Studio imported LUT round trip; CLI/MCP imports |
| **GM-043** Make treatment animation support explicit per parameter; implement declared blur/pixelation/bloom/grain/reveal controls without hidden wall-clock state, and reject animation on unsupported controls. | [VISUAL-EFFECTS.md](VISUAL-EFFECTS.md) | declared animation metadata; random-seek blur/pixelation/bloom/noise/reveal pixels and unsupported-animation rejection |
| **GM-067** Ship a framework-neutral embeddable Player/thumbnail API for native preview transport with play/pause/seek/rate/volume/loop controls, responsive sizing and stable events; do not create a second browser scene renderer. | [PLAYER.md](PLAYER.md) | public GenmotionPlayer/GenmotionThumbnail and Web Component; native named-variant pixels and browser lifecycle tests |

Named parameter presets are project configurations. Effect groups are native composition groups; this does not close the separate broad grouping/hierarchy requirement. Workflow routing exposes required capabilities and refuses missing prerequisites; it does not implement all downstream features named by those workflows.

## Implemented areas whose larger requirements remain open

| Area | Remaining acceptance scope |
| --- | --- |
| Compositions | Complete coordinate/anchor/group semantics, arbitrary sparse overrides and all mounting/layer-component behavior. |
| Data variants | Derived data, complete localization and side-by-side comparison workflows. |
| Media | Complete relinking, proxy/cache policy, comprehensive alpha/ICC handling and professional conforming coverage. The media ledger is a validated schema foundation, not an integrated acquisition/provenance service. |
| Audio | Broader bus routing, analysis at every timeline zoom, oscillator visualization layers and persistent phrase-level analysis. |
| Captions | Complete multilingual/bidirectional layout, global preset workflows and embedded subtitle delivery. |
| Effects and compositing | Remaining selective-color, progressive-blur, track-matte and other listed effect families, plus professional compositing/3D requirements. Having 64 effect types does not complete these umbrella requirements. |
| Transitions and canvas editing | Remaining transition families, full multi-selection/gizmos and persistent gesture/editing-session history. |
| Player ecosystem | Framework wrapper packages, Media Session integration, review links and annotation tools. |
| Rendering and production | Crash recovery, distributed rendering, complete reproducibility, full delivery acceptance and time-aware visual assertions. |

These items remain unchecked in the canonical backlog. The full 317-item program is not production-ready. This verification is on Windows; it does not establish Linux/macOS compatibility.

## Final verification and count

**66 of 317 requirements are checked: 24 newly completed, 251 still open.** No requirement was removed, split or weakened to change the count.

- Native/unit/integration: **215 tests across 64 files passed**. Coverage: **89.60% lines/statements, 96.69% functions, 79.20% branches**; repository thresholds passed.
- Browser acceptance: **47 tests passed** on the final full run. An earlier run found a preview shutdown timeout; the fix passed a focused browser retest, the complete browser suite and a new incomplete-HTTP-request regression test.
- ESLint, full TypeScript checking and package TypeScript compilation passed.
- Packaged installation smoke: CLI version and native dependency doctor passed in a temporary installation.
- Fresh native export: **1920×1080, 24 FPS, 48 frames, H.264**; full FFmpeg decode passed. Visually inspected the new four-frame contact sheet for the gradient/mask/title reveal and timed karaoke highlighting.
- Generated logs and render artifacts are under `output/checklist-*` and `output/playwright/milestone-render/`; the committed [audit](audits/checklist-reconciliation-2026-09-06.json) records hashes and acceptance mappings.

Coverage measures instrumented TypeScript. Browser execution of Studio's generated script is established by the browser suite, not by its TypeScript line coverage. The full browser suite, native contracts and rendered contact sheet cover the behavior stated here; they are not a full-product production certification.
