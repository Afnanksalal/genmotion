# Declarative native effect SDK

Custom effects use `type: "custom"` and a versioned `kernel` expression graph. Graphs are data: they cannot contain scripts, URLs, imports, loops, recursion, filesystem access, network access or dynamic operation names. The SDK validates the graph before constructing fixed native-CPU evaluators; it does not use `eval` or generated JavaScript source.

```json
{
  "id": "custom-grade",
  "type": "custom",
  "amount": 1,
  "kernel": {
    "version": 1,
    "name": "Red gain",
    "uniforms": {"gain": 1.2},
    "rgba": [
      {"op":"multiply","args":[{"op":"input","name":"r"},{"op":"uniform","name":"gain"}]},
      {"op":"input","name":"g"},
      {"op":"input","name":"b"},
      {"op":"input","name":"a"}
    ]
  },
  "kernelUniforms": {"gain":{"keyframes":[{"at":0,"value":1},{"at":1,"value":1.5}]}}
}
```

Inputs are normalized pixel-center `x`/`y`, local `time` in seconds, output `width`/`height`, and straight encoded-sRGB `r`/`g`/`b`/`a`. Uniform declarations supply finite defaults. `kernelUniforms` supplies optional native animated overrides; undeclared names are rejected.

Expression operations are `constant`, `input`, `uniform`, `sample`, `add`, `subtract`, `multiply`, `divide`, `min`, `max`, `pow`, `atan2`, `step`, `noise`, `abs`, `sin`, `cos`, `floor`, `ceil`, `fract`, `sqrt`, `negate`, `clamp`, `mix` and `smoothstep`. Operands are in `args`. Step uses `(edge, value)`, smoothstep uses `(edge0, edge1, value)`, clamp uses `(value, minimum, maximum)`, and mix uses `(from, to, progress)`. Noise is project-seeded interpolated lattice noise in two dimensions.

Sample expressions contain `x`, `y`, `channel` and optional `edge` (`transparent`, `clamp` or `repeat`). Coordinates are normalized input-canvas coordinates. Bilinear sampling uses premultiplied channels and returns straight color plus alpha, preventing color contamination from transparent texels. The graph reads the current pass input only; output writes cannot feed back into the same pass.

RGBA outputs clamp to 0–1 and store SDR RGBA8. Effect amount mixes original and generated pixels in premultiplied space. Intermediate operation results clamp to ±1e9; division by nearly zero, invalid powers and non-finite arithmetic produce zero. Time inputs also clamp to this numeric range. This is not a floating-point HDR compositor or a GPU shader API.

Limits are 128 expression nodes, 16 nested levels, eight sample expressions, 32 uniforms and two billion expression-node evaluations per frame. Validation is iterative so oversized nesting is rejected before evaluator construction. The compiled graph cache contains at most 16 entries. `inspectNativeKernel` reports node/sample counts and uniforms; effect-stack estimates include these diagnostics.

The SDK exports `nativeKernelSchema`, `inspectNativeKernel` and `runNativeKernel`. Studio adds an identity custom effect with graph and animated-uniform editors. Shared CLI/MCP project editing and rendering consume the same schema. Graphs can be distributed as versioned JSON and copied between effects stacks. Kernel execution, rejection and sampling regression cases are written and await the deferred QA pass.
