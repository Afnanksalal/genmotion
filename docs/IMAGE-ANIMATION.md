# Image sequences and sprite sheets

An image layer can define `sourceAnimation` without changing its geometry, masks, effects, transforms or blend behavior. Its existing `src` remains the static source when animation is removed and is the sheet source for sprites.

```json
{"type":"sequence","frames":["assets/frame-000.png","assets/frame-001.png"],"fps":24,"rate":1,"startFrame":0,"reverse":false,"loop":"repeat"}
```

The explicit ordered list supports up to 10,000 local frame paths. Frames resolve through the existing project path confinement and decoded image cache. Different frame dimensions use the layer's configured fit mode. All paths participate in asset validation, bundle dependency copying, storyboard fingerprints and Studio asset usage counts, including composition definitions.

```json
{"type":"sprite","columns":8,"rows":4,"count":30,"margin":0,"gap":0,"fps":12,"rate":1,"startFrame":0,"reverse":false,"loop":"ping-pong"}
```

Sprite frames are row-major cells. Margin surrounds the grid and gap separates cells, in source pixels. Source dimensions must divide into positive integer cell dimensions. Count can omit unused cells at the end of the sheet. An image crop on a sprite uses cell-local source pixels and must remain inside the cell.

Playback uses layer-local time and the source FPS, independently of output FPS. Hold clamps at the last frame, repeat wraps, and ping-pong traverses both directions without duplicating endpoint frames. Reverse reflects the resulting frame index. Start frame offsets the playback clock before looping. Fractional frame times are floored; no wall clock or browser animation is involved.

Optional `sourceFrame` overrides automatic playback with a frame index or native numeric keyframes, clamped to the source frame range. It supports explicit holds, arbitrary frame ordering and seek-safe retiming. Generic numeric tracks can target `sourceFrame`. Removing the override resumes automatic source playback.

Studio's image inspector exposes source animation, sequence path editing, sprite grid controls, looping, reverse, rate and explicit frame animation. CLI/MCP use the shared project schema and semantic property edits. Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
