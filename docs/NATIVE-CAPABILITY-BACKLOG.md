# Genmotion Native Capability Backlog

This is the canonical, version-controlled checklist for Genmotion's native motion-design and agentic compositing program. It is intentionally exhaustive: priority and release assignment may change, but an item must not be silently removed because it is difficult or niche.

See [the native capability roadmap](NATIVE-CAPABILITY-ROADMAP.md) for baseline gaps, implementation order and acceptance scenarios. `GM-*` requirements refine existing domains or add production workflows; `AE-*` requirements cover advanced compositing. Implement each capability once through the shared Creative IR and services.

## Status and completion contract

- `[ ]` means not yet proven complete.
- `[x]` means the capability is implemented and verified across every applicable surface.
- A checked capability must include the Creative IR/schema, native evaluation or rendering, validation, Studio authoring, CLI/MCP/SDK access, migration coverage, automated tests, documentation, and representative native-frame or encoded-output QA where applicable.
- Partial implementations remain unchecked. A renderer-only path, Studio-only state, placeholder, stub, or undocumented private API does not count.
- Every implementation must preserve deterministic frame evaluation, frozen local assets, project-root confinement, revision-safe editing, and one shared Creative IR.

## Non-goals and hard architectural guardrails

- [x] Do not adopt React, JSX, DOM, CSS, or Puppeteer as the rendering model.
- [x] Do not adopt Webpack bundling.
- [x] Do not execute arbitrary project JavaScript.
- [x] Do not fetch remote assets during rendering; imports must be frozen locally with provenance.
- [x] Do not couple the core to AWS Lambda; distributed rendering must be provider-neutral.
- [x] Do not copy or depend on incompatibly licensed implementation code.
- [x] Do not couple the renderer to a model, TTS, STT, or transcription provider.
- [x] Do not execute nondeterministic browser Lottie expressions.
- [x] Do not create Studio-only animation state separate from Creative IR.

## 1. Composition and scene architecture

- [ ] Nested compositions, reusable composition definitions, composition instances, and reusable layer components.
- [ ] Component parameters, defaults, constraints, validation, and per-instance overrides.
- [ ] Component-local coordinate systems, timelines, frame rates, dimensions, anchors, masks, and automatic scaling when embedded.
- [ ] Nested groups with transform, clipping, opacity, blend modes, effects, local timing, local anchors, and local masks.
- [ ] Sequence-style time offsets, nested offsets, negative offsets, and sequential scene containers.
- [ ] Automatic sequence and composition duration calculation.
- [ ] Trim-before, trim-after, premount, and postmount intervals.
- [x] Freeze a composition at a frame or only during a selected interval. Evidence: [shared source-time contract](COMPOSITIONS.md), native RGBA equality and interval-boundary checks in `tests/composition-parameters.test.ts`, timing tests, and Studio save/remove browser coverage. Optional fields preserve existing project documents.
- [ ] Finite loops, infinite preview loops, nested loops, ping-pong loops, time remapping, playback-rate controls, and time stretching.
- [x] Composition cycle detection, dependency graph, and usage search.
- [ ] Composition folders, multiple deliverables per project, still compositions, variants, duplication, presets, and named sequences.
- [ ] Hide supporting sequences from the timeline and expand or collapse nested compositions.
- [ ] Render a selected composition, scene, group, or still.
- [ ] Import another Genmotion project as a frozen, versioned component dependency.

## 2. Parameters, data, and variants

- [ ] Typed string, number, boolean, color, enum, file, asset, font, dimension, duration, object, array, and optional parameters.
- [ ] Parameter defaults, constraints, descriptions, groups, presets, and generated Studio controls.
- [ ] CLI, MCP, SDK, Player, and render-API parameter overrides.
- [ ] Batch parameter matrices plus CSV- and JSON-driven variants.
- [ ] Locale, brand, canvas-format, and platform-safe-area variants.
- [ ] Deterministic derived parameters and preflight calculation of duration, dimensions, FPS, and output names.
- [ ] Frozen local data sources, dependency hashes, and pre-render data validation.
- [ ] Declarative parameter references in text, colors, assets, numeric tracks, effects, transitions, and component instances.
- [ ] Preview-time parameter editing, side-by-side comparison, named configurations, and configuration import/export.

## 3. Animation and timing

- [x] Multi-point numeric, perceptual color, angle, vector/point, and rectangle interpolation.
- [x] Gradient and compatible-path interpolation. Evidence: [native paint contract](PAINT.md) and [path morph contract](VECTOR-PATHS.md), native intermediate-frame/alpha/angle tests, structural preflight, CLI/MCP/SDK schema access, Studio animated-paint/path persistence, and contact-sheet QA.
- [x] Independent left/right extrapolation with clamp, extend, wrap, identity, loop, and ping-pong behavior.
- [x] Shortest-path rotation interpolation, discrete steps, and hold keyframes.
- [x] Named and per-segment easing, custom cubic Bezier easing, reversal, mirroring, and presets.
- [x] Easing copy/paste commands. Evidence: [shared editing contract](EDITING.md), SDK pure/transaction tests, CLI commands, MCP copy/paste workflow, and Studio browser persistence coverage for complete named, Bezier, and spring settings.
- [x] Springs with duration measurement, normalization, overshoot clamping, velocity, physical presets, and settling visualization.
- [x] Deterministic seeded randomness and deterministic 2D, 3D, and 4D noise.
- [x] Stagger by index, distance, center, and seeded random order plus delay and trail utilities. Evidence: [shared stagger timing](STAGGER.md), native activation and animated-position tests, bounded deterministic schedules, CLI/MCP checks and Studio persistence coverage. Existing timing defaults remain compatible.
- [x] Frame-rate-independent helpers and subframe evaluation. Evidence: [exact-time contract](TIME.md), identical native pixels across frame rates, fractional-frame preview/CLI/MCP checks and Studio exact-seek browser coverage. Integer-frame defaults remain compatible.
- [ ] Shutter-based temporal sampling, motion blur, motion trails, directional light trails, per-layer/effect control, shutter angle, and quality-dependent sample counts.
- [x] Velocity and acceleration visualization. Evidence: [native analysis contract](ANIMATION-ANALYSIS.md), scalar/vector/quadratic derivative tests, discontinuity handling, bounded CLI/MCP/SDK access and visually inspected Studio plots. Analysis is read-only and preserves existing project documents.
- [x] Track grouping, mute, solo, lock, and expression-free property linking. Evidence: [shared track controls](TRACK-CONTROLS.md), deterministic group/solo and linked native pixels, transaction lock/deletion tests, CLI/MCP edits and inspection, and Studio typed-control persistence coverage. Optional fields preserve prior projects.
- [x] Parent-child transform inheritance and follow-path, look-at, maintain-distance, and anchor-to-anchor constraints.

