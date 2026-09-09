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
- [x] Component parameters, defaults, constraints, validation, and per-instance overrides. Evidence: [PARAMETERS.md](PARAMETERS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [ ] Component-local coordinate systems, timelines, frame rates, dimensions, anchors, masks, and automatic scaling when embedded.
- [ ] Nested groups with transform, clipping, opacity, blend modes, effects, local timing, local anchors, and local masks.
- [x] Sequence-style time offsets, nested offsets, negative offsets, and sequential scene containers. Evidence: [composition time contract](COMPOSITIONS.md), ordered scene timeline evaluation, recursive instance-local `timeOffset`, deterministic negative-offset wrapping, nested parameter/time tests, and native frame evaluation through reusable definitions.
- [x] Automatic sequence and composition duration calculation. Evidence: [automatic duration contract](AUTOMATIC-DURATION.md), dependency-ordered nested composition resolution, finite layer/caption/instance boundaries, trims/rates/offsets/finite loops/freezes and padding, refusal of ambiguous unbounded content, parameter ownership validation, native timeline propagation and Studio/SDK/CLI/MCP tests.
- [ ] Trim-before, trim-after, premount, and postmount intervals.
- [x] Freeze a composition at a frame or only during a selected interval. Evidence: [shared source-time contract](COMPOSITIONS.md), native RGBA equality and interval-boundary checks in `tests/composition-parameters.test.ts`, timing tests, and Studio save/remove browser coverage. Optional fields preserve existing project documents.
- [x] Finite loops, infinite preview loops, nested loops, ping-pong loops, time remapping, playback-rate controls, and time stretching. Evidence: [composition time contract](COMPOSITIONS.md), finite/unbounded repeat and ping-pong traversal tests, negative and fractional `timeScale`, keyframed source-time remapping, nested native evaluation, endpoint holding, Studio authoring and schema validation.
- [x] Composition cycle detection, dependency graph, and usage search.
- [ ] Composition folders, multiple deliverables per project, still compositions, variants, duplication, presets, and named sequences.
- [ ] Hide supporting sequences from the timeline and expand or collapse nested compositions.
- [x] Render a selected composition, scene, group, or still. Evidence: [render selection contract](RENDER-SELECTION.md), composition/scene/group resolution with stable IDs, selected frame intervals and still output, transparent group isolation pixels, invalid/ambiguous selection refusal, render-plan identity, and SDK/CLI/MCP/Studio coverage.
- [ ] Import another Genmotion project as a frozen, versioned component dependency.

## 2. Parameters, data, and variants

- [x] Typed string, number, boolean, color, enum, file, asset, font, dimension, duration, object, array, and optional parameters. Evidence: [PARAMETERS.md](PARAMETERS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] Parameter defaults, constraints, descriptions, groups, presets, and generated Studio controls. Evidence: [PARAMETERS.md](PARAMETERS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] CLI, MCP, SDK, Player, and render-API parameter overrides. Evidence: [PARAMETERS.md](PARAMETERS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] Batch parameter matrices plus CSV- and JSON-driven variants. Evidence: [PARAMETERS.md](PARAMETERS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] Locale, brand, canvas-format, and platform-safe-area variants. Evidence: named typed configurations bind text locale/direction, project canvas dimensions, nested brand palette fields and caption safe-area geometry; destination schemas revalidate every resolved variant; JSON/CSV/matrix import/export and Player/render overrides share the same resolver; combined vertical Arabic safe-area acceptance coverage.
- [x] Deterministic derived parameters and preflight calculation of duration, dimensions, FPS, and output names. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).
- [x] Frozen local data sources, dependency hashes, and pre-render data validation. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).
- [x] Declarative parameter references in text, colors, assets, numeric tracks, effects, transitions, and component instances. Evidence: [typed binding contract](PARAMETERS.md), safe nested paths with destination revalidation, scene transition duration/presentation/overlay bindings, structured instance parameter propagation, immutable source preservation and one acceptance test spanning every named destination family.
- [x] Preview-time parameter editing, side-by-side comparison, named configurations, and configuration import/export. Evidence: Player/Studio live typed parameter editing and named variants, deterministic [native candidate comparison](../src/engine/variant-comparison.ts) with labeled PNG sheets and retained settings, JSON/CSV/matrix validation/import/export, failed/truncated candidate reporting and identical-time native-frame tests.

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
- [x] Shutter-based temporal sampling, motion blur, motion trails, directional light trails, per-layer/effect control, shutter angle, and quality-dependent sample counts. Evidence: [temporal sampling](TEMPORAL-SAMPLING.md), project/layer/effect sampling, deterministic premultiplied-alpha accumulation, source-over and directional screen trails, bounded combined plans, quality caps and native pixel tests.
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
- [x] Editable path nodes with smooth, symmetric, and corner modes plus direct Bezier handles. Evidence: [native path editing](VECTOR-PATHS.md), hash-bound SDK inspection/editing, stable semantic path-node transactions through CLI/MCP, direct Studio node/handle dragging and keyboard editing, curve splitting/removal, undo-safe persistence, native pixels and browser QA.
- [ ] Path, anchor, and shared-geometry snapping and constraints.
- [x] Native arcs, pies, callouts, arrows, stars, sparks, hearts, regular polygons, triangles, donuts, rings, spirals, waveform paths, line charts, and area charts. Evidence: [native primitive contract](VECTOR-PATHS.md), deterministic/boundary geometry and native contour/stroke pixels in `tests/primitives.test.ts`, Studio authoring tests, and native 15-primitive contact-sheet QA. Additive shape fields preserve prior project documents.

## 5. Text and typography

