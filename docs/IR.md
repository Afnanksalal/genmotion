# Creative IR

## Root

`genmotion.json` and its YAML equivalents contain `schemaVersion`, identity, delivery dimensions, frame rate, deterministic seed, shared geometry anchors, typed parameters, variants, reusable compositions, brand tokens, scenes, audio tracks, and string metadata.

All time values are seconds. Keyframe times are local to their layer. Direct animation tracks and optional motion directives also use layer-local time.

## Scenes

A scene owns a background, duration, ordered layers, inbound and outbound transitions, creative reference decisions, and production notes. Layer order is first determined by `z` and then declaration order.

Transition timing and presentation are independent. `presentation` supports `cut`, `crossfade`, `slide-left`, `slide-right`, `push-up`, `zoom`, `blur`, `wipe-left`, `wipe-right`, and `iris`; `timing` accepts every named, cubic-bezier, or spring easing. `mode` places the authored duration before the boundary (`outgoing`), after it (`incoming`), or equally around it (`symmetric`). Legacy `type` and `ease` remain valid fallbacks, so existing schema-v1 projects render identically.

## Typed parameters and variants

`parameters` declares number, boolean, string, color, or enum inputs with validated defaults and constraints. `parameterValues` stores the project's active values. A layer maps a writable property path to a parameter ID through `bindings`; the resolver rejects missing targets and type changes before rendering. Named `variants` supply reusable value sets. CLI `validate`, `frame`, and `render` accept `--variant` and `--params`; `render-variants` renders the complete matrix. The MCP frame and render tools expose the same override surface.

## Reusable compositions

`compositions` are project-local reusable layer graphs with their own dimensions, duration, optional background, and local timeline. A `composition` layer places one graph into a scene or another composition with explicit `timeOffset`, `timeScale`, and `loop`. Rendering is recursive and deterministic; validation rejects unknown references and cycles, and nested time never mutates the source graph.

## Layers

Every layer has:

- a project-unique `id`;
- `start` and optional `duration`;
- integer `z` order;
- visibility, blend mode, optional clip, and tags;
- an explicit transform;
- zero or more arbitrary property tracks;
- zero or more optional named motion directives.
- optional typed parameter bindings and a measured SVG motion path;
- optional parent transform inheritance, declarative constraints, and deterministic stagger timing.

The transform supports animated `x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`, and `blur`, plus normalized anchors. An animated number is `{ "keyframes": [...] }`; a keyframe contains `at`, `value`, and `ease`. Ease may be a named curve, a data-defined cubic-bezier object, or a physical spring object.

## Direct animation tracks

Tracks are the first-class agent animation language. They can target geometry, typography metrics, colors, Bezier controls, shape drawing, video playback, shadow values, or transforms. Values are numeric, CSS colors interpolated in OKLab, two-value points, or four-value rectangles. Each track owns an ID, two or more keyframes, `replace`, `add`, or `multiply` composition, and independent `extrapolateLeft` / `extrapolateRight` behavior. Supported boundary modes are `clamp`, `extend`, `wrap`, `identity`, `loop`, and `ping-pong`; `extrapolate` remains the shared default. `interpolation` selects `linear`, `shortest-angle`, or `discrete`, and a keyframe can set `hold` to retain its value until the next key. Color tracks only support replacement so invalid arithmetic is rejected before rendering.

An optional `noise` modifier adds deterministic fractal motion after keyframe evaluation. Its seed is combined with the project seed and its frequency, octave, lacunarity, gain, and amplitude remain frame-seekable. The same seed and timestamp always produce the same value.

```json
{
  "id": "hero-arc",
  "target": "transform.rotation",
  "operation": "add",
  "extrapolate": "clamp",
  "enabled": true,
  "keyframes": [
    { "at": 0, "value": -8, "ease": "linear" },
    { "at": 0.72, "value": 0, "ease": { "type": "spring", "mass": 1, "stiffness": 170, "damping": 26, "velocity": 0 } }
  ]
}
```

Spring easing is evaluated from mass, stiffness, damping, and initial velocity. `duration` can explicitly set its normalization window; otherwise the engine measures the settling duration. `clamp` removes overshoot without changing the physical response. The SDK exports presets and sampling/analysis helpers, while `easing-inspect` and `genmotion_animation_inspect` expose identical data to CLI and MCP callers.

## Hierarchy, constraints, and stagger