## 4. Vector geometry and paths

- [x] Complete SVG path parser, canonical normalization, relative-to-absolute conversion, and serialization. Evidence: [native path contract](VECTOR-PATHS.md), all-command grammar and native fill/stroke equivalence in `tests/svg-path.test.ts`, CLI/MCP inspection, and Studio normalization/persistence browser coverage. Canonicalization preserves curves, closure, and disjoint subpaths.
- [x] Path bounds, length, point, tangent, and normal queries.
- [x] Path cutting, trimming, reversal, translation, scaling, centering, warping, subdivision, and subpath extraction. Evidence: [shared geometry stack](VECTOR-PATHS.md), curve/contour and native-fill tests in `tests/path-editing.test.ts`, CLI/MCP/SDK operations, and Studio stack persistence/reload coverage. Geometry expansion is bounded and malformed operations fail preflight.
- [x] Compatible-path normalization, interpolation, shape morphing, and multi-subpath morphing. Evidence: [native path morph contract](VECTOR-PATHS.md), deterministic native intermediate frames and topology validation in `tests/path-morph.test.ts`, Studio save/reload coverage, and five-frame native contact-sheet QA. Existing documents retain their animation defaults.
- [ ] Motion-path attachment, automatic path orientation, offset paths, animated dashes, arrowheads, and start/middle/end markers.
- [x] Boolean union, intersection, subtraction, and exclusion. Evidence: [native geometry operation stack](VECTOR-PATHS.md), native pixel checks for all operations and hole winding, project rendering, CLI/MCP evaluation, and Studio stack persistence.
- [x] Stroke expansion and rounded corners on arbitrary paths. Evidence: [native geometry operation stack](VECTOR-PATHS.md), outline cap/join and corner pixel checks, native renderer integration, CLI/MCP evaluation, and Studio add/edit/remove coverage.
- [ ] Editable path nodes with smooth, symmetric, and corner modes plus direct Bezier handles.
- [ ] Path, anchor, and shared-geometry snapping and constraints.
- [x] Native arcs, pies, callouts, arrows, stars, sparks, hearts, regular polygons, triangles, donuts, rings, spirals, waveform paths, line charts, and area charts. Evidence: [native primitive contract](VECTOR-PATHS.md), deterministic/boundary geometry and native contour/stroke pixels in `tests/primitives.test.ts`, Studio authoring tests, and native 15-primitive contact-sheet QA. Additive shape fields preserve prior project documents.

## 5. Text and typography

- [x] Native text measurement, line-breaking, overflow detection, fit-to-box, fit-to-line-count, and automatic box sizing. Evidence: [shared text layout contract](TEXT.md), complete-word/grapheme and fitting tests, native contact-sheet inspection, CLI/MCP measurement and Studio authoring/reload coverage. The documented correction removes silent max-line truncation.
- [ ] Minimum/maximum font sizes, baseline alignment, cap-height alignment, and optical alignment.
- [ ] Language-aware wrapping, automatic direction detection, RTL, and bidirectional text.
- [ ] Word, character, line, and glyph reveals and animation.
- [ ] Text-on-path, per-word styling, per-character styling, and current-word highlighting.
- [ ] Whole-block and per-line backgrounds with padding and independent radius.
- [ ] Text stroke, multiple shadows, inner shadow, gradient fill, image/video fill, masks, and deformation.
- [ ] Variable-font axes, fallback stacks, font preview, hover preview, missing-glyph validation, substitution warnings, and licensing metadata.
- [ ] Rough underline, circle, highlight, and strike-through notation.
- [ ] Rounded text-box primitives, animated emoji assets, font collections, and project-local font packages.

## 6. Visual and media layers

- [ ] Solid, gradient, image, video, audio, GIF, animated WebP, animated AVIF, image-sequence, sprite-sheet, caption, adjustment, null/control, camera, guide, matte, procedural-texture, waveform, and spectrum layers.
- [ ] Local file sequences and exact-frame video decoding.
- [ ] Content-addressed frame caches, proxies, relinking, global replacement, and source-to-proxy switching.
- [ ] Media conforming, rotation-metadata handling, variable-frame-rate normalization, alpha video, and ProRes decoding.
- [ ] HDR and color-profile detection, source color-space conversion, and tone mapping.
- [ ] Source cropping, ratio-based crop values, direct crop mode, fit/fill/contain/stretch, pan-and-scan, and Ken Burns controls.
- [ ] Whole-layer and per-corner radius, borders, outlines, and inner borders.
- [ ] Constant and ramped playback rate, reverse playback, freeze frame, frame hold, and poster-frame selection.
- [ ] Source audio, audio detachment, pitch-preserving speed, optional pitch shift, and media metadata inspection for dimensions, FPS, codec, duration, and color space.

## 7. Audio

- [ ] Multiple audio tracks, video source audio, source extraction, and audio-only compositions.
- [ ] Stereo waveform pyramids for audio and video at every timeline zoom level.
- [ ] Spectrum, oscilloscope, frequency bands, beat, transient, silence detection, and silence markers.
- [ ] Trimming, splitting, looping, reversing, playback rate, pitch-preserving stretch, and pitch shifting.
- [ ] Decibel gain, volume envelopes, timeline automation, fade handles, crossfades, and equal-power crossfades.
- [ ] Constant-power pan, stereo balance, track mute, solo, and lock.
- [x] Voice-aware ducking with configurable attack and release. Evidence: [shared audio graph](AUDIO.md), decoded PCM measurements of music attenuation and recovery after speech, full-duration tail preservation, and Studio project-control persistence.
- [x] Noise gate, compressor, limiter, parametric EQ, high-pass, and low-pass filters. Evidence: [typed native audio rack](AUDIO.md), decoded PCM frequency/dynamics checks, all four video and audio output formats, CLI/MCP/SDK access, and Studio reorder/bypass/remove/processed-preview coverage.
- [x] Loudness, true-peak, and LUFS measurement, optional normalization, and clipping warnings. Evidence: [two-pass audio delivery contract](AUDIO.md), measured PCM/AAC output, silence and clipping tests, shared CLI/MCP/SDK analysis, and Studio target/measurement persistence coverage. Normalization is opt-in for existing documents.
- [x] Music, voice, SFX, and source stem rendering plus embedded audio metadata. Evidence: [pre-master stem contract](AUDIO.md), sample-level four-stem reconstruction with voice ducking, float PCM/duration/tag verification, CLI/MCP/SDK stem selection, and Studio download coverage.
- [ ] Frozen searchable SFX library with intent, license, attribution, and peak-normalization metadata.

