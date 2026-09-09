# Native temporal sampling

Set the optional project-level `motionBlur` object to enable deterministic shutter sampling:

```json
{
  "motionBlur": { "shutterAngle": 180, "samples": 4 }
}
```

Each output frame is evaluated at evenly spaced points across a centered shutter interval. The interval is `shutterAngle / 360 / fps`; sample times clamp to the finite project duration. Native RGBA frames are averaged in premultiplied-alpha space, so transparent moving pixels retain correct color and coverage.

The renderer uses at most two samples for draft output, four for standard output and eight for high-quality output. Preview and direct frame rendering use the authored count, bounded by the schema maximum of 16. A zero-degree shutter or one sample evaluates the existing single timestamp without changing pixels.

Sampling covers the composed native scene, including animated transforms, captions, effects, compositions and transitions. Per-layer and per-effect shutter controls, trails and directional light trails remain open work in the canonical checklist.
