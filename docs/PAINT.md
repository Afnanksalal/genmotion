# Native gradient paint

Text and shape layers accept optional `gradientFill`. Shapes also accept `gradientStroke`. A gradient overrides the corresponding solid color without removing it; disabling the gradient restores that color. Existing projects retain their solid paints.

```json
{
  "type": "linear",
  "angle": 0,
  "center": [0.5, 0.5],
  "radius": 0.5,
  "stops": [
    { "offset": 0, "color": "#66edc0" },
    { "offset": 1, "color": "#9d5fe9" }
  ]
}
```

Types are `linear`, `radial`, and `conic`. Coordinates are relative to the layer box. Linear angle zero points right; positive angles turn clockwise. Conic angle zero starts at the right and advances clockwise. Radial radius is relative to the larger box dimension. Center coordinates allow −8…8; radius allows .001…8. Gradients contain 2–256 ordered stops in 0…1, including alpha. Coincident stops form hard edges. The native backend's coincident-stop ordering is probed once and normalized; conic angle rotation is implemented through stop rotation to avoid the bundled canvas backend's ignored start-angle argument.

Direct animation tracks target `gradientFill` or `gradientStroke`. Matching gradient types and stop counts interpolate geometry, stop positions, and colors in Oklab. Preserve ordered correspondence between stops; mismatched structures fail preflight unless the track explicitly uses discrete interpolation. Gradient tracks use replace operations and refuse procedural noise. Standard easing, holds, loops, and side-specific extrapolation determine the track clock; gradient progress clamps to 0…1.

Studio exposes gradient toggles, kind, angle, center, radius, and ordered stops. Direct tracks expose complete gradient keyframes. CLI/MCP project edits, parameter bindings, and SDK rendering use the same schema; SDK helpers `createGradient` and `interpolateGradient` are exported. Native pixel tests cover all kinds, alpha, conic angle rotation, and intermediate animation. Browser tests save and reload animated paint. `scripts/verify-gradients.mjs` renders a native contact sheet of the three fills and gradient text.