## 8. Captions and subtitles

- [x] SRT, WebVTT, and timed-JSON import/export.
- [ ] Word/token timing and correction, caption pages, page duration, forced breaks, speakers, and speaker styles.
- [ ] Current-word and karaoke highlighting, line/character limits, and safe-area validation.
- [ ] Burned-in, sidecar, and embedded subtitle delivery.
- [ ] Caption preview, search, replacement, global style presets, and per-caption overrides.
- [ ] Caption backgrounds, outlines, shadows, entry/exit animation, RTL, and multiple language tracks.
- [x] Provider-neutral adapters for importing locally generated transcripts.

## 9. Effects stack

- [ ] Ordered, reorderable, toggleable, copyable, animatable multipass effects on layers, groups, compositions, and adjustment layers.
- [ ] Color: brightness, contrast, combined correction, chroma key, duotone, exposure, grayscale, hue, invert, levels, saturation, shadows/highlights, tint, white balance, vibrance, gradients, gradient tint/map, thermal vision, curves, channel mixer, selective color, LUTs, color wheels, lift/gamma/gain, and posterization.
- [ ] Blur/shadow: Gaussian, directional, box, zoom, radial, linear/radial progressive, region and background blur; drop/inner shadow, glow, bloom, outline, light trails, and depth-aware blur when depth exists.
- [ ] Reveal/matte: evolve, blinds, linear/radial/clock/iris/shape/path/gradient/noise reveals; alpha/luma/inverted mattes; feathered multi-mask add/subtract/intersect/exclude; animated paths, expansion, blur, and track mattes.
- [ ] Transform/distort: mirror, scale, tile, UV/pixel translate, barrel distortion, chromatic aberration, fisheye, corner pin, perspective, wave, skew, twirl, bulge/pinch, displacement, turbulence, lens correction, and rolling shutter.
- [ ] Stylize: burlap, emboss, dot grid, halftone, grain, noise displacement, paper, rough edges, patterns, pixel dissolve, pixelation, progressive pixelation, scanlines, speckle, shine, shrink-wrap, vignette, film damage, dither, threshold, edge detection, posterize-time, CRT, VHS, glitch, mosaic, and kaleidoscope.
- [ ] Generate: contour/liquid-contour fields, checkerboard, flannel, halftone gradients, gridlines, white noise, TV signal, lines, rings, waves, zigzags, light leaks, starbursts, fractals, procedural/mesh gradients, Voronoi, Perlin/simplex fields, particles, dust, rain, snow, sparks, bokeh, and lens flares.
- [ ] Original native custom-effect SDK using safe declarative kernels or vetted native/WGPU plugins, never arbitrary project code.

## 10. Transitions

- [x] Separate transition timing from visual presentation.
- [x] Linear, Bezier, and spring timing.
- [ ] Crossfade, directional slide, push, wipe, clock, iris, flip, cube, door, zoom, blur, shape, path, luma, displacement, glitch, film-burn, match-cut, matched-transform, shared-element, and camera-handoff transitions.
- [ ] Transition overlays using compositions, effects, light leaks, and adjustment layers.
- [ ] Transition audio and equal-power audio crossfades.
- [ ] Duration handles, searchable library, thumbnails, drag-to-boundary authoring, reversal, presets, and one-sided/symmetric/asymmetric modes.
- [ ] Boundary continuity and transition/inner-animation ownership validation.

## 11. Studio canvas editing

- [ ] Canvas multi-select, marquee, shift selection, and cycling through overlaps.
- [ ] Multi-layer move, resize, rotate, align, distribute, equal-space, and equal-size operations.
- [ ] Rotation and transform-origin handles with translation compensation, axis lock, aspect lock/override, center scaling, and custom pivots.
- [ ] Bring forward/backward/front/back and direct opacity, radius, and crop editing.
- [ ] Eight-handle crop mode with dimmed uncropped source and temporary negative crop while repositioning.
- [ ] Object, anchor, baseline, center, edge, guide, ruler, pixel-grid, and configurable-grid snapping.
- [ ] Social, title, action, and platform-specific safe-zone overlays.
- [ ] Gesture and keyboard zoom, fit view, 100% view, pan, fullscreen, and onion skinning.
- [ ] Visible motion paths, canvas-created keyframes, effect control points, corner-pin handles, mask paths, gradient/light handles, camera frustums, and 3D gizmos.

## 12. Studio timeline editing

- [ ] Hierarchical expandable rows for compositions, groups, effects, transforms, and track groups.
- [ ] Marquee and modifier multi-selection for layers, effects, and keyframes.
- [ ] Multi-item dragging with frame, beat, marker, playhead, edge, and transition snapping.
- [ ] Edge auto-scroll, follow-playhead, zoom controls/gestures, and resizable timeline.
- [ ] Filmstrips, video/audio waveforms, volume automation, and fade curves.
- [ ] Split/blade, ripple delete/insert, rolling, slip, slide, and rate-stretch edits.
- [ ] Linked/unlinked audio-video, compound clips, and nested sequences.
- [ ] Lock, hide, mute, solo, and shy controls.
- [ ] Timeline, scene, comment, and beat markers; named ranges; in/out points; and range looping.
- [ ] Cut/copy/paste/duplicate for layers, keyframes, effects, and easing, including paste-at-playhead and relative timing.
- [ ] Frame and interval keyboard nudging, timecode entry, go-to-frame/time, and selection-duration display.
- [ ] Track-height modes and virtualized smooth navigation for thousands of layers.

## 13. Curve and keyframe editor

