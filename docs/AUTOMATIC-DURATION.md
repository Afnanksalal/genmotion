# Automatic content duration

Implemented in 2.4.0. See the [milestone QA report](MILESTONE-QA-2026-09-07.md) for tested paths and remaining acceptance limits.

Scenes and reusable compositions can declare `durationMode: "content"`. The resolver computes their duration after parameter bindings and nested composition specialization. The ordinary numeric `duration` remains required as an editable explicit-mode default. `durationPadding` optionally adds seconds after the last finite content boundary.

Finite boundaries come from explicit layer durations, caption cue endings and bounded composition playback. Composition calculations account for source duration, trims, time scale, time offset and forward finite loop counts. Reverse nonlooping playback requires a positive source offset that gives it a finite span. A finite freeze interval extends the inferred span through its end. Explicit layer duration takes precedence over inference.

Durationless static layers, remapped clips, indefinite freezes, unbounded loops and reverse loop playback do not establish a finite boundary. They can fill a container whose duration is established by another finite clip. An automatic container with no finite boundary is refused rather than assigned an arbitrary duration. Hidden layers retain their authored duration contribution. This mode does not probe video/audio file lengths or infer a desired text hold from an entrance animation.

A duration parameter binding and content duration cannot both control the same container. Nested content durations resolve from the inner definitions outward; normal composition cycle checks still apply. Calculated scene durations feed project duration, timeline navigation, live editing context and native rendering. Studio exposes scene duration mode and padding; composition fields are available through the typed source editor, CLI, MCP and SDK.
