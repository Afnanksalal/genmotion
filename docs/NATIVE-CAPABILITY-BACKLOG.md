# Genmotion Native Capability Backlog

This is the canonical, version-controlled checklist for bringing every transferable capability identified in the Remotion 4.0.520 audit into Genmotion. It is intentionally exhaustive: priority and release assignment may change, but an item must not be silently removed because it is difficult or niche.

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
- [x] Do not copy or depend on Remotion Editor Starter source code or other incompatibly licensed implementation code.
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
- [ ] Freeze a composition at a frame or only during a selected interval.
- [ ] Finite loops, infinite preview loops, nested loops, ping-pong loops, time remapping, playback-rate controls, and time stretching.
- [ ] Composition cycle detection, dependency graph, and usage search.
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

- [ ] Multi-point numeric, color, gradient, angle, vector, point, rectangle, and compatible-path interpolation.
- [ ] Independent left/right extrapolation with clamp, extend, wrap, identity, loop, and ping-pong behavior.
- [ ] Shortest-path rotation interpolation, discrete steps, and hold keyframes.
- [ ] Named easing, per-segment easing, custom cubic Bezier easing, easing copy/paste, reversal, mirroring, and presets.
- [ ] Springs with duration measurement, normalization, overshoot clamping, velocity, physical presets, and settling visualization.
- [ ] Deterministic seeded randomness and deterministic 2D, 3D, and 4D noise.
- [ ] Stagger by index, distance, center, and seeded random order plus delay and trail utilities.
- [ ] Frame-rate-independent helpers and subframe evaluation.
- [ ] Shutter-based temporal sampling, motion blur, motion trails, directional light trails, per-layer/effect control, shutter angle, and quality-dependent sample counts.
- [ ] Velocity and acceleration visualization.
- [ ] Track grouping, mute, solo, lock, and expression-free property linking.
- [ ] Parent-child transform inheritance and follow-path, look-at, maintain-distance, and anchor-to-anchor constraints.

## 4. Vector geometry and paths

- [ ] Complete SVG path parser, canonical normalization, relative-to-absolute conversion, and serialization.
- [ ] Path bounds, length, point, tangent, and normal queries.
- [ ] Path cutting, trimming, reversal, translation, scaling, centering, warping, subdivision, and subpath extraction.
- [ ] Compatible-path normalization, interpolation, shape morphing, and multi-subpath morphing.
- [ ] Motion-path attachment, automatic path orientation, offset paths, animated dashes, arrowheads, and start/middle/end markers.
- [ ] Boolean union, intersection, subtraction, and exclusion.
- [ ] Stroke expansion and rounded corners on arbitrary paths.
- [ ] Editable path nodes with smooth, symmetric, and corner modes plus direct Bezier handles.
- [ ] Path, anchor, and shared-geometry snapping and constraints.
- [ ] Native arcs, pies, callouts, arrows, stars, sparks, hearts, regular polygons, triangles, donuts, rings, spirals, waveform paths, line charts, and area charts.

## 5. Text and typography

- [ ] Native text measurement, line-breaking, overflow detection, fit-to-box, fit-to-line-count, and automatic box sizing.
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
- [ ] Voice-aware ducking with configurable attack and release.
- [ ] Noise gate, compressor, limiter, parametric EQ, high-pass, and low-pass filters.
- [ ] Loudness, true-peak, and LUFS measurement, optional normalization, and clipping warnings.
- [ ] Music, voice, SFX, and source stem rendering plus embedded audio metadata.
- [ ] Frozen searchable SFX library with intent, license, attribution, and peak-normalization metadata.

## 8. Captions and subtitles

- [ ] SRT, WebVTT, and timed-JSON import/export.
- [ ] Word/token timing and correction, caption pages, page duration, forced breaks, speakers, and speaker styles.
- [ ] Current-word and karaoke highlighting, line/character limits, and safe-area validation.
- [ ] Burned-in, sidecar, and embedded subtitle delivery.
- [ ] Caption preview, search, replacement, global style presets, and per-caption overrides.
- [ ] Caption backgrounds, outlines, shadows, entry/exit animation, RTL, and multiple language tracks.
- [ ] Provider-neutral adapters for importing locally generated transcripts.

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

- [ ] Separate transition timing from visual presentation.
- [ ] Linear, Bezier, and spring timing.
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

## Audit sources

This backlog was derived from the current official Remotion API, renderer, composition, Studio, Player, effects, paths, media, captions, transitions, 3D, and release documentation. It records transferable product capabilities, not implementation code.

- <https://www.remotion.dev/docs/api>
- <https://www.remotion.dev/docs/sequence>
- <https://www.remotion.dev/docs/editor-starter/features>
- <https://www.remotion.dev/docs/studio/interactivity>
- <https://www.remotion.dev/docs/effects>
- <https://www.remotion.dev/docs/paths>
- <https://www.remotion.dev/docs/player>
- <https://www.remotion.dev/docs/renderer>
- <https://www.remotion.dev/docs/captions>
- <https://www.remotion.dev/docs/transitions/transitionseries>
- <https://www.remotion.dev/docs/three>
- <https://www.remotion.dev/docs/lambda>
