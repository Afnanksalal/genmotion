# Contributing

Use Node.js 22 or newer with FFmpeg and ffprobe on `PATH`.

```bash
npm ci
npm run check
npm run test:coverage
npm run test:studio-e2e
npm run benchmark
```

Coverage gates are enforced at 85% lines/statements, 90% functions, and 70% branches across the production modules included by `vitest.config.ts`. Browser interaction tests are separate because Studio's client is shipped as a CSP-protected embedded application and is exercised through Chromium rather than Node instrumentation.

Changes to the IR require schema, validation, rendering, documentation, and tests in the same pull request. Motion recipes require catalog metadata, a deterministic implementation, an accessibility constraint, and an observable render test. Taste references must be abstract original studies with provenance and a distributable license. Do not add copied frames, logos, artwork, or reverse-engineered proprietary templates.

Keep renderer behavior independent of wall-clock time, network access, and process scheduling. New caches must include all inputs that affect pixels.
