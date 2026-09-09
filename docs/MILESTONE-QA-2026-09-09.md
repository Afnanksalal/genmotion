# Native capability milestone QA — 2026-09-09

This milestone raises the audited native capability count from 75 to **125 of 324**. A checked requirement has an implemented contract, public API or product surface, and acceptance coverage. Partial work remains unchecked.

## Delivered capability groups

- Native typography and captions: deterministic metrics, Unicode-aware reveal boundaries, direction handling, safe-area and density diagnostics, and designed highlight modes.
- Motion and timing: gesture recording diagnostics, trajectory comparison, retiming, composition offsets, frame holds, finite loops, selection rendering, and motion-blur acceptance.
- Audio: multitrack processing, effect racks, waveform and spectrum analysis, loudness and source diagnostics, repair jobs, spectral-carve proposals, owned recomputation, frozen feature tracks, and deterministic animation mappings.
- Render and review: cancellation cleanup, deterministic render plans, dependency and artifact hashes, output compatibility, representative sampling, strict acceptance assertions, review artifacts, and native variant comparison.
- Agent and Studio editing: revisioned transactions, undo/redo, checkpoints, editing context, parameter bindings, typed diagnostics, and durable viewport state hydration.

## Verification evidence

- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm test`: **81 files and 275 tests passed**. The suite includes native frame rendering, H.264, H.265, VP9 and ProRes encode/decode checks, real audio processing, MCP stdio, cancellation cleanup, deterministic seeking, and Studio server integration.
- `npm run test:studio-e2e`: **53 browser tests passed**. The suite covers authoring, playback, captions, effects, paths, parameters, responsive UI, keyboard access, export, and cancellation.
- The viewport persistence regression found during QA was fixed and its reload case passed three consecutive stress runs before the full browser pass.
- `npm run examples:build` and `npm run examples:verify`: all eight public examples parsed under strict validation; the three reproducible showcase projects rendered 240 nonblank frames each with deterministic random seeking and verified motion diversity. The audio example also passed clipping and silent-edge checks.
- `npm run package:verify`: the packed `genmotion-2.4.1.tgz` contained 627 files; packaged CLI version and runtime doctor passed.
- `git diff --check`: passed after whitespace cleanup.

## Known scope

The canonical backlog still contains 199 open contracts. They remain unchecked and are the source of truth for subsequent milestones.
