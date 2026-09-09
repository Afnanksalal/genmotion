# Genmotion 2.6.0 milestone QA — 2026-09-09

This milestone raises the audited native capability count from 125 to **138 of 324**. The remaining 186 contracts stay unchecked. A checked row has a strict Creative IR or service contract, native behavior, documentation, and executable acceptance evidence.

## Implemented contracts

- Caption delivery: named global presets with cue/speaker overrides, BCP 47 tracks, selected preview languages, seek-safe entry/exit motion, absolute-time SRT/WebVTT sidecars, and container-specific embedded stream plans.
- Motion rendering: project, layer, and effect shutter scopes plus bounded premultiplied motion trails and screen-composited directional light trails.
- Expressive type: ordered per-word/per-character runs, timed current-word emphasis, oriented SVG text paths, and animated seeded underline/circle/highlight/strike notation.
- Evidence-driven workflows: real source-range and phrase-ending selection for music/lyrics, verified lyric provenance and readable-hold findings.
- Agent editing: target capability/refusal metadata, derived control availability, and distinct dispatched, validated, saved, verified, refused, and failed lifecycle receipts.
- Review and presentation: content-addressed offline review bundles with shared-access policy; stable presentation manifests, synchronized presenter/audience state and explicit deterministic export routes.

## Acceptance gates

- `npm run check`: lint, TypeScript build, and the complete unit/integration suite.
- `npm run test:studio-e2e`: authenticated browser workflows on the native Studio.
- `npm run examples:build && npm run examples:verify`: all eight editable examples regenerated, decoded, checked for nonblank/deterministic motion, and inspected through their generated reports/contact sheets.
- `npm run package:verify`: installed package CLI, doctor, schema, native frame, and archive-content verification.
- GitHub CI and the tagged release workflow repeat these gates before publishing the archive and SHA-256 manifest.

## Scope

This is a production milestone for the checked contracts. It does not claim the remaining 186 checklist rows; the canonical backlog remains the source of truth.
