# Exact time and subframes

Animation uses seconds throughout the Creative IR. SDK `renderFrame` and `renderFramePng` accept fractional frame indices: at 30 FPS, index 10.5 evaluates exactly 0.35 seconds. Invalid, negative or non-finite frame indices and invalid FPS are refused before allocating a canvas. Changing the output FPS preserves vector animation at the same timestamp.

SDK helpers `secondsToFrames(seconds, fps, rounding)`, `framesToSeconds(frame, fps)`, `quantizeTime(seconds, fps, rounding)`, and `progressAt(seconds, start, duration, clamp)` make clock conversions explicit. Default frame conversion preserves the fractional part. Rounding accepts `floor`, `ceil`, or `nearest`; quantization defaults to nearest. Helpers accept negative finite times for offset calculations; rendering requires nonnegative time. Invalid rates, zero durations and arithmetic overflow throw.

```sh
genmotion frame project --at 0.35 --subframe --output exact.png
```

CLI frame requests retain their existing floor-to-frame behavior unless `--subframe` is supplied. MCP `genmotion_frame` accepts `subframe: true` with the same semantics and reports the fractional frame and exact time. Exact requests at or beyond the composition end are refused. Ordinary video exports still sample their configured integer frame grid.

Studio's **Go to** transport button accepts exact seconds and previews the fractional native frame. Timeline dragging remains frame-aligned. Both Studio and the native preview server accept `/frame/10.5.png`; malformed frame strings are rejected instead of silently truncated. Preview caches include the fractional index in their keys and retain their existing entry bounds.

Subframes refine continuous vector animation. Video sources still use their prepared source-frame cadence, and composition instances with an explicit local FPS retain that authored quantization. This feature does not synthesize intermediate video frames or imply temporal motion blur.
