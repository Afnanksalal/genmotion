# Reversible reference preparation

The versioned reference-preparation graph preserves raw media and records every extracted frame/audio stream, crop, matte, clean plate, measurement and generated derivative as a content-hashed node. Each prepared node retains parent IDs and hashes, tool/version/settings, exact source-to-output time spans, and normalized regions explicitly classified as retained or replaced.

Generated derivatives must declare replaced regions. Parent mismatches, missing parents and cycles fail schema validation. `verifyReferencePreparation` checks every frozen file; `removeReferencePreparationBranch` reversibly removes a chosen node and all dependent work without touching independent branches.
