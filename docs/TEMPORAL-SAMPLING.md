# Native temporal sampling

Set the optional project-level `motionBlur` object to enable deterministic shutter sampling:

```json
{
  "motionBlur": { "shutterAngle": 180, "samples": 4 }
}
```

Each output frame is evaluated at evenly spaced points across a centered shutter interval. The interval is `shutterAngle / 360 / fps`; sample times clamp to the finite project duration. Native RGBA frames are averaged in premultiplied-alpha space, so transparent moving pixels retain correct color and coverage.

The renderer uses at most two samples for draft output, four for standard output and eight for high-quality output. Preview and direct frame rendering use the authored count, bounded by the schema maximum of 16. A zero-degree shutter or one sample evaluates the existing single timestamp without changing pixels.

Project sampling covers the composed native scene, including animated transforms, captions, effects, compositions and transitions.
Sampling may also be scoped with `layer.motionBlur` or an enabled effect's `temporalSampling`. Effect-scoped sampling evaluates the complete isolated layer/effect result at each shutter time, preserving masks and premultiplied alpha. The highest-quality enabled effect request owns the layer sampling plan when no layer override exists.

Layers can add a deterministic historical `motionTrail` with duration, sample count, opacity, and optional directional offset. `motion` trails composite source-over; `directional-light` trails use screen compositing and can offset historical samples to form a light streak. Combined shutter/trail plans are bounded to 64 evaluations and reject larger work rather than allocating without limit.
