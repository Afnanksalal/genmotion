# Authoring Genmotion projects

Read the repository `docs/IR.md` when a field or layer contract is unclear.

Keep authored time absolute and reproducible. A scene owns its local timeline; a layer owns direct property tracks, local keyframes, and optional motion directives. Do not use wall-clock data, remote media, or generated renderer code.

Use scene purposes as production facts, not aesthetic labels. “Show the verified result after submission” is useful. “Cool futuristic scene” is not.

Choose layer boxes at delivery resolution. Text layers need explicit dimensions and should normally use `fit: "shrink"`. Use licensed local font files for a delivery master. System-font fallback is acceptable only during early planning.

Direct tracks are the primary open-ended animation surface. Use them for geometry, typography, drawing progress, media playback, shadows, and transforms with named, cubic-bezier, or spring timing. `replace`, `add`, and `multiply` make composition order explicit. Named motion directives are optional reusable motion DNA; run `genmotion catalog` when that vocabulary helps rather than forcing a scene into it.

Use `genmotion_schema` before authoring unfamiliar fields, `genmotion_project_patch` for granular revision-safe edits, `genmotion_timeline_inspect` for evaluated state, and `genmotion_frame` to inspect actual native pixels. A valid JSON edit without a visual check is not a completed visual change.

Use a shape line only when it connects or emphasizes something meaningful. Use background atmosphere to create depth, but keep it subordinate to the focal message. Avoid equal card grids, generic gradient blobs, fake HUD readouts, random particles, repeated spring entrances, and constant ambient motion.

For captured product media, establish the whole surface before a deep crop. Land camera movement on a real feature or result and hold it. Do not leave half a navigation bar or panel edge in frame.