`parentId` inherits a local layer's evaluated parent transform. `constraints` are evaluated in dependency order after tracks and motion paths: `follow` copies a target position with offsets, `look-at` rotates toward it, `maintain-distance` holds a polar separation, and `anchor-to` binds one of nine box anchors to a target anchor. References must remain inside the containing scene or composition; unknown targets and dependency cycles fail validation.

`stagger` shifts a layer's effective local start using `index`, `count`, `each`, `from`, and `seed`. Origin modes are `start`, `end`, `center`, `edges`, and deterministic `random`. `trail` is exposed as an authoring window for downstream trail effects and inspection. CLI, MCP, SDK, renderer, validator, and Studio read the same fields from Creative IR.

Shape layers also accept `shape: "path"` with local SVG path data. The native path kernel measures length and bounds, returns exact point/tangent samples, flattens at a controlled tolerance, and renders animated prefixes from `progress`. Any layer may use `followPath` with animated progress, tangent orientation, and offsets.

### Text

Text layers define a box, local or system font, size, weight, style, color, alignment, line height, letter spacing, fitting, line limit, reveal mode, optional number counting, and shadow. `fit: "shrink"` reduces type only until the text fits its declared box.

### Shape

Shape layers support rectangles, rounded rectangles, ellipses, lines, native cubic Beziers, polygons, and SVG paths. Fill, stroke, radius, shadow, and animated drawing progress are supported. Native Beziers use absolute-canvas `control1` and `control2` points, so the renderer draws the authored curve directly instead of fitting an SVG path into a box.

### Shared geometry anchors

Project-level `anchors` are named canvas points such as `{ "id": "result", "x": 1744, "y": 494 }`. A line or Bezier may bind `startAnchor` and `endAnchor`; an ellipse may bind `centerAnchor`. Every reference is resolved on each rendered frame, after direct animation tracks are evaluated. This makes connector endpoints, rings, dots, and other focal markers share one geometric source of truth.

Unknown or duplicate anchor IDs fail strict validation. References on incompatible shape families fail schema validation. Anchors and absolute Bezier controls are reframed with the project when Studio changes canvas format. Existing schema-v1 projects remain compatible because `anchors` defaults to an empty array.

```json
{
  "anchors": [{ "id": "result", "x": 1744, "y": 494 }],
  "shape": "bezier",
  "x": 430,
  "y": 450,
  "width": 0,
  "height": 0,
  "endAnchor": "result",
  "control1": [820, 450],
  "control2": [1320, 494]
}
```

### Image

Image layers support contain, cover, and fill fitting, source cropping, rounded clipping, compositing, filters, and transforms.

### Video

Video layers support contain, cover, and fill fitting, rounded clipping, trim start, playback rate, source-audio volume, compositing, filters, and transforms. Sources are frozen before frame rendering.

### Captions

Caption layers own timed cues, optional word timings and speakers, typography, highlight color, background, outline, padding, radius, alignment, line limits, and safe-area intent. Rendering is native and exact-frame seekable. The active word can be highlighted without a provider dependency. `captions-import` and `captions-export` convert SRT, WebVTT, and timed JSON; the same conversion is exposed by MCP.

## Motion directives

```json
{
  "recipe": "confident-slide",
  "start": 0.15,
  "duration": 0.6,
  "intensity": 0.8,
  "direction": "left"
}
```

The compiler maps a recipe to renderer-owned absolute keyframes. A layer cannot give two recipes ownership of the same transform property. Direct tracks are applied after recipe compilation and can intentionally replace, add to, or multiply that value.

Search the maintained vocabulary with:

```bash
genmotion catalog "confident product proof"
```

## Reference decisions

Every reference decision contains a catalog reference ID and non-empty `borrow`, `avoid`, and `transform` lists. This makes the creative rationale inspectable while limiting example fixation and imitation.

## Audio

Tracks declare a local asset, position, trim, optional duration, volume, constant-power stereo `pan` from `-1` to `1`, `muted` and `solo` state, fade lengths, loop behavior, role, and whether music should duck under voice. Supported roles are `music`, `voice`, `sfx`, and `source`. When any authored track is soloed, only unmuted solo tracks enter the mix. The final mix is stereo, voice-aware, peak-limited, and trimmed to the project duration.

## Determinism

The project may not depend on wall-clock time, remote assets, network state, implicit browser layout, or unseeded randomness. Rendering the same project and local assets at the same frame number produces identical native pixels.