- [ ] Dope sheet, value graph, speed graph, and multi-property overlays.
- [ ] Custom broken/unified Bezier handles plus linear, Bezier, hold, and spring keyframes.
- [ ] Interpolation conversion, presets, reversal, influence controls, copy/paste, alignment, distribution, and temporal reversal.
- [ ] Scale/retime/quantize selected keyframes and snap them to beats.
- [ ] Labels, colors, property search, animated-only filtering, and modified-only filtering.
- [ ] Auto-keyframe and manual modes, conflict warnings, overshoot/settling visualization, units, and frame/seconds display.

## 14. Assets and project management

- [ ] Project switcher, folders, search, quick switcher, recents, pins, templates, duplication, archives, and portable import/export packages.
- [ ] Content-addressed assets with upload/download progress, canvas/timeline drop, clipboard paste, type detection, and automatic duration.
- [ ] Thumbnails, metadata, tags, collections, favorites, usage counts, find-uses, global replacement, unused deletion, duplicate detection, and relinking.
- [ ] Local asset, proxy, and preview caches with limits, cleanup, diagnostics, and checksum verification.
- [ ] Font, SFX, effect, transition, motion, component, and example browsers.
- [ ] External declarative libraries, project-local libraries, versioned manifests, compatibility checks, licenses, and provenance.

## 15. Preview, review, and embeddable Player

- [ ] Embeddable Player and thumbnail renderer with vanilla JavaScript, Web Component, and framework wrappers.
- [ ] Play, pause, frame seek, time seek, rate, volume, mute, loop, fullscreen, and custom controls.
- [ ] Current-frame, time, end, error, buffering, waiting, and resume events.
- [ ] Live parameter and composition-variant updates.
- [ ] Media keys, keyboard controls, autoplay handling, preloading, premounting, buffering, and flicker prevention.
- [ ] Poster images, responsive sizing, letterbox, fit/fill, transparent preview, and reduced-motion preview.
- [ ] Timestamped annotations, review comments, read-only/password-protected review links, side-by-side comparison, frame diff, and A/B renders.
- [ ] Local-first telemetry hooks with no default data transmission.

## 16. Rendering and output

- [ ] Complete, selected-range, multi-range, scene, group, still, image-sequence, video-only, audio-only, and transparent rendering.
- [ ] File and memory outputs with frame, progress, per-frame timing, concurrency, and diagnostic callbacks.
- [ ] Cancellation, pause/resume, persistent jobs, interrupted-render recovery, and partial-output cleanup.
- [ ] Frame, static-layer, effect, and nested-composition cache reuse plus dirty-frame incremental rendering.
- [ ] Deterministic manifests and artifact hashes.
- [ ] H.264, H.265, VP8, VP9, AV1, ProRes, alpha ProRes, alpha WebM, GIF, animated WebP, PNG, JPEG, WebP, AVIF, WAV, MP3, AAC, FLAC, Opus, PNG sequences, and EXR sequences.
- [ ] Pixel-format, color-space, HDR, SDR tone-map, CRF, bitrate, two-pass, and metadata controls.
- [ ] NVENC, Quick Sync, AMF, VideoToolbox, and VAAPI hardware paths with software fallback.
- [ ] Fast-start MP4, chapters, embedded subtitles, stream selection, multiple audio streams, and stems.
- [ ] Checksums and verification of duration, resolution, codec, audio, corruption, black frames, frozen frames, blank boundaries, loudness, and safe areas.
- [ ] Automatic contact sheets, transition-boundary sheets, per-scene QA, benchmarks, and machine-capability reports.

## 17. Provider-neutral distributed rendering

- [ ] Coordinator for local, LAN, VPS, container, and cloud workers.
- [ ] Worker capability negotiation and CPU/GPU/architecture-aware scheduling.
- [ ] Frame-range, scene, and encoding-chunk sharding plus separate audio workers and parallel asset preparation.
- [ ] Content-addressed frozen project bundles and dependency manifests.
- [ ] Filesystem, S3-compatible, Cloudflare R2, MinIO, Google Cloud Storage, and Azure Blob adapters.
- [ ] Signed uploads, checksums, idempotent artifacts/retries, retry budgets, heartbeats, health checks, leases, stale-job recovery, and backpressure.
- [ ] Priorities, user/project quotas, cancellation propagation, SSE progress, webhooks, resumable jobs, and failed-shard rerendering.
- [ ] Deterministic stitching, distributed muxing, lifecycle cleanup, cost estimates, autoscaling hooks, Docker, Kubernetes, and self-hosted-runner documentation.
- [ ] TypeScript, Python, Go, and Rust render API clients.

## 18. Native 3D

- [ ] Optional native WGPU renderer with glTF, GLB, and OBJ import.
- [ ] PBR materials, environment maps, material parameters, mesh transforms/animation, skeletal animation, and morph targets.
- [ ] Perspective and orthographic cameras, focal length, focus distance, depth of field, and motion blur.
- [ ] Directional, point, spot, area, and ambient lighting with soft shadows and reflection probes.
- [ ] Image/video/exact-frame textures, render-to-texture, 3D text, and path extrusion.
- [ ] Depth-aware 2D/3D compositing, 2D layers in 3D space, and camera/object/property tracks.
- [ ] Look-at targets, orbit controls, transform gizmos, material/light/camera inspectors, and camera preview.
- [ ] Color, depth, normal, and object-ID passes plus GPU capability fallback.

## 19. Deterministic animation-format importers

- [ ] Lottie import with dimensions, duration, speed, forward/reverse playback, supported-feature compilation, and unsupported-feature baking.
- [ ] Explicit Lottie expression diagnostics and rejection of nondeterministic evaluation.
- [ ] Rive import, animation selection, deterministic state snapshots, compilation, and baking.
- [ ] GIF, animated WebP, deterministic SVG animation, After Effects markers, Bodymovin metadata, Figma vectors, and declarative motion libraries.
- [ ] Import reports identifying compiled, baked, unsupported, and rejected content.

## 20. Capture and conversion utilities

- [ ] Local screen, window, region, camera, microphone, and supported system-audio recording.
- [ ] Recording countdown, pause/resume, and optional local webcam-background preprocessing.
- [ ] Canvas capture as a frozen source asset, never as a render model.
- [ ] Immediate asset freezing, trim, proxy generation, format conversion, audio/frame/thumbnail/caption extraction, repair, normalization, rotation correction, and VFR-to-CFR conversion.

## 21. Agent and developer tooling

