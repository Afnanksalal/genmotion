# Changelog

Genmotion follows semantic versioning. GitHub releases contain the verified package archive and its `SHA256SUMS` manifest.

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