- [x] Native text measurement, line-breaking, overflow detection, fit-to-box, fit-to-line-count, and automatic box sizing. Evidence: [shared text layout contract](TEXT.md), complete-word/grapheme and fitting tests, native contact-sheet inspection, CLI/MCP measurement and Studio authoring/reload coverage. The documented correction removes silent max-line truncation.
- [x] Minimum/maximum font sizes, baseline alignment, cap-height alignment, and optical alignment. Evidence: [native text metric contract](TEXT.md), bounded-fit and invalid-range checks, explicit first-baseline assertions, cap-height/visible-ink measurements, optical ink-centering tests, shared preview/export layout, and Studio controls.
- [x] Language-aware wrapping, automatic direction detection, RTL, and bidirectional text. Evidence: [Unicode text contract](TEXT.md), frozen Unicode 17 first-strong/isolate handling, ICU locale segmentation, Thai dictionary-wrap checks, mixed Arabic/Latin native shaping pixels, per-line direction output, and Studio/CLI/MCP typed controls.
- [x] Word, character, line, and glyph reveals and animation. Evidence: [Unicode reveal contract](TEXT.md), word-spacing and paragraph-line assertions, grapheme-safe character/glyph tests covering combining and joined emoji sequences, animatable `revealProgress`, native drawing, motion recipes, and typed SDK/CLI/MCP authoring.
- [x] Text-on-path, per-word styling, per-character styling, and current-word highlighting. Evidence: [expressive native text](EXPRESSIVE-TEXT.md), grapheme-safe run painting, timed source-range emphasis, oriented/reversible SVG path layout, animated path reveal, strict overlap/bounds validation and deterministic native pixel tests.
- [x] Whole-block and per-line backgrounds with padding and independent radius. Evidence: [native text readability blocks](TEXT.md), schema defaults, whole-box and multiline native pixel assertions, shared preview/export rendering, SDK/CLI/MCP schema exposure and Studio save/reload coverage.
- [ ] Text stroke, multiple shadows, inner shadow, gradient fill, image/video fill, masks, and deformation. Native text now has a rounded outline pass; the existing gradient fill remains available. Multiple/inner shadows, media fills and deformation remain open.
- [ ] Variable-font axes, fallback stacks, font preview, hover preview, missing-glyph validation, substitution warnings, and licensing metadata.
- [x] Rough underline, circle, highlight, and strike-through notation. Evidence: [expressive native text](EXPRESSIVE-TEXT.md), stable semantic ranges, seeded geometry, shared native text metrics, animated draw progress and random-seek pixel tests.
- [ ] Rounded text-box primitives, animated emoji assets, font collections, and project-local font packages.

## 6. Visual and media layers

