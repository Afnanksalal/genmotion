# Stagger timing

Every layer can add a `stagger` to its authored start time. `index` is zero-based, `count` is 1–100000, and `each`, `delay`, and `trail` use seconds. Existing documents retain their original timing; omitted `delay` is zero.

`from` accepts `start`, `end`, `center`, `edges`, `random`, or `distance`. Center and edges measure index distance; an even-sized center produces half-index distances. Random order is a reproducible permutation keyed by integer `seed`. The evaluator retains at most eight permutations.

Distance uses Euclidean distance from `origin` to `position`, divided by positive `distanceUnit` (default 100), multiplied by `each`, plus `delay`. Coordinates use the containing layer coordinate system. A layer's omitted position is its authored box center. This position stays fixed while animation changes geometry, so moving a layer cannot move its activation time. Explicit origins and positions are two finite numbers. Overflow fails validation; a start outside its container produces a warning.

```json
{"index":0,"count":1,"from":"distance","origin":[0,50],"distanceUnit":100,"each":1,"delay":0.2}
```

Studio exposes these fields in the layer inspector and saves them in the Creative IR. SDK `staggerDelay` evaluates one layer; `staggerSchedule` accepts an array of positions for distance schedules and optional easing for the distribution. `staggerWindows` returns each delay and its `[trailStart, trailEnd]` interval. These intervals are timing helpers for authoring overlapping animations; rendering temporal motion trails is a separate capability.

```sh
genmotion stagger --count 2 --from distance --positions '[[0,0],[300,400]]' --distance-unit 100 --each 0.1 --delay 0.3 --trail 0.2
```

MCP `genmotion_animation_inspect` with `action: "stagger"` accepts the same settings as typed JSON (up to 10000 items per request). Its result includes both the schedule and trail windows. The example yields delays 0.3 and 0.8 seconds. Native activation-boundary, seeded-order, CLI/MCP, and Studio persistence tests cover this contract.