- [ ] Full MCP, CLI, and SDK parity for every Studio and renderer operation.
- [ ] Schema/capability discovery, current-error retrieval, precise validation locations, and safe repair suggestions.
- [ ] Revision-safe transactional patches, dry runs, previews, conflicts, and three-way reconciliation.
- [ ] Native frame/contact-sheet responses, evaluated timeline inspection, dependency inspection, asset usage, render inspection, and cancellation.
- [ ] Agent-visible selection, viewport, timeline range, markers, and comments.
- [ ] Durable requests, resumable sessions, multiple hosts, bounded retries, provider-failure visibility, and project-scoped permissions.
- [ ] Agent action history, undoable agent transactions, and change summaries.
- [ ] Agent-authored parameter schemas, components, effect stacks, 3D scenes, and local capture requests.
- [ ] Extension manifests, safe declarative registration, schema migrations, codemods, structured diagnostics, and JSON output everywhere.
- [ ] Shell completions, Creative IR language server, generated JSON Schema, YAML completion, editor diagnostics, and schema-derived examples.

## 22. Studio reliability and UX

- [ ] Feature flags for experimental work, autosave, explicit save, and saved/offline/conflict status.
- [ ] Undo/redo with coalesced continuous edits, persistent history, named checkpoints, revision comparison, and restoration.
- [ ] Crash recovery, atomic writes, corrupt-project recovery, and automatic backups.
- [ ] Keyboard-first and screen-reader-accessible navigation, focus restoration, high contrast, reduced motion, touch, and narrow-screen layouts.
- [ ] Responsive inspectors, command palette, custom shortcuts, context menus, persistent panels/workspaces, and selection restoration.
- [ ] Error overlays with navigation plus isolated frame, effect, and asset failures.
- [ ] Render logs, diagnostic bundles, update channels, retention settings, cache dashboard, and background-job dashboard.

## 23. Public ecosystem

- [ ] Production examples for launch films, product demos, data/music visualization, captions, 3D, social, long-form, multilingual, batch personalization, transparent overlays, broadcast graphics, lower thirds, transitions, effects, motion paths, component libraries, and distributed rendering.
- [ ] Every example must include editable source, frozen assets, provenance, strict validation, CI rendering, visual regression snapshots, and a downloadable package.
- [ ] Searchable component, effect, transition, motion, SFX, and template catalogs.
- [ ] Declarative third-party catalogs, community contribution format, compatibility testing, template versioning, and preview gallery.

## 24. Testing and production gates

- [ ] Schema, migration, deterministic rendering, and cross-platform pixel tests.
- [ ] Golden tests for effects, paths, morphing, nested time, loop, freeze, audio sync, captions, video decode, and CPU/GPU parity.
- [ ] Distributed stitching, retries, idempotency, cancellation, corruption, missing asset/font, path escape, symlink, and junction tests.
- [ ] Large-project, thousand-layer, long-duration, high-FPS, 4K, 8K, alpha, and HDR tests.
- [ ] Accessibility, keyboard, touch, Studio/Player browser compatibility, installer, upgrade, and package-integrity tests.
- [ ] Historical speed, memory, and output-size benchmarks with regression gates.
- [ ] Visual and transition-boundary regression gates plus a public compatibility matrix.

## 25. Production intent, storyboards, and reusable direction

Refines §§2, 14, 15, 21, 23. Evidence: audit H01–H04. These are authoring workflows; they do not introduce a second render timeline.

- [x] **GM-001** Persist a versioned production brief with destination, aspect, language, audience, message, duration, source requirements, and user-stated versus inferred decisions; resume it without repeating resolved intake. Evidence: [production brief contract](PRODUCTION-BRIEF.md), bounded schema/provenance, revision and native-output invariance tests, CLI/MCP round trips, resumed agent context and Studio persistence coverage.
- [ ] **GM-002** Route product films, explainers, existing-footage edits, captions, music-driven films, short motion units, and presentations through maintained workflows with explicit inputs, outputs, and capability requirements.
- [ ] **GM-003** Track resumable production stages and dependencies from source collection through planning, authoring, verification, and delivery; invalidate only affected stages when the brief or assets change.
- [ ] **GM-004** Provide a storyboard with stable shot IDs, sketches/references, visual direction, narration, source evidence, planned duration, and separate build and review states; link built shots to real IR scene/layer IDs.
- [ ] **GM-005** Support shot-level comments, resolved feedback, and navigation from storyboard to native preview; bind review decisions to a revision so a later change cannot inherit stale approval.
- [ ] **GM-006** Import a versioned brand/design specification with exact palette/font bindings, provenance, immutable identity requirements, medium-specific recommendations, and a drift report across scenes and variants.
- [ ] **GM-007** Store inspectable project and personal creative preferences with source/confirmation history, explicit overrides and removal; inferred one-off choices must not silently become personal defaults.
- [ ] **GM-008** Freeze approved workflows as versioned reusable bundles of brief structure, brand bindings, storyboard skeleton, parameters, assets and acceptance checks; reopen them with migration and missing-dependency diagnostics.

## 26. Evidence capture, design ingestion, and media preparation

Refines §§6, 8, 14, 19, 20. Evidence: audit H05–H08. Network access and model execution belong to explicit acquisition/preparation jobs; accepted render assets stay local.

- [ ] **GM-009** Capture a website or real product session into frozen screenshots/footage, text, source URLs, viewport/time metadata and a contact sheet; distinguish real evidence from subsequently reconstructed graphics.
- [ ] **GM-010** Extract candidate brand tokens, fonts, logos, media and source motion observations into an inspectable import manifest; report ambiguous identity and missing rights/provenance rather than silently substituting assets.
- [ ] **GM-011** Bound each capture phase by time, concurrency and output size; report partial/degraded completion, navigation status, skipped assets and reasons so an incomplete capture cannot look complete.
- [ ] **GM-012** Import Figma/design-tool exports as editable native layers where supported and frozen artwork otherwise; preserve source identities/tokens and emit compiled, flattened, unsupported and fidelity-loss reports.
- [ ] **GM-013** Provide a provider-neutral resolve/search/import/generate interface for images, icons, music, SFX and voice, plus source-verified logo acquisition; record the chosen source, license, prompt/intent, settings, tool/model identity, job state and local content hash, and distinguish generated media from captured evidence.
- [ ] **GM-014** Maintain a project media ledger and optional cross-project content-addressed cache with usage, derivation chains, relocation, deduplication and invalidation; a portable project must include its required files without relying on a personal cache.
- [ ] **GM-015** Run reversible preparation jobs for trim, crop, conform, proxy, pitch-preserved constant-rate retiming, baked ramps/freezes and format conversion; preserve originals and source-to-derived time maps.
- [ ] **GM-016** Offer optional local/provider-neutral transcription with language/model selection, timed words, confidence/correction review and provenance; convert accepted results into existing caption IR and invalidate timings when the source changes.
- [ ] **GM-017** Offer optional subject segmentation/matting preparation for images and video with foreground and inverse-alpha outputs, transparent PNG/WebM/ProRes handoff, edge/temporal QA and frozen model settings; do not describe an inverse matte as an inpainted background.

