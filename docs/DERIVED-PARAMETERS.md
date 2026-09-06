# Derived parameters and preflight bindings

Implemented in 2.4.0. See the [milestone QA report](MILESTONE-QA-2026-09-07.md) for tested paths and remaining acceptance limits.

A typed parameter can declare `derive` as a JSON expression. Dependencies resolve before layer bindings, composition specialization, motion compilation and asset preparation. Derived values pass the same type, range and local-file validation as ordinary values. The parameter still needs a valid `default` for schema discovery.

```json
{
  "id": "canvasHeight",
  "label": "Canvas height",
  "type": "dimension",
  "default": 1080,
  "derive": {
    "op": "round",
    "value": {
      "op": "multiply",
      "args": [{"ref": "canvasWidth"}, {"literal": 0.5625}]
    }
  }
}
```

Bind project metadata with `parameterBindings`, for example `{"width":"canvasWidth","height":"canvasHeight"}`. Project bindings support width, height, fps, title and outputName. Scene bindings support duration; reusable composition bindings support width, height, fps and duration. The resolved project must satisfy the normal project schema. Source defaults and binding declarations remain editable, and Studio receives separate resolved preview metadata.

Composition expressions resolve local parameters first, then project parameters. `{"ref":"project.canvasWidth"}` explicitly selects the parent project scope. Unknown references, dependency cycles and dependency chains deeper than 64 are errors. An explicitly supplied derived value must equal its calculated value; change its input parameters to change the result.

Expressions support literals, parameter references, object/array lookup (`get`), lazy conditions (`if`), numeric arithmetic, min/max/clamp, numeric rounding, Boolean operations, equality, numeric comparisons, string concatenation, case conversion and scalar-to-string conversion. Unary operations take `value`; arithmetic and comparison operations take `args`. Lookup takes `value` and a `path` array. An `if` takes `condition`, `then` and `else`. Equality compares JSON values structurally; object key order does not affect equality. String length counts UTF-16 code units; it is not a glyph measurement.

There is no project JavaScript execution, filesystem access, network access, clock or random source in expressions. Expressions are limited to 4096 parsed values, 64 nesting levels, 128 operands per operation, 4096 evaluation steps, 1 MiB per value and an 8 MiB cumulative value budget per evaluation. Invalid operand types, nonfinite numbers and division by zero are errors. Both branches of `if` must be valid expression syntax, but only the selected branch is evaluated.

The SDK exports `evaluateParameterExpression`, `resolveParameterScope`, `resolveParameters`, and `projectPreflight`. CLI, MCP and render jobs use parameter resolution through the same project loader. Materializing a composition freezes its resolved dimensions and removes its preflight bindings along with its parameter bindings.

These expressions currently compute parameter values and container metadata. They do not implement arbitrary animated-property dependency graphs, media-metadata probes or automatic text measurement.

`outputName` is a portable filename stem: directory separators, control characters, reserved device names and trailing dots/spaces are rejected. CLI render and SDK render use `renders/<outputName><codec extension>` when no explicit output path is supplied, falling back to the project ID. Studio seeds its export filename from this value. Explicit output paths retain precedence.

Editing-session queries `preflight` and `parameters` expose resolved metadata and paginated parameter values. Parameter rows identify defaults, supplied values and derived values, with dependency references and explicit omission markers when the requested value budget is exceeded. Asset inventory resolves every named variant, including derived file values, before packaging or deletion decisions.
