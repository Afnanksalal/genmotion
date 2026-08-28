# Authoring Genmotion projects

Read the repository `docs/IR.md` when a field or layer contract is unclear.

Keep authored time absolute and deterministic. A scene owns its local timeline; a layer owns local keyframes and motion directives. Do not use wall-clock data, remote media, or generated renderer code.

Use scene purposes as production facts, not aesthetic labels. “Show the verified result after submission” is useful. “Cool futuristic scene” is not.

Choose layer boxes at delivery resolution. Text layers need explicit dimensions and should normally use `fit: "shrink"`. Use licensed local font files for a delivery master. System-font fallback is acceptable only during early planning.

Named motion directives are the preferred authoring surface. Run `genmotion catalog` to inspect the available vocabulary. When two moves need the same transform property, split the content into separate layers instead of depending on animation order.

Use a shape line only when it connects or emphasizes something meaningful. Use background atmosphere to create depth, but keep it subordinate to the focal message. Avoid equal card grids, generic gradient blobs, fake HUD readouts, random particles, repeated spring entrances, and constant ambient motion.

For captured product media, establish the whole surface before a deep crop. Land camera movement on a real feature or result and hold it. Do not leave half a navigation bar or panel edge in frame.
