# Creative IR

## Root

`genmotion.json` and its YAML equivalents contain `schemaVersion`, identity, delivery dimensions, frame rate, deterministic seed, brand tokens, scenes, audio tracks, and string metadata.

All time values are seconds. Keyframe times are local to their layer. Layer motion directives also use layer-local time.

## Scenes

A scene owns a background, duration, ordered layers, inbound and outbound transitions, creative reference decisions, and production notes. Layer order is first determined by `z` and then declaration order.

Supported transitions are `cut`, `crossfade`, `slide-left`, `slide-right`, `push-up`, `zoom`, and `blur`. Transitions are evaluated from absolute scene time and remain seekable.

## Layers

Every layer has:

- a project-unique `id`;
- `start` and optional `duration`;
- integer `z` order;
- visibility, blend mode, optional clip, and tags;
- an explicit transform;
- zero or more named motion directives.

The transform supports animated `x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`, and `blur`, plus normalized anchors. An animated number is `{ "keyframes": [...] }`; a keyframe contains `at`, `value`, and `ease`.

### Text

Text layers define a box, local or system font, size, weight, style, color, alignment, line height, letter spacing, fitting, line limit, reveal mode, optional number counting, and shadow. `fit: "shrink"` reduces type only until the text fits its declared box.

### Shape

Shape layers support rectangles, rounded rectangles, ellipses, lines, and polygons. Fill, stroke, radius, shadow, and animated drawing progress are supported.

### Image

Image layers support contain, cover, and fill fitting, source cropping, rounded clipping, compositing, filters, and transforms.

### Video

Video layers support contain, cover, and fill fitting, rounded clipping, trim start, playback rate, source-audio volume, compositing, filters, and transforms. Sources are frozen before frame rendering.

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

The compiler maps a recipe to renderer-owned absolute keyframes. A layer cannot give two recipes ownership of the same transform property. Split complex visuals into separate layers when independent motions need independent ownership.

Search the maintained vocabulary with:

```bash
genmotion catalog "confident product proof"
```

## Reference decisions

Every reference decision contains a catalog reference ID and non-empty `borrow`, `avoid`, and `transform` lists. This makes the creative rationale inspectable while limiting example fixation and imitation.

## Audio

Tracks declare a local asset, position, trim, optional duration, volume, fade lengths, loop behavior, role, and whether music should duck under voice. Supported roles are `music`, `voice`, `sfx`, and `source`.

## Determinism

The project may not depend on wall-clock time, remote assets, network state, implicit browser layout, or unseeded randomness. Rendering the same project and local assets at the same frame number produces identical native pixels.
