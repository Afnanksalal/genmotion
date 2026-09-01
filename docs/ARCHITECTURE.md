# Architecture

## Design boundary

Genmotion separates creative reasoning from frame execution.

```text
brief + local assets + references
  -> Hermes ACP, Codex, or Claude creative direction
  -> schema discovery and revision-safe IR patches
  -> native frame inspection and iteration
  -> accepted typed Creative IR
  -> optional recipe compilation + direct track evaluation
  -> validation
  -> native frame workers
  -> ordered raw-frame encoder
  -> audio mix
  -> output verification
```

The agent owns creative choices; the renderer owns faithful execution. Every accepted frame remains an evaluation of frozen project data at an absolute timestamp, so export is reproducible without constraining what the agent may design.

Export resolution is a render contract separate from the logical project coordinate system. Draft renders use native project dimensions, standard renders guarantee at least a 1280-pixel long edge, and high renders guarantee at least a 1920-pixel long edge. The canvas scales before any scene drawing, so vector geometry and text are rasterized at delivery resolution instead of being enlarged after encoding. Explicit even-sized resolutions are accepted only when they preserve the project aspect ratio.

## Studio boundary

Genmotion Studio is a local authoring client over the same Creative IR. It does not render HTML into video and it does not maintain a second proprietary timeline. Project edits pass through schema validation, optimistic revision locking, atomic replacement, and recoverable history before the native renderer sees them.

The Studio server binds to loopback by default and issues a per-process mutation token. State-changing routes require that token. Asset uploads are size bounded, extension allowlisted, signature checked, normalized, content addressed, and confined to the project. Browser responses include a restrictive local Content Security Policy.

Studio-only workflow coordinates, note nodes, reference annotations, render jobs, and agent requests live under `.genmotion/`. The deliverable project remains portable without this authoring state. Agent requests include selected scene, layer, and frame context and are resolved explicitly after the requested edit passes validation.

## Taste system

The taste catalog has three maintained units.

### Motion recipes

A recipe describes a reusable move, its semantic roles, suitable energy, signature behavior, duration range, controlled properties, incompatible recipes, render cost, and accessibility constraints. Recipes are optional starting points. Agents can instead author direct property tracks without selecting any recipe.

### Taste references

A reference is an original abstract design study rather than copied artwork. It records composition, hierarchy, motion, pacing, typography, surface treatment, keywords, provenance, and license. Every use must state:

- what the concept borrows;
- what it avoids;
- what it transforms for the current product.

Retrieval uses relevance plus maximal marginal diversity so a concept is not built from several near-identical references.

### Scene blueprints

A blueprint is a semantic phase structure with normalized ranges, roles, slots, a signature move, and production constraints. It coordinates motion recipes but does not prescribe visual assets or product copy.

## Agentic authoring

The primary planner is the user's configured Hermes runtime or authenticated local Codex or Claude Code installation, not a built-in provider call and not a template selector. Project creation starts from a neutral artboard. The agent discovers the complete schema, reads the current revision, applies granular RFC 6902 transactions, validates, receives actual PNG frames, and inspects evaluated timeline state. Studio exposes the same project to the human for direct manipulation.

No model API key is stored by Genmotion. Hermes Studio turns use the official ACP SDK over private stdio and receive a project-scoped Genmotion MCP server during session creation. Permission requests are limited to Genmotion tools, read-only reasoning, and edits whose reported paths remain inside the project. Claude Studio turns receive a project-scoped stdio MCP configuration; Codex Studio turns use the registered Genmotion MCP server. Genmotion does not ship a deterministic scene planner or template-generated substitute for agent direction.

## Creative IR

The IR is JSON or YAML and validated by Zod. Agents author content, hierarchy, layers, assets, timing, reference decisions, SVG paths, and arbitrary numeric property tracks with replacement, additive, or multiplicative composition. Track timing supports named curves, data-defined cubic-bezier curves, springs, clamping, loops, and ping-pong playback. They do not need to author native renderer code.

Optional motion directives compile into absolute keyframes before validation and rendering. Direct tracks are evaluated afterward and therefore may deliberately replace, add to, or multiply the compiled value. Recipe conflicts still fail compilation instead of producing order-dependent animation.

## Native renderer

`@napi-rs/canvas` supplies native Skia text, vector, compositing, filtering, and image rasterization. Video sources are frozen into deterministic local frame caches through FFmpeg. Fonts are registered from local files before drawing.

Frame workers receive an immutable project and one frame number at a time. They return raw RGBA buffers using transferable `ArrayBuffer` ownership, avoiding PNG compression and IPC copies on the encode path.

The coordinator:

1. starts a persistent worker pool;
2. dispatches frames dynamically to avoid slow-worker imbalance;
3. holds only the small out-of-order window produced by active workers;
4. writes contiguous raw frames to FFmpeg as soon as they are ready;
5. overlaps rasterization and encoding with stream backpressure;
6. terminates every worker on success, error, or cancellation.

This architecture scales with useful local concurrency without splitting each render into expensive process launches.

## Media and audio

Image and video assets must resolve inside the project directory. Remote URLs and parent-directory escapes are rejected.

Video layers are decoded once into a content-aware local cache based on source file size, modification time, frame rate, trim, duration, and playback rate. The render workers reuse those frames.

Audio tracks support positioning, trimming, bounded looping, gain, fades, and roles. Voice tracks can drive sidechain compression on marked music tracks. All tracks are mixed without normalization inflation, limited to a safe peak, trimmed to the project duration, and encoded as AAC.

## Validation

Validation checks:

- schema and finite numeric values;
- unique scene and layer identifiers;
- local asset and font availability;
- scene, layer, and transition bounds;
- strictly increasing keyframes;
- opacity and scale ranges;
- text frame bounds, safe edges, and background contrast;
- reference existence and decision completeness;
- audio duration and fade compatibility.

Rendering is blocked by errors. Warnings can be promoted through `--strict`.

After encoding, ffprobe verifies resolution and duration against the project contract. A successful FFmpeg exit alone is not treated as delivery success.

## Extension model

New layer types belong in the schema, native drawing implementation, validator, Studio, and tests together. Most new creative behavior should be expressed as agent-authored property tracks or SVG paths rather than hardcoded renderer branches. Recipes remain useful shared motion DNA and require metadata plus accessibility guidance; they are never required for a valid composition.
