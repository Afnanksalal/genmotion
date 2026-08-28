# Architecture

## Design boundary

Genmotion separates creative reasoning from frame execution.

```text
brief
  -> contrastive taste retrieval
  -> divergent concept generation
  -> critic and feasibility ranking
  -> typed Creative IR
  -> motion compilation
  -> validation
  -> native frame workers
  -> ordered raw-frame encoder
  -> audio mix
  -> output verification
```

The renderer never asks an agent or model how to draw a frame. Every frame is an evaluation of frozen project data at an absolute timestamp.

## Taste system

The taste catalog has three maintained units.

### Motion recipes

A recipe describes a reusable move, its semantic roles, suitable energy, signature behavior, duration range, controlled properties, incompatible recipes, render cost, and accessibility constraints. The engine owns the actual deterministic implementation.

### Taste references

A reference is an original abstract design study rather than copied artwork. It records composition, hierarchy, motion, pacing, typography, surface treatment, keywords, provenance, and license. Every use must state:

- what the concept borrows;
- what it avoids;
- what it transforms for the current product.

Retrieval uses relevance plus maximal marginal diversity so a concept is not built from several near-identical references.

### Scene blueprints

A blueprint is a semantic phase structure with normalized ranges, roles, slots, a signature move, and production constraints. It coordinates motion recipes but does not prescribe visual assets or product copy.

## Creative planning

The deterministic planner works without a model or network. A configured Anthropic or OpenAI-compatible provider can generate additional concepts through a strict JSON contract. Provider output is schema-validated and ranked by the same local critic.

The critic scores coherence, originality, feasibility, hierarchy, and brand fit. It also rejects unknown references, blueprints, and motion recipes. This is deliberately separate from mechanical project validation.

## Creative IR

The IR is JSON or YAML and validated by Zod. Agents author content, hierarchy, layers, assets, timing, reference decisions, and named motion directives. They do not author native renderer code.

Motion directives compile into absolute keyframes before validation and rendering. Only one owner may control a transform property on a layer. Conflicting recipes fail compilation instead of producing order-dependent animation.

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

New layer types belong in the schema, native drawing implementation, validator, and tests together. New motion recipes require metadata, deterministic renderer behavior, and an accessibility constraint. New blueprints must reference existing recipes and cover the full normalized timeline. `genmotion catalog-audit` enforces catalog integrity.
