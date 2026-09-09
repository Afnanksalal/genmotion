# Native SVG path geometry

## Direct node editing

Studio's path inspector now opens a node-and-handle editor. It exposes corner, smooth and symmetric modes, drag or keyboard movement, curve splitting and node removal. The SVG view is an authoring guide in source-path coordinates; accepted edits update the canonical path and native preview through the shared editing transaction. Path effects and animated tracks still apply after the edited base geometry.

The shared `path-nodes` semantic operation accepts a stable layer target, the inspected path hash, and typed node edits. `query: {kind: "path-nodes", target}` returns contours, nodes and handles. SDK helpers are `inspectPathNodes`, `editPathNodes` and `serializePathNodes`; CLI, MCP and the live Studio bridge use the same command schemas. Each accepted batch is one undo step.

Smooth handles retain the opposite handle length while aligning tangents; symmetric handles also mirror its length. Splitting uses de Casteljau subdivision to preserve the curve, downgrading affected symmetric endpoints to smooth when their handle lengths change. Removing a node retains neighboring handles and intentionally changes the connecting curve. A contour retains at least its move point; removing the entire path remains a layer operation.

Line and quadratic segments become equivalent cubic controls. Arc input is converted through Skia's native Bezier representation. Node modes are stored separately as `pathEditState` with the exact source-path hash. Stale modes require an explicit reset; stale geometry revisions are refused. Interactive editing is bounded to 4096 nodes and 500 operations per batch. A close command followed directly by another drawing command requires an explicit new move for this editor. The renderer continues to support such source paths.

Implemented in 2.4.0. See the [milestone QA report](MILESTONE-QA-2026-09-07.md) for tested paths and remaining acceptance limits.

