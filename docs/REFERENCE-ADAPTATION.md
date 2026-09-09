# Declared reference adaptation

The Creative IR stores a versioned `referenceAdaptationMap`. Each entry links a supplied-reference interval and frozen measurement IDs to one or more native scene/layer/property targets. Every target declares whether its pixels are original native design, captured evidence, source-derived media or a generated replacement. Normalized regions and reasons record intentional differences.

Validation checks reference IDs, preparation measurements and native scene/layer identities before rendering. Preparation-node paths join the normal project dependency closure, so portable bundles include and verify them. The render manifest includes map and observation hashes, origin counts, entry counts and validation findings.

Studio exposes the complete sources, preparation graphs, map, observations and inspection report at `/api/reference-adaptation`; the same typed records remain available through the SDK and ordinary Creative IR editing. This preserves the distinction between evidence, derivation and replacement throughout authoring and delivery.
