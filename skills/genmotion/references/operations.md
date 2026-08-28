# Rendering operations

Run `genmotion doctor --json` before the first render on a machine. Keep FFmpeg and ffprobe on `PATH`.

Use draft quality for timing iteration and high quality for accepted delivery. Let Genmotion select worker count unless memory pressure or competing workloads justify an explicit `--workers` limit. Hardware encoding is opt-in because availability and output behavior vary by platform.

Video layers are frozen into `.genmotion/media`. If a source, trim, frame rate, duration, or playback rate changes, Genmotion invalidates and rebuilds that cache. Do not manually edit cache contents.

Use `genmotion validate --strict` before a final render. An error blocks rendering; a warning is a review obligation. Use `genmotion frame` around every transition, dense text frame, deepest camera state, and final hold.

After rendering, use `genmotion probe` and generate a contact sheet. Inspect the opening, ending, every transition family, captions, product evidence, and any high-motion frame. Decode or play the actual output when audio, source video, or transitions are important.

On interruption, Genmotion terminates workers and the encoder and removes the incomplete silent intermediate. Preserve the project, source assets, final master, concepts record, and provenance; remove obsolete caches only after acceptance.
