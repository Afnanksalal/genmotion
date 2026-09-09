# Genmotion 2.9.0 milestone QA

The 2.9.0 milestone advances the canonical capability ledger to **164/324 complete**. It completes the supplied-reference adaptation pipeline and adds purpose-bound export enforcement plus input/output render attestations.

## Acceptance results

- `npm run check` passed lint, TypeScript, package build and **106 test files / 325 tests**.
- `npm run test:studio-e2e` passed **55/55** Chromium Studio/Player tests; Studio adaptation inspection is also covered by the server integration suite.
- `npm run benchmark:studio` sustained **28.95–29.97 FPS** across the 1080p benchmark set with zero p95 frame lag and zero request errors.
- `npm run examples:build` and `npm run examples:verify` regenerated and verified all **eight** 1080p example masters. Deep decoding covered 720 nonblank frames, deterministic random seeking and unclipped audio with silent boundaries.
- `npm run package:verify` validated a clean **749-file** packed install, SDK import, CLI 2.9.0 and runtime doctor.

Unchecked contracts remain open and are not covered by this milestone claim.
