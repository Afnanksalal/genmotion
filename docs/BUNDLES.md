# Content-addressed project bundles

`createProjectBundle` exports the source project, its selected parameter values, declared media/fonts, inactive variant dependencies, nested parameter defaults/overrides, and local motion libraries. Paths are normalized to portable relative paths. The bundle retains editable native layers, compositions and parameter definitions.

Every dependency has a SHA-256 and byte count. The manifest's content ID covers the engine version, project filename and ordered dependency records using a canonical representation. Identical exports reuse the same directory only after verifying it. Publication uses a private staging directory and atomic directory rename. Failed or cancelled copies remove staging and preserve accepted bundles.

```sh
genmotion bundle project --output bundles
genmotion bundle-verify bundles/CONTENT_ID
genmotion bundle-restore bundles/CONTENT_ID --output working-copy
```

The default limits are 10000 files and 32 GiB, including the project document. SDK callers can lower these bounds and provide an abort signal. Files copy through a bounded stream; input metadata is checked before and after copying. Verification checks manifest identity, actual sizes and hashes, root confinement, duplicate/reserved paths, and coverage of declared dependencies and discovered local recipe libraries. A changed or newly unlisted dependency is refused.

Loading a project beside `genmotion.manifest.json` verifies the bundle before compilation. Canonical editing services treat such a directory as immutable. `restoreProjectBundle` creates a new editable working copy without the manifest after verifying both source and copied bytes; it refuses an existing destination. The original bundle remains unchanged.

Studio's **Create verified project bundle** action writes below `.genmotion/bundles` and returns its folder, content ID and dependency count. MCP `genmotion_bundle` supports creation and verification; SDK exports create, verify and restore operations. Copy the complete bundle folder to another machine; no personal cache is required for its declared dependencies.

The manifest records content identity and the Genmotion version. Full OS/backend/font-shaping/FFmpeg reproducibility envelopes and provider upload caches remain separate checklist requirements. Bundles do not prevent external filesystem mutation; load-time verification detects mutations before a subsequent load. Media preparation may create derived caches after verification.

Implementation verification for the latest API/Studio/restore additions is queued for the final test pass.
