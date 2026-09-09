# Genmotion 2.7.0 milestone QA

The 2.7.0 milestone advances the canonical capability ledger to **152/324 complete**. It adds native audio DSP and timing inspection, versioned design specifications, inspectable creative preferences, reusable approved workflow bundles, bounded real-product capture, brand candidate ingestion, provider-neutral media acquisition, a project media ledger, reviewed transcription, and reversible segmentation preparation.

## Acceptance evidence

- `npm run check`: lint and TypeScript passed; **96 test files / 310 tests** passed. Tests execute every new audio DSP primitive through FFmpeg and exercise identity, migration, provenance, source invalidation, atomic persistence, byte/time limits and failure reporting.
- `npm run test:studio-e2e`: **55/55** Chromium flows passed, including Design Specification import/audit/reload, locked audio editing, stereo balance, viewport persistence, native preview, export, cancellation and responsive/keyboard flows.
- `npm run examples:build && npm run examples:verify`: all eight editable example projects regenerated; all eight masters passed strict validation. Chromatic Orbit, Route Study and Type / Beat decoded 240 nonblank frames each with deterministic random seeking; Type / Beat also passed unclipped-audio and silent-edge checks.
- `npm run package:verify`: packed `genmotion-2.7.0.tgz` with **695 files**; clean install, SDK import, CLI version and doctor checks passed. This gate caught and fixed a development-only browser dependency before release.

The capture and optional provider workflows preserve local frozen artifacts and report partial or failed execution explicitly. Their provider adapters do not imply that external models, licenses or network access ship with the renderer. Remaining unchecked capabilities in the canonical backlog remain open.
