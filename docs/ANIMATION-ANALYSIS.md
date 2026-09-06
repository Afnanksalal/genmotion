# Velocity and acceleration

The SDK `analyzeTrack(track, options)` samples the native evaluator and returns component arrays for value, velocity (units/second), and acceleration (units/second²). Numeric, point and rectangle tracks are supported. Colors, gradient paints and SVG paths do not have a property-unit derivative and are rejected.

Studio's **Velocity and acceleration** button on each direct animation track opens three plots. Blue, pink, green and amber represent components in order. The plots use the current inspector track and project seed, including unsaved edits. They are read-only and introduce no separate animation state.

The default range is first to last keyframe, with 121 samples and a central finite-difference interval of 0.0001 seconds. SDK/MCP options allow `start`, `end`, `samples` (2–4096), `step` (0.0000001–1 seconds), and `seed`. Derivatives are numerical estimates, independent of FPS. Smaller steps can amplify floating-point error; they do not guarantee higher accuracy.

At keyframes and repeated loop/ping-pong boundaries, derivative arrays are `null` and plots leave gaps. The same applies to identity extrapolation, numerical overflow and timestamps too large to represent the requested step. Interior holds produce zero derivatives. The evaluator includes seeded procedural noise. A non-increasing or unrepresentable time range is rejected.

```sh
genmotion track-analyze track.json --samples 181 --step 0.0001 --seed 42
```

`track.json` contains one Creative IR animation track. MCP `genmotion_animation_inspect` accepts `{"action":"kinematics","track":{...},"options":{"samples":181}}`. The authenticated Studio `/api/track-analysis` endpoint accepts the same `track` and `options` fields. Existing project schemas and animation behavior are unchanged.
