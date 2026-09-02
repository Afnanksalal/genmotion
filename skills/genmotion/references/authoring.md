# Authoring Genmotion projects

Read the repository `docs/IR.md` when a field or layer contract is unclear.

Keep authored time absolute and reproducible. A scene owns its local timeline; a layer owns direct property tracks, local keyframes, and optional motion directives. Do not use wall-clock data, remote media, or generated renderer code.

Use scene purposes as production facts, not aesthetic labels. “Show the verified result after submission” is useful. “Cool futuristic scene” is not.

Choose layer boxes at delivery resolution. Text layers need explicit dimensions and should normally use `fit: "shrink"`. Use licensed local font files for a delivery master. System-font fallback is acceptable only during early planning.

Direct tracks are the primary open-ended animation surface. Use them for geometry, typography, drawing progress, media playback, shadows, and transforms with named, cubic-bezier, or spring timing. `replace`, `add`, and `multiply` make composition order explicit. Named motion directives are optional reusable motion DNA; run `genmotion catalog` when that vocabulary helps rather than forcing a scene into it.

Use `genmotion_schema` before authoring unfamiliar fields, `genmotion_project_patch` for granular revision-safe edits, `genmotion_timeline_inspect` for evaluated state, and `genmotion_frame` to inspect actual native pixels. A valid JSON edit without a visual check is not a completed visual change.

Use a shape line only when it connects or emphasizes something meaningful. Use background atmosphere to create depth, but keep it subordinate to the focal message. Avoid equal card grids, generic gradient blobs, fake HUD readouts, random particles, repeated spring entrances, and constant ambient motion.

When multiple layers must meet at one canvas point, define that point once in project-level `anchors`. Bind line or native Bezier endpoints with `startAnchor` / `endAnchor`, and bind focal ellipses with `centerAnchor`. Do not duplicate destination coordinates across connectors, rings, and dots.

Prefer native `shape: "bezier"` with absolute-canvas `control1` and `control2` for smooth routed curves. It preserves the authored curve and supports seek-safe `progress` drawing. Reserve SVG `path` for silhouettes and compound artwork, not semantic connector geometry. Strict validation rejects dangling anchor references, duplicate anchor IDs, and anchor properties on incompatible shapes; fix the model instead of visually compensating with nearby coordinates.

For captured product media, establish the whole surface before a deep crop. Land camera movement on a real feature or result and hold it. Do not leave half a navigation bar or panel edge in frame.

## Camera moves and scene handoffs

Author camera motion as four phases: establish, travel, settle, and hold. A move should reach its subject before explanatory copy appears. Use a small settle only when it improves physicality; do not add an automatic overshoot, yoyo, or return to `scale: 1` at the end of every scene.

When consecutive scenes use the same image, video, or camera coordinate system, treat them as one continuous shot even if they serve different narrative purposes. The outgoing layer's final `src`, `fit`, crop/media time, `x`, `y`, `scaleX`, `scaleY`, `rotation`, `anchorX`, and `anchorY` must match the incoming layer's initial values for the whole transition overlap. Hold the incoming state until the host transition has finished, then begin the next camera move. Delay labels and callouts until that move settles.

If the next scene genuinely needs a discontinuous composition, make it an intentional new shot with a cut or a visibly motivated transition. Never crossfade two differently transformed copies of the same source: the result reads as double exposure, a crop snap, or an accidental second zoom.

Do not perform a fast zoom-out solely to reach a convenient neutral state before a seam. Carry the focused pose forward, use a shallow exit that remains continuous, or keep the entire camera move in one scene.
