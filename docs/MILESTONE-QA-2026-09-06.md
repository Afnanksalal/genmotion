# Native capability milestone — 2026-09-06

This milestone validates the implementation currently in the repository. It does not complete the full capability backlog or certify all production requirements. The canonical checklist remains at **42 checked / 317 total**.

## Scope

The milestone includes bounded rendering and cancellation; shared revisioned editing; typed parameters and composition clocks; native vector geometry, text layout and animation controls; audio processing and stems; immutable project bundles; production planning and review; 64 native effect types, masks and adjustment layers; LUTs and declarative kernels; Player embedding; markers and canvas guides; source audio analysis; image sequences and sprite sheets; media cropping and borders; caption editing; source metadata; looped source media; and explicit SDR conforming.

The media-ledger file is a tested **schema foundation only**. It is not an integrated media-import, licensing, or asset-management service.

## Validation

Commands are run from the repository root after compiling with `npx tsc -p tsconfig.build.json`.

| Check | Result |
| --- | --- |
| ESLint and TypeScript | Passed |
| Native/unit/integration suite | 208 passed across 63 files; 89.66% lines, 96.47% functions, 79.20% branches |
| Playwright browser suite | 41 passed, one worker, no retries |
| Package installation | Packaged CLI 2.3.0 and native dependency doctor passed in a temporary installation |
| Combined render | 48 frames, two seconds, 1920×1080 H.264 at 24 FPS; full FFmpeg decode passed |
| Visual inspection | Fresh effects, gradients, primitives, contour morphs, text-layout and combined-render contact sheets inspected |

The native suite includes actual FFmpeg video/audio encodes and decodes, cancellation, output preservation, source-audio timing, measured loudness/stem reconstruction, revision conflicts, bundle integrity, MCP stdio, and pixel-level compositing assertions. SDR conforming was exercised for both H.264 and ProRes, including refusing existing destinations and cancellation. The browser suite covers responsive Studio layouts, keyboard/dialog behavior, persisted edits, render cancellation and export, as well as new effects/masks, guides, captions, markers and Player lifecycle behavior.

## Defects corrected during this QA pass

- Exporting the complete MCP JSON Schema failed when a custom kernel introduced a Zod transform. Schema export now describes the validated input contract.
- Imported asset usage counts stayed stale after project saves. Studio refreshes its authoritative asset inventory after saving.
- Browser reset CSS removed the native appearance of checkbox controls. Checkboxes now render visibly, and plain modal labels/selects have readable spacing.
- The Player script endpoint failed when the server ran directly from TypeScript sources. It now resolves the built browser module in development as well as packaged operation.
- Invalid Player parameter payloads returned a server error. Invalid JSON and schema input now return HTTP 400.
- H.264 SDR conforming did not reliably retain color-transfer/primaries tags with this FFmpeg build. Explicit encoder tags now accompany the stream metadata.
- Conformed output could report an incorrect average frame rate despite an FPS filter. Explicit output rate/CFR mode now preserves the delivery timing contract.
- New regression fixtures used invalid project sizes or incorrectly escaped FFmpeg expressions; these were repaired without relaxing production validation.

One browser export attempt exceeded its 15-second assertion while other checks were running. The final complete browser run passed with no retries. No timeout was increased to hide that result.

## Reproducible visual QA

Run `node scripts/verify-effects.mjs`, `node scripts/verify-gradients.mjs`, `node scripts/verify-primitives.mjs`, `node scripts/verify-path-morph.mjs`, `node scripts/verify-text-layout.mjs`, and `node scripts/verify-milestone.mjs`. Generated outputs are under `output/playwright/` and are excluded from source control.

The effect sheet exercises all registered effect types; some controls deliberately use their identity defaults. It is not an exhaustive perceptual assessment of every parameter combination. The combined render checks animated reveal, gradient fill, feathered mask, shadow, and progressive caption highlighting together.

## Limits

Validation was performed on Windows with Node 22 and FFmpeg 7.1. Linux/macOS, hardware encoders, arbitrary media/ICC/log profiles, long-running production workloads and all combinations of effects are not certified by this pass. The compositor remains RGBA8 SDR. Advanced mixed-direction caption layout, professional 3D/compositing, distributed rendering, crash recovery and the broader unfinished checklist remain open.

This is a local Git milestone, not an npm publication or deployment. The package version remains 2.3.0.