- [ ] Solid, gradient, image, video, audio, GIF, animated WebP, animated AVIF, image-sequence, sprite-sheet, caption, adjustment, null/control, camera, guide, matte, procedural-texture, waveform, and spectrum layers.
- [x] Local file sequences and exact-frame video decoding. Evidence: [image sequence contract](IMAGE-ANIMATION.md) and [render lifecycle](RENDERING.md), confined ordered local sequences up to 10000 frames, deterministic hold/repeat/ping-pong/reverse indexing, explicit source-frame tracks, exact prepared video-frame cadence, isolated clip generations, seek-boundary native pixels and source inventory/bundle validation.
- [ ] Content-addressed frame caches, proxies, relinking, global replacement, and source-to-proxy switching.
- [x] Media conforming, rotation-metadata handling, variable-frame-rate normalization, alpha video, and ProRes decoding. Evidence: [explicit media conforming](MEDIA-CONFORMING.md) and [source inspection](MEDIA-INSPECTION.md), display-rotation/SAR normalization, requested CFR derivatives, alpha-plane detection with explicit loss refusal, native FFmpeg ProRes input/output, full-decode verification, immutable source hashes, cancellation/cleanup and Studio/CLI/MCP dry-run/apply coverage.
- [x] HDR and color-profile detection, source color-space conversion, and tone mapping. Evidence: [explicit SDR preparation contract](MEDIA-CONFORMING.md), primaries/transfer/matrix/range and PQ/HLG detection, refusal of missing/unsupported declarations, float linear-light conversion, BT.2020/709 transforms, Hable/Mobius/Reinhard policy, HDR side-data removal, tagged-output/full-decode checks and typed Studio/CLI/MCP controls.
- [x] Source cropping, ratio-based crop values, direct crop mode, fit/fill/contain/stretch, pan-and-scan, and Ken Burns controls. Evidence: [native media geometry](MEDIA-GEOMETRY.md), pixel and normalized crops, animated crop bounds/tracks, strict source confinement, cover/contain/fill/stretch geometry, source-time pan-and-scan/Ken Burns evaluation, sprite-cell cropping and shared image/video Studio controls.
- [x] Whole-layer and per-corner radius, borders, outlines, and inner borders. Evidence: [MEDIA-GEOMETRY.md](MEDIA-GEOMETRY.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [ ] Constant and ramped playback rate, reverse playback, freeze frame, frame hold, and poster-frame selection.
- [ ] Source audio, audio detachment, pitch-preserving speed, optional pitch shift, and media metadata inspection for dimensions, FPS, codec, duration, and color space.

## 7. Audio

- [x] Multiple audio tracks, video source audio, source extraction, and audio-only compositions. Evidence: [native audio contract](AUDIO.md), deterministic multi-track/source-audio discovery and mixing, isolated source stems/extraction, explicit WAV/FLAC/AAC/Opus audio-only render service, silent output handling, processed preview and SDK/CLI/MCP/Studio tests.
- [x] Stereo waveform pyramids for audio and video at every timeline zoom level. Evidence: [source analysis contract](AUDIO-ANALYSIS.md), local audio/video first-stream decoding, independent left/right min/max/RMS bins, weighted power-of-two pyramid construction through full-source aggregation, partial-bin tests, bounded analysis and Studio timeline/API consumption.
- [x] Spectrum, oscilloscope, frequency bands, beat, transient, silence detection, and silence markers. Evidence: [source analysis contract](AUDIO-ANALYSIS.md), stereo waveform display data, calibrated Hann FFT and 24 logarithmic bands, anti-phase-safe energy combination, spectral-flux transients, confidence-bearing beat grid, stereo silence ranges, explicit marker import/time mapping and SDK/CLI/MCP/Studio tests.
- [ ] Trimming, splitting, looping, reversing, playback rate, pitch-preserving stretch, and pitch shifting.
- [ ] Decibel gain, volume envelopes, timeline automation, fade handles, crossfades, and equal-power crossfades.
- [x] Constant-power pan, stereo balance, track mute, solo, and lock. Evidence: [native audio track controls](AUDIO.md), bounded schema defaults, deterministic gain calculation and FFmpeg graph, mute/solo mix routing, Studio lock enforcement for edits/reorder/delete, shared SDK/CLI/MCP document access, and unit/browser/render coverage.
- [x] Voice-aware ducking with configurable attack and release. Evidence: [shared audio graph](AUDIO.md), decoded PCM measurements of music attenuation and recovery after speech, full-duration tail preservation, and Studio project-control persistence.
- [x] Noise gate, compressor, limiter, parametric EQ, high-pass, and low-pass filters. Evidence: [typed native audio rack](AUDIO.md), decoded PCM frequency/dynamics checks, all four video and audio output formats, CLI/MCP/SDK access, and Studio reorder/bypass/remove/processed-preview coverage.
- [x] Loudness, true-peak, and LUFS measurement, optional normalization, and clipping warnings. Evidence: [two-pass audio delivery contract](AUDIO.md), measured PCM/AAC output, silence and clipping tests, shared CLI/MCP/SDK analysis, and Studio target/measurement persistence coverage. Normalization is opt-in for existing documents.
- [x] Music, voice, SFX, and source stem rendering plus embedded audio metadata. Evidence: [pre-master stem contract](AUDIO.md), sample-level four-stem reconstruction with voice ducking, float PCM/duration/tag verification, CLI/MCP/SDK stem selection, and Studio download coverage.
- [ ] Frozen searchable SFX library with intent, license, attribution, and peak-normalization metadata.

## 8. Captions and subtitles

- [x] SRT, WebVTT, and timed-JSON import/export.
- [x] Word/token timing and correction, caption pages, page duration, forced breaks, speakers, and speaker styles. Evidence: [CAPTION-EDITING.md](CAPTION-EDITING.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] Current-word and karaoke highlighting, line/character limits, and safe-area validation. Evidence: timed native current-word and progressive karaoke pixel comparison, active-word color/plate rendering, resolved `maxLines`, Unicode character-bounded pagination, 5% safe-area diagnostics, combined acceptance coverage, and Studio caption controls.
- [x] Burned-in, sidecar, and embedded subtitle delivery. Evidence: [caption styling and delivery](CAPTION-DELIVERY.md), absolute-time multilingual track resolution, deterministic SRT/WebVTT artifacts, container-specific embedded-stream metadata and SDK/CLI/MCP/Studio API tests.
- [x] Caption preview, search, replacement, global style presets, and per-caption overrides. Evidence: existing page editor/search/literal replacement/cue override surfaces plus persistent named project presets with preset → speaker → cue precedence, missing-reference validation and shared native preview/export resolution.
- [x] Caption backgrounds, outlines, shadows, entry/exit animation, RTL, and multiple language tracks. Evidence: native caption compositor plus seek-safe fade/slide/scale/pop entrance and exit motion, BCP 47 tracks, default-track validation, explicit preview-language routing and multilingual delivery tests.
- [x] Provider-neutral adapters for importing locally generated transcripts.

## 9. Effects stack

- [x] Ordered, reorderable, toggleable, copyable, animatable multipass effects on layers, groups, compositions, and adjustment layers. Evidence: [VISUAL-EFFECTS.md](VISUAL-EFFECTS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [ ] Color: brightness, contrast, combined correction, chroma key, duotone, exposure, grayscale, hue, invert, levels, saturation, shadows/highlights, tint, white balance, vibrance, gradients, gradient tint/map, thermal vision, curves, channel mixer, selective color, LUTs, color wheels, lift/gamma/gain, and posterization.
- [ ] Blur/shadow: Gaussian, directional, box, zoom, radial, linear/radial progressive, region and background blur; drop/inner shadow, glow, bloom, outline, light trails, and depth-aware blur when depth exists.
- [ ] Reveal/matte: evolve, blinds, linear/radial/clock/iris/shape/path/gradient/noise reveals; alpha/luma/inverted mattes; feathered multi-mask add/subtract/intersect/exclude; animated paths, expansion, blur, and track mattes.
- [ ] Transform/distort: mirror, scale, tile, UV/pixel translate, barrel distortion, chromatic aberration, fisheye, corner pin, perspective, wave, skew, twirl, bulge/pinch, displacement, turbulence, lens correction, and rolling shutter.
- [ ] Stylize: burlap, emboss, dot grid, halftone, grain, noise displacement, paper, rough edges, patterns, pixel dissolve, pixelation, progressive pixelation, scanlines, speckle, shine, shrink-wrap, vignette, film damage, dither, threshold, edge detection, posterize-time, CRT, VHS, glitch, mosaic, and kaleidoscope.
- [ ] Generate: contour/liquid-contour fields, checkerboard, flannel, halftone gradients, gridlines, white noise, TV signal, lines, rings, waves, zigzags, light leaks, starbursts, fractals, procedural/mesh gradients, Voronoi, Perlin/simplex fields, particles, dust, rain, snow, sparks, bokeh, and lens flares.
- [x] Original native custom-effect SDK using safe declarative kernels or vetted native/WGPU plugins, never arbitrary project code. Evidence: [NATIVE-KERNELS.md](NATIVE-KERNELS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).

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
- [x] Gesture and keyboard zoom, fit view, 100% view, pan, fullscreen, and onion skinning. Evidence: [CANVAS-VIEW.md](CANVAS-VIEW.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
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
- [x] Timeline, scene, comment, and beat markers; named ranges; in/out points; and range looping. Evidence: [MARKERS.md](MARKERS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
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
- [x] Play, pause, frame seek, time seek, rate, volume, mute, loop, fullscreen, and custom controls. Evidence: [PLAYER.md](PLAYER.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] Current-frame, time, end, error, buffering, waiting, and resume events. Evidence: [PLAYER.md](PLAYER.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] Live parameter and composition-variant updates. Evidence: [PLAYER.md](PLAYER.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [ ] Media keys, keyboard controls, autoplay handling, preloading, premounting, buffering, and flicker prevention.
- [x] Poster images, responsive sizing, letterbox, fit/fill, transparent preview, and reduced-motion preview. Evidence: [PLAYER.md](PLAYER.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [ ] Timestamped annotations, review comments, read-only/password-protected review links, side-by-side comparison, frame diff, and A/B renders.
- [x] Local-first telemetry hooks with no default data transmission. Evidence: [PLAYER.md](PLAYER.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).

## 16. Rendering and output

- [ ] Complete, selected-range, multi-range, scene, group, still, image-sequence, video-only, audio-only, and transparent rendering.
- [ ] File and memory outputs with frame, progress, per-frame timing, concurrency, and diagnostic callbacks.
- [ ] Cancellation, pause/resume, persistent jobs, interrupted-render recovery, and partial-output cleanup.
- [ ] Frame, static-layer, effect, and nested-composition cache reuse plus dirty-frame incremental rendering.
- [x] Deterministic manifests and artifact hashes. Evidence: [render lifecycle contract](RENDERING.md), canonical resolved input SHA-256, stable short render identity, streaming final-artifact SHA-256 after atomic acceptance, SDK/CLI/MCP/Studio result propagation and real encoded-file hash verification.
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
- [x] Content-addressed frozen project bundles and dependency manifests. Evidence: [BUNDLES.md](BUNDLES.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
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
- [x] Schema/capability discovery, current-error retrieval, precise validation locations, and safe repair suggestions. Evidence: generated full/focused authoring schemas, catalog/output/edit capability queries, unified current [check report](CHECK-REPORT.md), stable finding codes/severity/source locations, bounded code-aware repair guidance explicitly marked non-automatic, and SDK/CLI/MCP/Studio contract tests.
- [x] Revision-safe transactional patches, dry runs, previews, conflicts, and three-way reconciliation. Evidence: [shared editing-session contract](EDITING-SESSIONS.md), compare-and-swap filesystem/memory adapters, atomic semantic batches and RFC 6902 patches, dry-run validated receipts, inverse previews, ID-aware three-way merge/conflict choices, stale-resolution refusal, native validation and CLI/MCP/Studio parity tests.
- [ ] Native frame/contact-sheet responses, evaluated timeline inspection, dependency inspection, asset usage, render inspection, and cancellation.
- [x] Agent-visible selection, viewport, timeline range, markers, and comments. Evidence: [live editing context](EDITING-SESSIONS.md), revision/sequence-safe context snapshots expose stable selected targets, nested instance paths, viewport, playhead/local frame, frame range, nearest markers/comments and lock state; paginated marker/range queries, Studio publication/consumption, persistence and CLI/MCP bridges are tested.
- [ ] Durable requests, resumable sessions, multiple hosts, bounded retries, provider-failure visibility, and project-scoped permissions.
- [x] Agent action history, undoable agent transactions, and change summaries. Evidence: [editing receipts and history](EDITING-SESSIONS.md), origin-labelled transactions enter the shared human/agent undo stack, bounded commit events and before/after revisions, affected stable targets, inverse patches and findings summarize each action; undo/redo, failure retention and observer isolation are tested across SDK/Studio/CLI/MCP.
- [ ] Agent-authored parameter schemas, components, effect stacks, 3D scenes, and local capture requests.
- [ ] Extension manifests, safe declarative registration, schema migrations, codemods, structured diagnostics, and JSON output everywhere.
- [ ] Shell completions, Creative IR language server, generated JSON Schema, YAML completion, editor diagnostics, and schema-derived examples. Schema export and focused discovery are implemented; broader acceptance remains open: [authoring schema](AUTHORING-SCHEMA.md).

## 22. Studio reliability and UX

- [ ] Feature flags for experimental work, autosave, explicit save, and saved/offline/conflict status.
- [x] Undo/redo with coalesced continuous edits, persistent history, named checkpoints, revision comparison, and restoration. Evidence: [editing-session history contract](EDITING-SESSIONS.md), bounded property-aware gesture coalescing, atomic reopenable recovery checkpoints, immutable named checkpoints, paginated comparison, validated restoration and deletion, stale/corrupt recovery diagnostics, retryable persistence and Studio/SDK/CLI/MCP coverage.
- [ ] Crash recovery, atomic writes, corrupt-project recovery, and automatic backups.
- [ ] Keyboard-first and screen-reader-accessible navigation, focus restoration, high contrast, reduced motion, touch, and narrow-screen layouts.
- [ ] Responsive inspectors, command palette, custom shortcuts, context menus, persistent panels/workspaces, and selection restoration.
- [ ] Error overlays with navigation plus isolated frame, effect, and asset failures.
- [ ] Render logs, diagnostic bundles, update channels, retention settings, cache dashboard, and background-job dashboard.

## 23. Public ecosystem

- [ ] Production examples for launch films, product demos, data/music visualization, captions, 3D, social, long-form, multilingual, batch personalization, transparent overlays, broadcast graphics, lower thirds, transitions, effects, motion paths, component libraries, and distributed rendering. The native-milestones example now includes a packaged local font and kinetic/editorial caption treatment; the complete example portfolio remains open.
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
- [x] **GM-002** Route product films, explainers, existing-footage edits, captions, music-driven films, short motion units, and presentations through maintained workflows with explicit inputs, outputs, and capability requirements. Evidence: [PRODUCTION-WORKFLOWS.md](PRODUCTION-WORKFLOWS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] **GM-003** Track resumable production stages and dependencies from source collection through planning, authoring, verification, and delivery; invalidate only affected stages when the brief or assets change. Evidence: [PRODUCTION-WORKFLOWS.md](PRODUCTION-WORKFLOWS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] **GM-004** Provide a storyboard with stable shot IDs, sketches/references, visual direction, narration, source evidence, planned duration, and separate build and review states; link built shots to real IR scene/layer IDs. Evidence: [PRODUCTION-WORKFLOWS.md](PRODUCTION-WORKFLOWS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] **GM-005** Support shot-level comments, resolved feedback, and navigation from storyboard to native preview; bind review decisions to a revision so a later change cannot inherit stale approval. Evidence: [PRODUCTION-WORKFLOWS.md](PRODUCTION-WORKFLOWS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] **GM-006** Import a versioned brand/design specification with exact palette/font bindings, provenance, immutable identity requirements, medium-specific recommendations, and a drift report across scenes and variants. Evidence: [design specification contract](DESIGN-SPECS.md), strict portable IR, exact path/palette/font/file-hash checks, rights-preserving provenance, delivery-medium guidance, named-variant drift and revision-safe SDK/CLI/MCP/Studio import/audit tests.
- [x] **GM-007** Store inspectable project and personal creative preferences with source/confirmation history, explicit overrides and removal; inferred one-off choices must not silently become personal defaults. Evidence: [creative preference contract](CREATIVE-PREFERENCES.md), strict project/personal records, source and append-only decision history, project-over-personal resolution, retained removals and schema-enforced confirmation before inferred personal defaults become active.
- [x] **GM-008** Freeze approved workflows as versioned reusable bundles of brief structure, brand bindings, storyboard skeleton, parameters, assets and acceptance checks; reopen them with migration and missing-dependency diagnostics. Evidence: [workflow bundle contract](WORKFLOW-BUNDLES.md), immutable content identity, approval gate, brief/design/storyboard/parameter/check payload, SHA-256 dependency inventory, engine compatibility, bounded v0 migration, structured missing/drift diagnostics and clean re-instantiation semantics.

## 26. Evidence capture, design ingestion, and media preparation

Refines §§6, 8, 14, 19, 20. Evidence: audit H05–H08. Network access and model execution belong to explicit acquisition/preparation jobs; accepted render assets stay local.

- [x] **GM-009** Capture a website or real product session into frozen screenshots/footage, text, source URLs, viewport/time metadata and a contact sheet; distinguish real evidence from subsequently reconstructed graphics. Evidence: [real product capture contract](EVIDENCE-CAPTURE.md), declarative Playwright sessions, frozen screenshots/optional footage/text/URL/status/viewport/time records, SHA-256 artifacts, native contact sheets and explicit captured-versus-reconstructed pixel provenance.
- [x] **GM-010** Extract candidate brand tokens, fonts, logos, media and source motion observations into an inspectable import manifest; report ambiguous identity and missing rights/provenance rather than silently substituting assets. Evidence: [brand candidate import](BRAND-IMPORT.md), source-bound ranked CSS color/font/token/motion observations, explicit logo/media candidates, local-file/rights/attribution state, ambiguity and missing-rights findings, null selection and a no-automatic-substitution contract.
- [x] **GM-011** Bound each capture phase by time, concurrency and output size; report partial/degraded completion, navigation status, skipped assets and reasons so an incomplete capture cannot look complete. Evidence: [capture limits and truthful completion](EVIDENCE-CAPTURE.md), schema-bounded action count, wall-clock/action timeouts, single-session concurrency, text and aggregate byte budgets, artifact rejection, navigation state, skipped-phase reasons and complete/partial/failed manifests.
- [ ] **GM-012** Import Figma/design-tool exports as editable native layers where supported and frozen artwork otherwise; preserve source identities/tokens and emit compiled, flattened, unsupported and fidelity-loss reports.
- [x] **GM-013** Provide a provider-neutral resolve/search/import/generate interface for images, icons, music, SFX and voice, plus source-verified logo acquisition; record the chosen source, license, prompt/intent, settings, tool/model identity, job state and local content hash, and distinguish generated media from captured evidence. Evidence: [provider-neutral media resolution](MEDIA-RESOLUTION.md), discoverable provider capabilities, explicit search/delivery jobs, verified-logo gate, complete/failed/cancelled results and ledger-backed source/license/intent/prompt/settings/provider/model/tool/origin/hash provenance.
- [x] **GM-014** Maintain a project media ledger and optional cross-project content-addressed cache with usage, derivation chains, relocation, deduplication and invalidation; a portable project must include its required files without relying on a personal cache. Evidence: [project media ledger](MEDIA-LEDGER.md), strict provenance/rights/derivation schemas, cycle and parent-hash validation, atomic import, content deduplication, optional hash cache, usage and invalidation inspection, guarded removal, transactional relocation and mandatory bundle inclusion of ledger files.
- [ ] **GM-015** Run reversible preparation jobs for trim, crop, conform, proxy, pitch-preserved constant-rate retiming, baked ramps/freezes and format conversion; preserve originals and source-to-derived time maps.
- [x] **GM-016** Offer optional local/provider-neutral transcription with language/model selection, timed words, confidence/correction review and provenance; convert accepted results into existing caption IR and invalidate timings when the source changes. Evidence: [reviewed transcription contract](TRANSCRIPTION.md), provider adapter and explicit model/language, source hash, timed words, nullable confidence, partial/limitation state, retained corrections and acceptance, native caption conversion and changed-source invalidation tests.
- [x] **GM-017** Offer optional subject segmentation/matting preparation for images and video with foreground and inverse-alpha outputs, transparent PNG/WebM/ProRes handoff, edge/temporal QA and frozen model settings; do not describe an inverse matte as an inpainted background. Evidence: [segmentation preparation contract](SEGMENTATION.md), provider-neutral image/video jobs, source/model/settings identities, frozen transparent foreground and inverse-alpha PNG/WebM/ProRes artifacts, edge/temporal thresholds, changed-source invalidation and schema-fixed non-inpaint wording.

## 27. Discoverable native content and component packages

Refines §§1, 4, 14, 23. Evidence: audit H09–H10 and the complete registry inventory. Named upstream assets are coverage references, not source to embed in the renderer.

- [ ] **GM-018** Package native components, compositions, effects and workflow examples with typed parameters, dependency manifests, previews, compatibility versions, licenses and provenance; install dependencies transactionally inside the project.
- [ ] **GM-019** Add local semantic catalog search alongside keyword/tag search with explicit answering tier, model/index version, offline status and scores; pin optional model downloads and keep query text local by default.
- [ ] **GM-020** Detect and report index/registry skew in both directions, unavailable results and unindexed items; refresh safely and explain degraded ranking rather than returning misleading empty results.
- [x] **GM-021** Return a focused capability description with parameter ranges, animation support, example native payload, cost and unsupported conditions before applying a catalog item; keep direct IR authoring available. Evidence: typed `describeCatalogItem` for motions/blueprints/references, seek-safe animation metadata, pasteable native payloads, bounded costs, incompatibility/constraint lists, provenance for direction studies, explicit direct-authoring flag, CLI `catalog-describe`, MCP describe mode and contract tests.
- [ ] **GM-022** Provide deterministic family/tag installation, update/diff/rollback, dependency conflicts, schema migrations and removal guarded by usage; include a per-item native-frame smoke check.
- [ ] **GM-023** Maintain local search-miss and content-quality records that users can inspect or delete; any external report must be a separate explicit action, not background telemetry.
- [ ] **GM-024** Build native parameterized families for charts, ranked/racing data, maps/routes/markers, diagrams, code explainers, device/product framing, lower thirds, logo/title units and editorial overlays; retain source data and validate labels/readability.
- [ ] **GM-025** Build reusable caption/lyric identities with semantic emphasis, word timing, regional safe areas, language/font coverage and preview examples; audit every inventoried registry family for native coverage or a recorded intentional exclusion. Caption identities, timed word-emphasis plates, local-font packaging and a preview example are implemented. Lyric-specific identities, regional safe areas, language/font-coverage audit and registry-family reconciliation remain open.

## 28. Audio processing, analysis, and music-driven authoring

Refines §§3, 7, 8, 12, 16. Evidence: audit H11–H15. Preview and export must implement one declared signal-flow contract.

- [x] **GM-026** Add a versioned ordered audio-effect rack with stable effect IDs, enabled state, duplication, copy/paste, presets, validated units/ranges and discoverable automation support. Evidence: [native audio rack](AUDIO.md), ordered 32-effect schema with unique stable IDs and bypass state, deterministic duplicate/versioned clipboard paste, validated voice/delivery presets, bounded parameter schemas, explicit automation capability/refusal metadata and native DSP/Studio/SDK tests.
- [x] **GM-027** Support editable gain, high/low-pass, peaking/shelf EQ, compressor, limiter, gate, saturation, delay, reverb, chorus, phaser and bitcrush primitives through native/offline DSP or deterministic frozen processing; reject unsupported parameter combinations. Evidence: [native audio DSP](AUDIO.md), strict bounded discriminated schemas, deterministic native FFmpeg filter compilation, decoded PCM checks for every primitive, Studio typed rack authoring/reordering/bypass, and shared SDK/CLI/MCP document access.
- [ ] **GM-028** Add volume/effect automation lanes with time units, interpolation, reset rules and source/clip/bus time mapping; expose the same values through Studio, CLI, MCP and SDK.
- [x] **GM-029** Model effect latency, preroll, tails and duration explicitly; preserve reverb/delay endings and validate preview/export parity at trims, loops, seeks and transitions. Evidence: [audio timing contract](AUDIO.md), per-effect compensated/uncompensated latency, state preroll and bounded decay-tail plans, retained/truncated project-boundary measurements, one shared preview/export graph, and SDK/CLI/MCP/Studio inspection with deterministic tests.
- [ ] **GM-030** Add audio submix buses whose effects process summed members, with stable membership, routing validation, group mute and automation; explicitly version any distinction between preview audition solo and output solo.
- [x] **GM-031** Analyze a voice/music pair or voice bus to propose dynamic spectral carving and gain envelopes with source measurements, editable strength and inspectable analysis metadata.
- [x] **GM-032** Tag generated carve effects and automation by ownership; recomputation replaces only those edits, preserves manual processing, handles changed group membership and detects stale source analysis.
- [x] **GM-033** Provide source and mix diagnostics for clipping, level imbalance, noise, silence, peaks and loudness; proposed levelling/repair must be reviewable and report measurement limitations.
- [x] **GM-034** Add intent-oriented audio repair presets/jobs with reversible parameter changes, before/after audition and measured acceptance; retain the original recording and avoid treating a preset name as quality proof.
- [x] **GM-035** Persist beat/onset/strength, phrase/energy and silence analysis against a source hash and time map; support manual correction and confidence/uncertainty instead of forcing every source onto a beat grid.
- [x] **GM-036** Bind native animation and cut landmarks to frozen audio feature tracks through safe declarative mappings with smoothing, range/clamp, latency and deterministic random-seek behavior.
- [x] **GM-037** Build music/lyric-driven workflows that select a real source range, plan around phrases and endings, expose beat markers, preserve verified lyrics and test readable holds against the actual soundtrack. Evidence: [music and lyric workflows](MUSIC-WORKFLOWS.md), source-hash/analysis-bound range selection, confidence-ranked phrase endings, corrected beat mapping, verified lyric provenance, readable-hold findings and impossible/unverified request tests.

## 29. Source-aware color and media treatment

Refines §§6, 9, 10, 15, 18. Evidence: audit H16–H20. Existing effect families remain the owner; these entries specify missing contracts and authoring workflows.

- [ ] **GM-038** Introduce a versioned native grading payload with primary correction, tonal wheels, master/RGB curves, hue-versus-hue/saturation/luma curves, keyed secondaries, enabled state and explicit working color space.
- [x] **GM-039** Import and validate local LUTs with dimensions/domain/interpolation/intensity, hashes and color-space expectations; preview the same grade and parameter order used for export. Evidence: [LUTS.md](LUTS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] **GM-040** Analyze representative source frames for luminance/chroma/saturation, clipping risk and color metadata; emit evidence plus a conservative suggested patch with dry-run/apply/clear and unsupported-log/HDR diagnostics.
- [ ] **GM-041** Add parameterized native print/art treatments: two-ink print, ordered dithering, mono-screen patterns, ASCII glyph rendering, engraving, crosshatching and edge-preserving painterly filtering; retain readability controls and seek determinism.
- [ ] **GM-042** Add source-driven tape tracking/chroma bleed, film artifacts, scanline/CRT, channel-separation and digital-tear/block treatments with explicit spatial/temporal parameters and seeds.
- [x] **GM-043** Make treatment animation support explicit per parameter; implement declared blur/pixelation/bloom/grain/reveal controls without hidden wall-clock state, and reject animation on unsupported controls. Evidence: [VISUAL-EFFECTS.md](VISUAL-EFFECTS.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] **GM-044** Compare original and candidate grades, LUTs or composition variants at identical source/timeline times in labeled sheets or interactive views; retain exact settings and report failed/truncated candidates. Evidence: versioned `compareNativeVariants` resolves parameter-bound grade/LUT/composition settings, evaluates baseline/candidates at identical timestamps, reports hashes and per-frame MAE, emits an original-plus-labeled-candidate PNG sheet, preserves exact settings and isolates invalid/truncated candidates with tests.
- [ ] **GM-045** Compose original plate, foreground matte and regional treatment as editable native layers/masks with feather and alpha semantics; keep source time mapping identical across the stack and support later tracked-matte inputs.
- [x] **GM-046** Publish per-effect support and cost metadata for backend, precision, alpha, HDR, sampling and memory; surface incompatible stacks before rendering and offer explicit reduced-quality previews without changing the accepted master. Evidence: [visual-effect contract](VISUAL-EFFECTS.md), generated capability records for every effect with backend/precision/color/alpha/HDR/sampling/parameters, bounded stack memory/pixel-pass estimates and limitations, schema/kernel incompatibility refusal, SDK/CLI/MCP/Studio discovery, and isolated draft/standard preview plans that never mutate accepted high-quality output settings.

## 30. Semantic editing SDK and agent evidence

Refines §§1, 2, 11, 13, 21, 22. Evidence: audit H21–H25. Genmotion already has JSON patches and revision checks; this is the higher-level shared editing layer.

- [x] **GM-047** Provide a headless editing session over Creative IR with typed query, text/style/property/timing/asset/track operations, disposal and memory/filesystem/host persistence adapters; use it from Studio and agent tools. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).
- [x] **GM-048** Address nested targets by stable composition-instance/layer identity rather than array position alone; detect stale or ambiguous targets and expose dependency/usage paths before mutation. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).
- [x] **GM-049** Expose a pure capability/refusal query for an intended operation on the current target, including locks, inheritance, unsupported imported content and required materialization; derive relevant Studio controls from it. Evidence: [editing sessions](EDITING-SESSIONS.md), revision-safe session query, stable target inspection, lock/inheritance/frozen-import/materialization/binding/dependant metadata, operation-derived control enablement/refusal reasons and contract tests.
- [x] **GM-050** Make a multi-operation edit one validated transaction, one persist event and one undo step; provide inverse patches, rollback on failure, change-origin metadata and event subscriptions. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).
- [x] **GM-051** Coalesce continuous gestures by target/property without merging unrelated edits; support host-owned history, persistence failure/retry and reopenable checkpoints through the same session. Evidence: [editing-session contract](EDITING-SESSIONS.md), ordered target/property/origin coalescing keys, structural-edit separation, bounded host checkpoint adapters, serialized atomic persistence, explicit checkpoint errors and retry, stale/malformed recovery handling and reopen tests.
- [x] **GM-052** Store versioned sparse overrides on reusable base compositions with scoped nested IDs, explicit removal markers, parameter/asset overrides and base-update conflict/orphan diagnostics. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).
- [x] **GM-053** Expose a bounded live scene/context view with playhead, selection, instance path, viewport, editability, revision and undo state; let tools select/seek the same targets the human is editing. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).
- [x] **GM-054** Offer a capability-negotiated in-Studio agent bridge where supported, using the same semantic service as local MCP; require source-safe handles and session permissions rather than broad browser scripting. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).
- [x] **GM-055** Return structured edit receipts distinguishing refused, dispatched, saved, verified and failed states, with a separate changed flag, before/after revision, affected targets and available readback/frame evidence. Evidence: [editing sessions](EDITING-SESSIONS.md), pre-persistence dispatch events, validated/saved/verified final receipts, typed refusal/failure error receipts, explicit changed/persisted fields, revisions, stable targets, inverse patches and readback/frame evidence contracts with lifecycle tests.
- [x] **GM-056** Record canvas gestures into native keyframes with timestamped samples, endpoint-preserving smoothing/reduction, preview before acceptance and one reversible edit; later agent edits must retain user-authored trajectories unless targeted. Evidence: [2.4.0 milestone QA](MILESTONE-QA-2026-09-07.md).

## 31. Time-aware visual diagnostics and acceptance assertions

Refines §§3, 5, 8, 13, 15, 16, 21, 24. Evidence: audit H26–H29. Static schema validation remains necessary but cannot establish visual quality.

- [x] **GM-057** Produce one structured check report spanning schema, assets, evaluated layout, media readiness, contrast, motion assertions and output contract, with explicit severity, sampled coverage and incomplete-check status. Evidence: [native check reports](CHECK-REPORT.md), complete/truncated coverage assertions, SDK and CLI contracts, MCP stdio execution and authenticated Studio API tests.
- [x] **GM-058** Sample scene/track/transition boundaries and interior times, distinguish persistent defects from intentional transient entrance/exit states, and report omitted timestamps when a sampling budget truncates coverage. Evidence: deterministic review sampling includes scene/layer/keyframe/transition boundaries and interval midpoints; authored transition windows drive explicit transient/persistent/isolated classification; bounded plans report candidate, selected and omitted counts; unified check reports surface truncated coverage.
- [ ] **GM-059** Anchor findings to stable native targets, instance paths, source revision, frame/time and bounding boxes; include annotated frames and focused crops so agents can inspect the reported defect.
- [ ] **GM-060** Detect evaluated text overflow, occlusion, off-canvas content and reserved caption/safe-area collisions through hierarchy, transforms and masks; allow scoped intentional exceptions with reasons.
- [ ] **GM-061** Measure contrast against the rendered/composited background at relevant times, distinguish unreadable text from decorative shapes, and expose assumptions/limits for complex media backgrounds.
- [x] **GM-062** Add declarative acceptance assertions for appearance deadlines, ordering, frame containment, readable holds and maximum unintended static intervals; bind them to stable layer IDs and evaluated native output. Evidence: versioned native assertion evaluator covers every named assertion, resolves scene/layer IDs exactly, evaluates opacity/world bounds/motion settle/keyframe intervals and returns measurements/reasons with complete contract tests.
- [x] **GM-063** Version assertion schemas, reject missing/ambiguous targets, test false positives, and support intentional stillness/reduced motion; heuristic checks must not present themselves as exhaustive aesthetic approval. Evidence: strict v1 discriminated schema, unique assertion IDs, exact-target and target-type refusal, explicit intentional-stillness/reduced-motion exemptions, failing/non-failing false-positive tests and machine-readable scope/disclaimer denying exhaustive aesthetic approval.
- [x] **GM-064** Report composed world-space trajectories, local/global clocks, ancestor contributions, keyframe segments and discontinuities; visualize conflicts between host transitions, child motion and camera handoffs. Evidence: versioned `composedTrajectory` samples resolved native layer graphs in world space, reports global/scene/local clocks, ancestor/constraint/property-link ownership, active keyframe segments and hold/discrete discontinuities for overlay visualization, with cycle/missing-target refusal and tests.
- [x] **GM-065** Support multi-stroke path/gesture diagnostics that distinguish drawn motion from jumps, retiming comparisons and before/after overlays; preserve semantic anchors when repairing timing. Evidence: versioned stroke/jump reports preserve recording IDs and coordinate spaces, quantify inter-stroke jump distance/time, retime timestamps without changing points or semantic identity, reject geometry-mismatched comparisons and return aligned before/after overlay data with tests.
- [x] **GM-066** Maintain a revision-bound review artifact containing the check report, representative frames, compared variants, audio findings and unresolved decisions; invalidate affected evidence after edits. Evidence: strict exported v1 review-artifact schema binds revision/source/dependency hashes to all named evidence families, refuses mismatched check reports, records complete/failed/truncated comparisons and provides selective source/dependency invalidation while retaining unresolved human decisions, with contract tests.

## 32. Embedded preview, presentations, and accessible editing

Refines §§1, 12, 15, 22. Evidence: audit H30–H32. Interactive playback metadata must resolve to declared native scene/timing data.

- [x] **GM-067** Ship a framework-neutral embeddable Player/thumbnail API for native preview transport with play/pause/seek/rate/volume/loop controls, responsive sizing and stable events; do not create a second browser scene renderer. Evidence: [PLAYER.md](PLAYER.md); [acceptance reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
- [x] **GM-068** Define readiness, buffering, cancellation, stale-frame rejection, parameter changes and audio synchronization across embedded and Studio playback; test seek storms and slow preview delivery. Evidence: [Player contract](PLAYER.md) and [Studio playback contract](STUDIO-PLAYBACK.md), ready/buffering/waiting/resume events, superseded request aborts and generation guards, revision-keyed server rejection, atomic parameter/variant refresh, processed native audio clock tests, delayed/out-of-order seek tests, bounded worker queues and adaptive viewport delivery.
- [x] **GM-069** Provide portable review bundles/links with source revision, frozen assets or verified media, timestamps and comments; apply explicit access control for shared services and keep local review usable offline. Evidence: [portable review bundles](REVIEW-BUNDLES.md), revision-bound artifact/project freezing, per-file SHA-256 verification, timestamped target comments, offline entry point, scrypt shared-access policy, expiry/origin controls and tamper tests.
- [x] **GM-070** Add a presentation manifest for ordered scenes, fragment hold points, branches, hotspots and speaker notes, validated against stable IR identities with missing-target/cycle diagnostics. Evidence: [native presentations](PRESENTATIONS.md), strict v1 manifest, stable scene/layer/branch validation and bounded cycle diagnostics.
- [x] **GM-071** Provide synchronized presenter and audience views with keyboard navigation, fragment/branch return behavior and persistent notes; preview every supported route without changing the source timeline implicitly. Evidence: [native presentations](PRESENTATIONS.md), monotonic presenter/audience snapshots, private persistent notes, keyboard navigation, fragment holds, branch stacks/returns, subscriptions and invalid/stale state refusal tests.
- [x] **GM-072** Define deterministic video export of an interactive project through an explicit route and timing policy; report unreachable scenes, unresolved waits and unsupported interactions before rendering. Evidence: [native presentations](PRESENTATIONS.md), explicit route/scene/fragment hold policy, source-time segment plan, unreachable-scene report and pre-render refusal of missing routes or unresolved branching.
- [ ] **GM-073** Make large timelines accessible as a virtualized hierarchical control with stable logical focus, row/clip/keyframe announcements, keyboard selection/editing and focus restoration after scroll/collapse.

## 33. Delivery parity, batches, and render diagnostics

Refines §§2, 6, 16, 17, 24. Evidence: audit H29, H33–H35. These refine existing export/distribution items; native and provider-neutral guardrails remain mandatory.

- [ ] **GM-074** Validate alpha end to end through source decode, effects, transitions and PNG-sequence/WebM/ProRes output; test straight/premultiplied alpha and inspect against contrasting backgrounds.
- [ ] **GM-075** Define source/working/output color transforms and explicit SDR/PQ/HLG policies before claiming HDR; probe metadata, test mixed-media compositing and report unsupported effect/backend combinations.
- [x] **GM-076** Publish an output compatibility matrix for codec/container/pixel format/alpha/color/audio/resolution/backend combinations; reject impossible combinations and make any fallback an explicit result. Evidence: [output compatibility](OUTPUT-COMPATIBILITY.md), matrix/impossible-combination tests, all-codec encoded output tests, CLI/SDK/MCP access and Studio API coverage. The native result explicitly returns `fallback: null`.
- [x] **GM-077** Generate a dry-run render plan with frozen dependency hashes, variant values, dimensions, FPS, selected ranges, color/audio contract, backend requirements and output identity. Evidence: [deterministic render plans](RENDER-PLAN.md), stable source/dependency/output SHA-256 assertions, selection and impossible-contract tests, CLI execution, MCP stdio coverage and authenticated Studio API coverage.
- [ ] **GM-078** Support JSON/JSONL/CSV batch inputs with row-level validation, deterministic IDs/output names, concurrency limits, progress, isolated failure and selective retry without rerendering accepted rows.
- [ ] **GM-079** Reuse content-addressed project uploads and assets across render jobs and providers with integrity checks, deduplication, quotas and deterministic local dependency resolution.
- [ ] **GM-080** Implement provider-neutral plan/shard/assemble orchestration and backend adapters; include variable propagation, audio-tail handling, cancellation, retry/idempotency and local-versus-distributed seam tests.
- [ ] **GM-081** Gate preview/local/distributed parity with representative image/video/alpha/audio/effect fixtures, random seek order, declared pixel/audio tolerances and inspectable failed-frame artifacts.
- [ ] **GM-082** Track reproducible performance baselines by scene class, resolution, backend and hardware with frame-time distributions, memory, encode throughput and regression budgets; do not infer speed from renderer architecture.
- [x] **GM-083** Bound in-flight and completed native frames by count/bytes and encoder backpressure; expose queue/memory diagnostics and verify slow-frame/slow-encoder behavior at high resolution. Evidence: [rendering contract](RENDERING.md), `tests/frame-stream.test.ts` (including 4K buffers), `tests/render.test.ts`, `tests/asset-cache.test.ts`, and Studio API/browser export tests.
- [x] **GM-084** Propagate cancellation, deadlines and errors through asset preparation, frame workers, encoding, audio DSP/mux and probing; own and reap every child process and remove partial artifacts at every stage. Evidence: [render lifecycle contract](RENDERING.md), shared abort/deadline propagation through preparation, bounded frame streaming, native workers, audio time mapping, encoding, mux and probe; owned child kill/close tests; stage-injected failure/cancellation tests preserve accepted masters and remove staging; CLI signal, MCP cancellation and Studio job/browser coverage.

## 34. Reproducible agent workflows and developer tooling

Refines §§14, 21, 22, 23, 24. Evidence: audit H35–H36 plus native integration needs identified in this audit.

- [x] **GM-085** Record the runtime, schema, font, media, model-preparation and backend versions/hashes that define a render's reproducibility envelope; verify manifests on load and report mismatches. Evidence: [render-plan envelope](RENDER-PLAN.md), source and per-dependency font/media hashes, schema/Node/platform/architecture, native canvas and complete FFmpeg versions, explicit no-model preparation state, deterministic dependency-set identity and load-time field-by-field mismatch reporting/tests.
- [ ] **GM-086** Generate focused capability documentation, examples and schemas from canonical contracts; detect drift between Studio controls, MCP/CLI/SDK support and bundled skills.
- [ ] **GM-087** Package small domain/workflow skills with explicit input/output contracts, lazy capability loading, resumable state and executable examples; do not require all knowledge in every agent turn.
- [ ] **GM-088** Check project/runtime/library version compatibility before upgrades; preserve pins, run migrations and representative validation, and provide rollback with a visible version/change report.
- [x] **GM-089** Provide bounded machine-readable progress and diagnostic bundles with stage, target, time, error code and next action; distinguish process success, validated project, saved edit and verified output. Evidence: exported versioned `operationDiagnosticSchema`, explicit process/project/edit/output/failure outcomes, required failure codes, ISO timestamps, stage/target/next-action bounds, capped detail keys/string payloads and contract tests; render/edit/check surfaces retain their richer native results alongside this common envelope.
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

## 36. Reference-derived work and provenance boundaries

Refines §§14, 15, 16, 21, 23 and 24. These requirements cover an explicitly authorized adaptation of supplied material. They do not permit copied artwork, covert reference tracing, or a browser-rendering escape hatch; all final evaluation remains in the native evaluator.

- [ ] **GM-092** Represent each supplied reference with a frozen source record: content hash, original location, owner/rights status, permitted use, redistribution status, attribution text, and the user's authorization or unresolved-rights warning. Block export presets that conflict with a recorded restriction; unknown rights must remain visible rather than becoming an implied license.
- [ ] **GM-093** Build a reversible reference-preparation graph that preserves raw media and records every extracted frame, audio stream, crop, matte, cleaned plate, measurement and generated derivative with parent hashes, tool/version/settings, exact source-time mapping and declared retained/replaced regions.
- [ ] **GM-094** Support a declared adaptation map that links reference intervals and measurements to native scene/layer targets, marks intentional differences, and distinguishes original native layers, captured evidence, source-derived pixels and generated replacements in Studio, bundles and delivery manifests.
- [ ] **GM-095** Analyze reference timing, motion landmarks, camera/cursor positions and visual regions into reviewable bounded observations with confidence and manual correction; native reconstruction must consume those observations through stable declarative tracks rather than executable source-project code or renderer-time inference.
- [ ] **GM-096** Produce reference-versus-output comparisons at declared aligned timestamps with optional exclusion masks for intentional changes, per-region image metrics, contact sheets and boundary samples. A mismatch report must separate reference-preservation defects from intended adaptation differences and retain the compared source and output hashes.
- [ ] **GM-097** Require an explicit, hash-bound acceptance record before downloading a restricted font or other gated asset. Verify the downloaded bytes, refuse silent substitutions or changed upstream bytes, and record the terms URL, accepted version, actor and time without treating a generic project save as consent.
- [ ] **GM-098** Generate a render-input attestation from the resolved dependency graph. It must identify all render inputs and their roles, prove that delivered/comparison exports are excluded as inputs, verify required frozen assets before rendering, and retain encoded-output, decoded-video and audio-stream hashes after a full decode.

## Audit sources

This program specifies product capabilities and acceptance requirements. Implementation belongs to Genmotion's shared Creative IR, native evaluator and services. The `AE-*` frontier is separately labeled strategic work.
