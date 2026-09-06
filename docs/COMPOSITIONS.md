# Reusable compositions and source time

Composition definitions contain local `width`, `height`, `duration`, `layers`, optional `background`, optional `fps`, and optional typed `parameters`. Composition layers reference `compositionId`, define their destination rectangle, and supply optional `parameterValues` overrides. Native rendering scales local coordinates to that rectangle. `clipToBounds: true` clips children to the local canvas. Existing projects retain their previous unclipped behavior when omitted.

Local parameters shadow project parameters; structured values can pass through nested instances. See [Parameters](PARAMETERS.md). Source definitions stay reusable in the saved document. At load time, distinct overrides create deterministic evaluated definitions, before motion compilation and asset preparation. Identical overrides share the same evaluated definition. Cycles, missing compositions, unknown local parameters, and invalid overrides fail before drawing.

## Time controls

All offsets and intervals are seconds, while `freeze.frame` is a zero-based source frame at the composition's FPS (or project FPS when omitted). Local FPS quantizes source evaluation; compositions without an explicit FPS preserve subframe evaluation.

| Instance property | Meaning |
| --- | --- |
| `timeOffset` | Source-time offset; negative offsets are allowed. |
| `timeScale` | Nonzero playback multiplier; negative values play backwards. Pair reverse playback with an offset near the source end. |
| `trimBefore`, `trimAfter` | Seconds removed from the beginning and end; removing the entire source is rejected. Source time zero begins at the trimmed start. |
| `loop` | Repeats the trimmed source interval when true. |
| `loopMode` | `repeat` (default) or `ping-pong`. Each traversal counts once. |
| `loopCount` | Optional positive number of traversals. Omit for unlimited repetition. The terminal traversal holds its final source frame, or the first frame after an even ping-pong count. |
| `timeRemap` | A constant or native numeric keyframe curve that directly selects source seconds relative to the trimmed start, replacing scale and offset. Looping and trimming still apply. |
| `freeze` | `{ "frame": 15 }` holds that source frame throughout the instance. Add `from` and/or `to` to hold only during a local-time interval. `from` is inclusive and `to` is exclusive. Outside the interval, normal source mapping resumes. |

The source endpoint is exclusive. A sample beyond the source holds the last source frame instead of evaluating at a time when every child is inactive. Frame holds are clamped to the trimmed source interval. A frame outside the untrimmed source is rejected. Negative samples on a repeating instance wrap deterministically.

```json
{
  "id": "badge-instance",
  "type": "composition",
  "compositionId": "badge",
  "x": 100, "y": 80, "width": 400, "height": 200,
  "parameterValues": { "headline": "Hello" },
  "loop": true, "loopMode": "ping-pong", "loopCount": 3,
  "freeze": { "frame": 15, "from": 0.5, "to": 1.2 },
  "clipToBounds": true
}
```

Studio's composition-layer inspector edits instance values, trims, loop mode/count, clipping, remapping, and frame holds. Enter JSON `null` in the remapping or freeze editor to remove that setting; clear the loop-count field to restore unlimited repetition. CLI/MCP project-save, project-patch, and semantic property edits address the same Creative IR. The SDK exports the pure `compositionTime` mapper for inspection and uses it in native preview/export.

Validation includes `tests/composition-time.test.ts`, independent native RGBA instance and freeze checks in `tests/composition-parameters.test.ts`, and Studio browser coverage for saving and removing instance time controls. Older documents omit the added optional fields and retain their prior behavior, apart from the corrected final-frame hold.

These controls map visual composition time. They do not yet provide nested audio retiming, automatic duration calculation, premount/postmount scheduling, component import packages, or a full nested timeline editor.