Genmotion parses the SVG path-data grammar described in the [SVG 2 path specification](https://www.w3.org/TR/SVG2/paths.html#PathDataBNF). This includes absolute and relative moveto, line, horizontal/vertical line, cubic and quadratic curves, smooth reflected curves, elliptical arcs, and closepath commands. Repeated tuples, implicit lineto after moveto, exponent notation, compact decimals, and adjacent arc flags are supported.

`parseSvgPath` returns command/value records. `absoluteSvgPath` converts them to absolute `M`, `L`, `C`, `Q`, `A`, and `Z` commands, expanding reflected controls while preserving curve geometry, closed contours, and disconnected subpaths. `serializeSvgPath` emits validated path data. Arc radii are normalized to positive magnitudes. Malformed syntax and nonfinite coordinate overflow fail explicitly; parsing is bounded to 10 MB and 100,000 commands.

`normalizePath` now uses this canonical representation. Earlier versions approximated everything as a connected polyline with four-decimal coordinates, losing closure, curves, and subpath separation. The legacy tolerance argument remains accepted and validated, but canonical normalization does not approximate geometry. Call `flattenPath` explicitly when sampled points are needed. Length, bounds, and sample queries parse and canonicalize before calling the native geometry libraries.

```powershell
genmotion path-inspect "m10 10 c0 10 10 10 10 0 z m40 0 h10 v10 z" --progress 0.5
```

The CLI returns parsed commands, absolute commands, normalized data, length, bounds, and a tangent/normal sample. MCP's `genmotion_path_inspect` returns canonical normalization with its existing inspection results. SDK consumers can import all functions from `genmotion`. Studio offers **Normalize path** and **Normalize motion path**, validates through `/api/path`, then saves through the shared revision-safe project transaction. Switching a shape to path initializes a valid rectangular path from its bounds.

Tests cover grammar rejection, canonical idempotence, reflected controls, subpath origins after closure, and exact native RGBA equality before/after normalization for both fills and strokes. The browser test verifies conversion and persistence in the real shape inspector.

## Declarative geometry operations

Path shapes may define an ordered `pathOperations` array. The authored path remains intact; native drawing evaluates the operations after parameter and animation-track evaluation. Studio's path inspector adds, edits, and removes operations. The same schema is available through project transactions, CLI `path-operate`, MCP `genmotion_path_operate`, and SDK `applyPathOperations`.

| Operation | Parameters |
| --- | --- |
| `union`, `intersection`, `subtract`, `exclude` | Operand SVG `path`; exclusion is symmetric difference. |
| `transform` | Affine `matrix: [a,b,c,d,e,f]`. |
| `stroke` | Positive `width`, `join` (`miter`, `round`, `bevel`), `cap` (`butt`, `round`, `square`), positive `miterLimit`. Produces a fillable stroke outline. |
| `round` | Nonnegative corner `radius`. |
| `trim` | Fractions `start` and `end` in ascending order, optional `complement`. Curves and separate contours are retained. |
| `dash` | Positive `on`/`off` lengths and signed `phase`. |
| `simplify` | Resolves overlapping geometry through native Skia simplification. |
| `reverse` | Reverses each contour, swaps Bezier controls, and preserves closure. |
| `cut` | Splits at normalized path-length fraction `at`, retaining both pieces as separate contours. Use `subpaths` to keep one piece. |
| `translate` | Adds `x`/`y` to path coordinates. |
| `scale` | Multiplies coordinates by `x`/`y` around `origin: [x,y]` (default zero). Negative scales mirror geometry. |
| `center` | Moves the bounds center to `x`/`y` (default zero). |
| `subpaths` | Retains contours in the requested zero-based `indices` order; rejects missing or duplicate indices. An empty list produces an empty path. |
| `subdivide` | Splits each curve into `divisions` (1–256) using de Casteljau subdivision. Curves remain curves. |
| `warp` | Maps bounds to four `corners` in top-left, top-right, bottom-right, bottom-left order. Bilinear mapping uses deterministic curve subdivision (`divisions`, default 16), including closing edges. |

```json
[
  { "op": "subtract", "path": "M20 20H50V50H20Z" },
  { "op": "round", "radius": 4 },
  { "op": "stroke", "width": 3, "join": "round", "cap": "round", "miterLimit": 4 }
]
```

Operations use the installed native Skia PathKit implementation. Output is converted to winding fill so serialized boolean holes remain holes. Empty results are valid and draw nothing. Computed paths are cached under a per-runtime bound of 128 entries and 16 MiB of retained key/result strings. There is a maximum of 128 operations per stack. Invalid operand paths and operation schemas fail validation before accepted project edits are saved.

Path geometry is fitted into the layer's destination rectangle, following the existing path-layer contract. Stroke width remains in project pixels when fitting the geometry. A path-space translation changes coordinates but does not replace the layer-position controls. `progress` stroke reveals now use native curve-preserving trims and do not connect disjoint contours.

## Native shape primitives

Shape layers accept `arc`, `pie`, `callout`, `arrow`, `star`, `spark`, `heart`, `regular-polygon`, `triangle`, `donut`, `ring`, `spiral`, `waveform`, `line-chart`, and `area-chart`. All render through native vector geometry within the layer's width and height. Existing shape documents keep their existing defaults. CLI/MCP project edits use the same schema as Studio; SDK callers can use `nativePrimitivePath` to obtain the generated path in its fixed 1000 × 1000 local coordinates.

| Control | Behavior |
| --- | --- |
| `sides` | 3–256 polygon sides or star/spark points. Defaults: polygon 6, star 5, spark 8. |
| `innerRadius` | Fraction 0–1 for star/spark inset or donut/ring hole. Defaults: star .42, spark .2, ring/donut .65. |
| `startAngle`, `endAngle`, `clockwise` | Arc/pie angles in degrees; defaults 0 to 270, clockwise. Sweeps beyond a revolution become a full circle. |
| `headSize` | Arrow head fraction .01–.99, default .35. |
| `radius` | Callout corner radius in project pixels. |
| `turns`, `startAngle` | Spiral turns .1–50 (default 3), initial angle default −90 degrees. |
| `samples` | 2–10,000 finite samples. Waveforms clamp to −1…1; charts normalize their sample range to the layer height. Constant series use the center line. |

Studio exposes the applicable controls when selecting a primitive. Open shapes default to a stroke when selected. All primitives support existing fills, strokes, transforms, effects, and track animation. The ring hole uses opposite winding and remains transparent. `scripts/verify-primitives.mjs` produces a native contact sheet; unit tests cover deterministic geometry, extreme finite input, ring pixels, and fixed stroke width, while browser tests save star and waveform controls through the shared transaction service.

Verification includes native fill pixels for every boolean operation and hole winding, expanded stroke caps, rounded corners, affine bounds, disjoint-contour trims, dashes, project-renderer integration, and Studio stack editing/persistence. Editable nodes use hash-bound semantic transactions with corner, smooth and symmetric handle modes, direct pointer/keyboard manipulation, splitting, removal and undo. A full shared-geometry dependency editor remains separate backlog work.

Reversal and subdivision preserve native Bezier geometry. Elliptical arcs first convert to Skia's Bezier representation. Corner warping approximates the bilinear image of curves by subdividing and mapping control points; increasing divisions improves accuracy. Geometry expansion is bounded at 100,000 commands. Pure SDK functions `reversePath`, `subdividePath`, `extractSubpaths`, and `warpPath` are also exported. Native fill and path-distance tests verify reversal, curve shape preservation, independent contours, transformed bounds, and corner mapping. Studio browser tests persist and reload a combined reversal/subdivision/warp stack.

## Path morph animation

Path shapes accept animation tracks targeting `path`, with SVG path strings as keyframe values. The target defaults to `path` interpolation; explicit `discrete` interpolation switches between paths. Easing, holds, extrapolation, looping, and independent left/right timing use the shared animation evaluator. Add/multiply and procedural noise are refused for path strings.

`compatiblePaths(from, to)` converts segments to cubics and subdivides shorter contour sequences to matching counts, preserving endpoints and closure. `interpolatePath(from, to, progress)` evaluates those compatible coordinates. Multiple contours are paired in authored order and must have matching open/closed topology. Reverse or reorder subpaths before morphing when their directions or correspondence differ. Topology changes such as creating a new hole require a separate transition or explicit degenerate contour; incompatible tracks fail preflight. Limits are 4096 segments per contour and 100,000 output commands, with a bounded cache for common pairs.

Studio's direct-track target selector initializes path keyframes from the selected path shape and exposes SVG text fields. The same documents render through CLI, SDK, and MCP. Tests verify curve normalization, multiple independent contours, invalid topology diagnostics, deterministic intermediate native pixels, and browser save/reload. `scripts/verify-path-morph.mjs` renders a five-frame native contact sheet showing a square with a hole morphing into a triangle with a hole.