## 27. Discoverable native content and component packages

Refines §§1, 4, 14, 23. Evidence: audit H09–H10 and the complete registry inventory. Named upstream assets are coverage references, not source to embed in the renderer.

- [ ] **GM-018** Package native components, compositions, effects and workflow examples with typed parameters, dependency manifests, previews, compatibility versions, licenses and provenance; install dependencies transactionally inside the project.
- [ ] **GM-019** Add local semantic catalog search alongside keyword/tag search with explicit answering tier, model/index version, offline status and scores; pin optional model downloads and keep query text local by default.
- [ ] **GM-020** Detect and report index/registry skew in both directions, unavailable results and unindexed items; refresh safely and explain degraded ranking rather than returning misleading empty results.
- [ ] **GM-021** Return a focused capability description with parameter ranges, animation support, example native payload, cost and unsupported conditions before applying a catalog item; keep direct IR authoring available.
- [ ] **GM-022** Provide deterministic family/tag installation, update/diff/rollback, dependency conflicts, schema migrations and removal guarded by usage; include a per-item native-frame smoke check.
- [ ] **GM-023** Maintain local search-miss and content-quality records that users can inspect or delete; any external report must be a separate explicit action, not background telemetry.
- [ ] **GM-024** Build native parameterized families for charts, ranked/racing data, maps/routes/markers, diagrams, code explainers, device/product framing, lower thirds, logo/title units and editorial overlays; retain source data and validate labels/readability.
- [ ] **GM-025** Build reusable caption/lyric identities with semantic emphasis, word timing, regional safe areas, language/font coverage and preview examples; audit every inventoried registry family for native coverage or a recorded intentional exclusion.

## 28. Audio processing, analysis, and music-driven authoring

Refines §§3, 7, 8, 12, 16. Evidence: audit H11–H15. Preview and export must implement one declared signal-flow contract.

- [ ] **GM-026** Add a versioned ordered audio-effect rack with stable effect IDs, enabled state, duplication, copy/paste, presets, validated units/ranges and discoverable automation support.
- [ ] **GM-027** Support editable gain, high/low-pass, peaking/shelf EQ, compressor, limiter, gate, saturation, delay, reverb, chorus, phaser and bitcrush primitives through native/offline DSP or deterministic frozen processing; reject unsupported parameter combinations.
- [ ] **GM-028** Add volume/effect automation lanes with time units, interpolation, reset rules and source/clip/bus time mapping; expose the same values through Studio, CLI, MCP and SDK.
- [ ] **GM-029** Model effect latency, preroll, tails and duration explicitly; preserve reverb/delay endings and validate preview/export parity at trims, loops, seeks and transitions.
- [ ] **GM-030** Add audio submix buses whose effects process summed members, with stable membership, routing validation, group mute and automation; explicitly version any distinction between preview audition solo and output solo.
- [ ] **GM-031** Analyze a voice/music pair or voice bus to propose dynamic spectral carving and gain envelopes with source measurements, editable strength and inspectable analysis metadata.
- [ ] **GM-032** Tag generated carve effects and automation by ownership; recomputation replaces only those edits, preserves manual processing, handles changed group membership and detects stale source analysis.
- [ ] **GM-033** Provide source and mix diagnostics for clipping, level imbalance, noise, silence, peaks and loudness; proposed levelling/repair must be reviewable and report measurement limitations.
- [ ] **GM-034** Add intent-oriented audio repair presets/jobs with reversible parameter changes, before/after audition and measured acceptance; retain the original recording and avoid treating a preset name as quality proof.
- [ ] **GM-035** Persist beat/onset/strength, phrase/energy and silence analysis against a source hash and time map; support manual correction and confidence/uncertainty instead of forcing every source onto a beat grid.
- [ ] **GM-036** Bind native animation and cut landmarks to frozen audio feature tracks through safe declarative mappings with smoothing, range/clamp, latency and deterministic random-seek behavior.
- [ ] **GM-037** Build music/lyric-driven workflows that select a real source range, plan around phrases and endings, expose beat markers, preserve verified lyrics and test readable holds against the actual soundtrack.

## 29. Source-aware color and media treatment

Refines §§6, 9, 10, 15, 18. Evidence: audit H16–H20. Existing effect families remain the owner; these entries specify missing contracts and authoring workflows.

- [ ] **GM-038** Introduce a versioned native grading payload with primary correction, tonal wheels, master/RGB curves, hue-versus-hue/saturation/luma curves, keyed secondaries, enabled state and explicit working color space.
- [ ] **GM-039** Import and validate local LUTs with dimensions/domain/interpolation/intensity, hashes and color-space expectations; preview the same grade and parameter order used for export.
- [ ] **GM-040** Analyze representative source frames for luminance/chroma/saturation, clipping risk and color metadata; emit evidence plus a conservative suggested patch with dry-run/apply/clear and unsupported-log/HDR diagnostics.
- [ ] **GM-041** Add parameterized native print/art treatments: two-ink print, ordered dithering, mono-screen patterns, ASCII glyph rendering, engraving, crosshatching and edge-preserving painterly filtering; retain readability controls and seek determinism.
- [ ] **GM-042** Add source-driven tape tracking/chroma bleed, film artifacts, scanline/CRT, channel-separation and digital-tear/block treatments with explicit spatial/temporal parameters and seeds.
- [ ] **GM-043** Make treatment animation support explicit per parameter; implement declared blur/pixelation/bloom/grain/reveal controls without hidden wall-clock state, and reject animation on unsupported controls.
- [ ] **GM-044** Compare original and candidate grades, LUTs or composition variants at identical source/timeline times in labeled sheets or interactive views; retain exact settings and report failed/truncated candidates.
- [ ] **GM-045** Compose original plate, foreground matte and regional treatment as editable native layers/masks with feather and alpha semantics; keep source time mapping identical across the stack and support later tracked-matte inputs.
- [ ] **GM-046** Publish per-effect support and cost metadata for backend, precision, alpha, HDR, sampling and memory; surface incompatible stacks before rendering and offer explicit reduced-quality previews without changing the accepted master.

