# Genmotion 2.8.0 milestone QA

The 2.8.0 milestone advances the canonical capability ledger to **160/324 complete**. It adds deterministic batch execution, shared content-addressed inputs, offline semantic catalog search, local catalog feedback, restricted-asset acceptance, supplied-reference export controls and reversible reference preparation.

## Acceptance results

- `npm run check` passed lint, TypeScript, package build and **103 test files / 321 tests**.
- `npm run test:studio-e2e` passed **55/55** Chromium Studio/Player tests.
- `npm run benchmark:studio` sustained **29.78–30.09 FPS** at 1080p across three examples with zero p95 frame lag, at most two frames of instantaneous lag and zero request errors.
- `npm run examples:build` and `npm run examples:verify` regenerated and verified all **eight** 1080p example masters. The three deep-decoded examples produced 720 nonblank frames with deterministic random seeking; the audio example retained unclipped audio and silent boundaries.
- `npm run package:verify` validated a clean **732-file** packed install, SDK import, CLI 2.8.0 and runtime doctor.

The canonical checklist remains authoritative. Unchecked contracts remain open and are not covered by this milestone claim.
