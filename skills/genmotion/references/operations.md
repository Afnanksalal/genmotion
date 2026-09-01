# Rendering operations

Run `genmotion doctor --json` before the first render on a machine. Keep FFmpeg and ffprobe on `PATH`.

Use draft quality for timing iteration and high quality for accepted delivery. Draft keeps the logical project size, standard guarantees at least a 1280-pixel long edge, and high guarantees at least a 1920-pixel long edge while rasterizing vectors and type directly at that size. Use `--resolution WIDTHxHEIGHT` for an exact even-sized delivery contract with the same aspect ratio. Let Genmotion select worker count unless memory pressure or competing workloads justify an explicit `--workers` limit. Hardware encoding is opt-in because availability and output behavior vary by platform.

Video layers are frozen into `.genmotion/media`. If a source, trim, frame rate, duration, or playback rate changes, Genmotion invalidates and rebuilds that cache. Do not manually edit cache contents.

Use `genmotion validate --strict` before a final render. An error blocks rendering; a warning is a review obligation. Use `genmotion frame` around every transition, dense text frame, deepest camera state, and final hold.

For every scene boundary, inspect at least the native frames immediately before, at, and immediately after the boundary (`boundary - 1/fps`, `boundary`, `boundary + 1/fps`). The sequence must move forward without a blank flash, a repeated transition start, a backward pose jump, a luminance dip, or a one-frame crop/scale discontinuity. A contact sheet samples too sparsely to prove this. When both `transitionOut` and the next `transitionIn` are active, keep their type and easing identical; use one side only when the transition does not need to straddle the boundary. Do not stack a full-scene fade-to-black with a scene transition unless the blackout is intentional.

For a same-source or same-camera boundary, inspect continuity before rendering as well as pixels afterward:

- Compare the outgoing final and incoming initial `src`, `fit`, crop/media time, `x`, `y`, `scaleX`, `scaleY`, `rotation`, `anchorX`, and `anchorY`. They must match during the overlap.
- Hold the incoming transform through the host transition duration. Start its new pan or zoom afterward, not at local time zero.
- Keep incoming labels, cards, and callouts hidden until the camera move settles. The transition, camera, and copy must not all enter at once.
- Reject a rapid end-of-scene reset to neutral, especially a sub-second zoom from a focused crop back to `scale: 1`. Carry the focused state across the seam or make the next shot an intentional cut.
- Decode the encoded output around the seam. Three identical adjacent frames can indicate a stall, while two differently transformed copies of the same source indicate an unmatched crossfade; both fail even when validation passes.

For every zoom or pan, inspect an establish frame, the deepest/farthest camera state, the settle, and the readable hold. The move should have one destination, stay inside the intended crop, and finish before the scene ends. A schema-valid keyframe track is not proof of good camera direction.

After rendering, use `genmotion probe` and generate a contact sheet. Inspect the opening, ending, every transition family, captions, product evidence, and any high-motion frame. Decode or play the actual encoded output when audio, source video, or transitions are important; native stills alone cannot expose encoder cadence, stale-frame playback, or an audio edit that lands off the visual cut.

On interruption, Genmotion terminates workers and the encoder and removes the incomplete silent intermediate. Preserve the project, source assets, final master, concepts record, and provenance; remove obsolete caches only after acceptance.