## 30. Semantic editing SDK and agent evidence

Refines §§1, 2, 11, 13, 21, 22. Evidence: audit H21–H25. Genmotion already has JSON patches and revision checks; this is the higher-level shared editing layer.

- [ ] **GM-047** Provide a headless editing session over Creative IR with typed query, text/style/property/timing/asset/track operations, disposal and memory/filesystem/host persistence adapters; use it from Studio and agent tools.
- [ ] **GM-048** Address nested targets by stable composition-instance/layer identity rather than array position alone; detect stale or ambiguous targets and expose dependency/usage paths before mutation.
- [ ] **GM-049** Expose a pure capability/refusal query for an intended operation on the current target, including locks, inheritance, unsupported imported content and required materialization; derive relevant Studio controls from it.
- [ ] **GM-050** Make a multi-operation edit one validated transaction, one persist event and one undo step; provide inverse patches, rollback on failure, change-origin metadata and event subscriptions.
- [ ] **GM-051** Coalesce continuous gestures by target/property without merging unrelated edits; support host-owned history, persistence failure/retry and reopenable checkpoints through the same session.
- [ ] **GM-052** Store versioned sparse overrides on reusable base compositions with scoped nested IDs, explicit removal markers, parameter/asset overrides and base-update conflict/orphan diagnostics.
- [ ] **GM-053** Expose a bounded live scene/context view with playhead, selection, instance path, viewport, editability, revision and undo state; let tools select/seek the same targets the human is editing.
- [ ] **GM-054** Offer a capability-negotiated in-Studio agent bridge where supported, using the same semantic service as local MCP; require source-safe handles and session permissions rather than broad browser scripting.
- [ ] **GM-055** Return structured edit receipts distinguishing refused, dispatched, saved, verified and failed states, with a separate changed flag, before/after revision, affected targets and available readback/frame evidence.
- [ ] **GM-056** Record canvas gestures into native keyframes with timestamped samples, endpoint-preserving smoothing/reduction, preview before acceptance and one reversible edit; later agent edits must retain user-authored trajectories unless targeted.

## 31. Time-aware visual diagnostics and acceptance assertions

Refines §§3, 5, 8, 13, 15, 16, 21, 24. Evidence: audit H26–H29. Static schema validation remains necessary but cannot establish visual quality.

- [ ] **GM-057** Produce one structured check report spanning schema, assets, evaluated layout, media readiness, contrast, motion assertions and output contract, with explicit severity, sampled coverage and incomplete-check status.
- [ ] **GM-058** Sample scene/track/transition boundaries and interior times, distinguish persistent defects from intentional transient entrance/exit states, and report omitted timestamps when a sampling budget truncates coverage.
- [ ] **GM-059** Anchor findings to stable native targets, instance paths, source revision, frame/time and bounding boxes; include annotated frames and focused crops so agents can inspect the reported defect.
- [ ] **GM-060** Detect evaluated text overflow, occlusion, off-canvas content and reserved caption/safe-area collisions through hierarchy, transforms and masks; allow scoped intentional exceptions with reasons.
- [ ] **GM-061** Measure contrast against the rendered/composited background at relevant times, distinguish unreadable text from decorative shapes, and expose assumptions/limits for complex media backgrounds.
- [ ] **GM-062** Add declarative acceptance assertions for appearance deadlines, ordering, frame containment, readable holds and maximum unintended static intervals; bind them to stable layer IDs and evaluated native output.
- [ ] **GM-063** Version assertion schemas, reject missing/ambiguous targets, test false positives, and support intentional stillness/reduced motion; heuristic checks must not present themselves as exhaustive aesthetic approval.
- [ ] **GM-064** Report composed world-space trajectories, local/global clocks, ancestor contributions, keyframe segments and discontinuities; visualize conflicts between host transitions, child motion and camera handoffs.
- [ ] **GM-065** Support multi-stroke path/gesture diagnostics that distinguish drawn motion from jumps, retiming comparisons and before/after overlays; preserve semantic anchors when repairing timing.
- [ ] **GM-066** Maintain a revision-bound review artifact containing the check report, representative frames, compared variants, audio findings and unresolved decisions; invalidate affected evidence after edits.

## 32. Embedded preview, presentations, and accessible editing

Refines §§1, 12, 15, 22. Evidence: audit H30–H32. Interactive playback metadata must resolve to declared native scene/timing data.

- [ ] **GM-067** Ship a framework-neutral embeddable Player/thumbnail API for native preview transport with play/pause/seek/rate/volume/loop controls, responsive sizing and stable events; do not create a second browser scene renderer.
- [ ] **GM-068** Define readiness, buffering, cancellation, stale-frame rejection, parameter changes and audio synchronization across embedded and Studio playback; test seek storms and slow preview delivery.
- [ ] **GM-069** Provide portable review bundles/links with source revision, frozen assets or verified media, timestamps and comments; apply explicit access control for shared services and keep local review usable offline.
- [ ] **GM-070** Add a presentation manifest for ordered scenes, fragment hold points, branches, hotspots and speaker notes, validated against stable IR identities with missing-target/cycle diagnostics.
- [ ] **GM-071** Provide synchronized presenter and audience views with keyboard navigation, fragment/branch return behavior and persistent notes; preview every supported route without changing the source timeline implicitly.
- [ ] **GM-072** Define deterministic video export of an interactive project through an explicit route and timing policy; report unreachable scenes, unresolved waits and unsupported interactions before rendering.
- [ ] **GM-073** Make large timelines accessible as a virtualized hierarchical control with stable logical focus, row/clip/keyframe announcements, keyboard selection/editing and focus restoration after scroll/collapse.

## 33. Delivery parity, batches, and render diagnostics

Refines §§2, 6, 16, 17, 24. Evidence: audit H29, H33–H35. These refine existing export/distribution items; native and provider-neutral guardrails remain mandatory.

