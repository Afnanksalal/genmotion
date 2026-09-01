# Rendering operations

Run `genmotion doctor --json` before the first render on a machine. Keep FFmpeg and ffprobe on `PATH`.

Use draft quality for timing iteration and high quality for accepted delivery. Draft keeps the logical project size, standard guarantees at least a 1280-pixel long edge, and high guarantees at least a 1920-pixel long edge while rasterizing vectors and type directly at that size. Use `--resolution WIDTHxHEIGHT` for an exact even-sized delivery contract with the same aspect ratio. Let Genmotion select worker count unless memory pressure or competing workloads justify an explicit `--workers` limit. Hardware encoding is opt-in because availability and output behavior vary by platform.

Video layers are frozen into `.genmotion/media`. If a source, trim, frame rate, duration, or playback rate changes, Genmotion invalidates and rebuilds that cache. Do not manually edit cache contents.

Use `genmotion validate --strict` before a final render. An error blocks rendering; a warning is a review obligation. Use `genmotion frame` around every transition, dense text frame, deepest camera state, and final hold.

For every scene boundary, inspect at least the native frames immediately before, at, and immediately after the boundary (`boundary - 1/fps`, `boundary`, `boundary + 1/fps`). The sequence must move forward without a blank flash, a repeated transition start, a backward pose jump, a luminance dip, or a one-frame crop/scale discontinuity. A contact sheet samples too sparsely to prove this. When both `transitionOut` and the next `transitionIn` are active, keep their type and easing identical; use one side only when the transition does not need to straddle the boundary. Do not stack a full-scene fade-to-black with a scene transition unless the blackout is intentional.

After rendering, use `genmotion probe` and generate a contact sheet. Inspect the opening, ending, every transition family, captions, product evidence, and any high-motion frame. Decode or play the actual encoded output when audio, source video, or transitions are important; native stills alone cannot expose encoder cadence, stale-frame playback, or an audio edit that lands off the visual cut.

On interruption, Genmotion terminates workers and the encoder and removes the incomplete silent intermediate. Preserve the project, source assets, final master, concepts record, and provenance; remove obsolete caches only after acceptance.