- [ ] **GM-074** Validate alpha end to end through source decode, effects, transitions and PNG-sequence/WebM/ProRes output; test straight/premultiplied alpha and inspect against contrasting backgrounds.
- [ ] **GM-075** Define source/working/output color transforms and explicit SDR/PQ/HLG policies before claiming HDR; probe metadata, test mixed-media compositing and report unsupported effect/backend combinations.
- [ ] **GM-076** Publish an output compatibility matrix for codec/container/pixel format/alpha/color/audio/resolution/backend combinations; reject impossible combinations and make any fallback an explicit result.
- [ ] **GM-077** Generate a dry-run render plan with frozen dependency hashes, variant values, dimensions, FPS, selected ranges, color/audio contract, backend requirements and output identity.
- [ ] **GM-078** Support JSON/JSONL/CSV batch inputs with row-level validation, deterministic IDs/output names, concurrency limits, progress, isolated failure and selective retry without rerendering accepted rows.
- [ ] **GM-079** Reuse content-addressed project uploads and assets across render jobs and providers with integrity checks, deduplication, quotas and deterministic local dependency resolution.
- [ ] **GM-080** Implement provider-neutral plan/shard/assemble orchestration and backend adapters; include variable propagation, audio-tail handling, cancellation, retry/idempotency and local-versus-distributed seam tests.
- [ ] **GM-081** Gate preview/local/distributed parity with representative image/video/alpha/audio/effect fixtures, random seek order, declared pixel/audio tolerances and inspectable failed-frame artifacts.
- [ ] **GM-082** Track reproducible performance baselines by scene class, resolution, backend and hardware with frame-time distributions, memory, encode throughput and regression budgets; do not infer speed from renderer architecture.
- [x] **GM-083** Bound in-flight and completed native frames by count/bytes and encoder backpressure; expose queue/memory diagnostics and verify slow-frame/slow-encoder behavior at high resolution. Evidence: [rendering contract](RENDERING.md), `tests/frame-stream.test.ts` (including 4K buffers), `tests/render.test.ts`, `tests/asset-cache.test.ts`, and Studio API/browser export tests.
- [ ] **GM-084** Propagate cancellation, deadlines and errors through asset preparation, frame workers, encoding, audio DSP/mux and probing; own and reap every child process and remove partial artifacts at every stage.

## 34. Reproducible agent workflows and developer tooling

Refines §§14, 21, 22, 23, 24. Evidence: audit H35–H36 plus native integration needs identified in this audit.

- [ ] **GM-085** Record the runtime, schema, font, media, model-preparation and backend versions/hashes that define a render's reproducibility envelope; verify manifests on load and report mismatches.
- [ ] **GM-086** Generate focused capability documentation, examples and schemas from canonical contracts; detect drift between Studio controls, MCP/CLI/SDK support and bundled skills.
- [ ] **GM-087** Package small domain/workflow skills with explicit input/output contracts, lazy capability loading, resumable state and executable examples; do not require all knowledge in every agent turn.
- [ ] **GM-088** Check project/runtime/library version compatibility before upgrades; preserve pins, run migrations and representative validation, and provide rollback with a visible version/change report.
- [ ] **GM-089** Provide bounded machine-readable progress and diagnostic bundles with stage, target, time, error code and next action; distinguish process success, validated project, saved edit and verified output.
- [ ] **GM-090** Add executable cross-surface contract tests and documentation examples for every new family, including packaged installs and native golden output; inventory-only or Studio-only delivery does not satisfy completion.
- [ ] **GM-091** Publish original complete workflow examples for evidence-based product films, narrated/carved mixes, music/lyrics, data stories, editable overlays, brand variants and embedded reviews, including frozen inputs and review artifacts.

## 35. Agentic After Effects frontier

Strategic additions for advanced compositing. Refines sections 1, 3-6, 9, 16, 18-21 and 24. See the native roadmap acceptance scenarios; a full After Effects capability audit remains separate work.

- [ ] **AE-001** Provide point and planar tracking/stabilization with source-bound samples, confidence, lost-track diagnostics, correction ranges and native attachment to layers, nulls, masks and effect controls.
- [ ] **AE-002** Add temporally propagated object/person mattes with manual correction strokes, refinement, frozen ranges, feather/edge/spill controls and source-edit invalidation; keep accepted results as portable native masks or frozen matte assets.
- [ ] **AE-003** Support paint/clone/cleanup and temporally coherent clean-plate generation as reversible derived layers, with source/reference provenance, temporal QA and explicit distinction between real evidence and generated replacement pixels.
- [ ] **AE-004** Add mesh/pin deformation, influence/overlap controls, bind poses and reusable rigs with deterministic sampling, editable constraints and failure diagnostics.
- [ ] **AE-005** Build a native shape-operator stack with repeaters, offsets, trim/merge/boolean operations and per-character text selectors/animators; expose ordering and bounds rather than baking every variation into separate geometry.
- [ ] **AE-006** Add a sandboxed declarative relationship graph for property links, units, remapping, conditions and derived timing; prohibit arbitrary project code, detect cycles and show dependency/override explanations.
- [ ] **AE-007** Support layered design/animation interchange with stable identities and explicit fidelity/editability loss reports, starting with practical SVG and layered artwork handoff before proprietary project compatibility promises.
- [ ] **AE-008** Introduce professional working/display/output color management, higher-precision compositing, alpha interpretation and scene-linear workflows with reference transforms and cross-backend tolerances.
- [ ] **AE-009** Extend native 3D with solved camera/scene alignment, shadow-catching and depth/object-ID matte workflows so designed graphics can attach convincingly to real footage; record solve quality and frozen dependencies.
- [ ] **AE-010** Provide deterministic particles/simulations with explicit seeds, timestep/checkpoints, cached state, collision/force inputs and repeatable arbitrary-frame evaluation; distinguish simulation baking from final rendering.
- [ ] **AE-011** Translate creative requests into inspectable constraints and scoped semantic edit plans with alternatives, affected targets, preservation rules and native before/after evidence; retain human corrections through retries and regeneration.
- [ ] **AE-012** Establish production shot benchmarks for tracking, roto edges, deformation, cleanup, typography, motion blur, alpha, color and long compositions; publish measured limitations and failure artifacts before claiming compositor parity.

## Audit sources

This program specifies product capabilities and acceptance requirements. Implementation belongs to Genmotion's shared Creative IR, native evaluator and services. The `AE-*` frontier is separately labeled strategic work.

