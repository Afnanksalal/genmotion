# Parameters and configurations

Parameters are defined once in Creative IR and resolved before motion compilation. Studio, CLI, MCP and SDK loading use the same validator. Substitution is followed by project-schema validation, so a valid parameter cannot bypass the constraints of its destination property.

Supported types are `string`, `number`, `boolean`, `color`, `enum`, `file`, `asset`, `font`, `dimension` (positive integer pixels), `duration` (nonnegative seconds), `object`, and `array`. Any definition can declare `optional: true` to accept `null`. Explicit null overrides are preserved. Every definition has an `id`, `label`, and `default`; optional `description` and `group` fields drive Studio controls. Numeric bounds are `min` and `max`; `step` is a control increment. Strings and arrays accept `minLength` and `maxLength`. Enums require `options`.

Objects declare a `properties` map of parameter definitions; missing members receive their declared defaults and unknown members fail validation. Arrays declare an `items` parameter definition. Definitions are recursive. Defaults are validated even when an override is supplied.

```json
{
  "id": "copy",
  "label": "Copy",
  "type": "object",
  "default": {},
  "properties": {
    "headline": { "id": "headline", "label": "Headline", "type": "string", "default": "Hello", "maxLength": 80 }
  }
}
```

File, asset, and font values name project-relative local files. Loading resolves symlinks against the project root, reads the files, and returns their SHA-256 hashes and byte counts in `LoadedProject.parameterDependencies`. Missing or escaping files fail loading. These hashes describe the files at load time; they do not freeze later filesystem modifications or provide a render-wide immutable asset snapshot.

Layer `bindings` map destination paths such as `text`, `fill`, or `tracks.0.keyframes.0.value` to parameter IDs. Array indices must be canonical nonnegative integers. Identity fields, binding definitions, inherited properties, and prototype paths cannot be bound. Values are cloned, and the authored source is preserved separately from the resolved project.

Reusable compositions can declare their own `parameters` array. A composition layer supplies local overrides in `parameterValues`; local definitions shadow project parameters of the same name. A parent can bind a structured parameter to a nested composition layer's `parameterValues`. Loading materializes distinct evaluated definitions before motion compilation and media preparation, sharing definitions for identical values and preserving the reusable source document. Unknown local overrides and cycles fail before rendering. Studio exposes instance overrides in the composition layer inspector; CLI/MCP/SDK project transactions edit the same fields. Native pixel and nested propagation coverage is in `tests/composition-parameters.test.ts`.

CLI render, frame, validation, and preview commands accept `--params '{"headline":"Hello"}'` and `--variant <id>`. MCP frame and render tools accept the same typed `parameters` object. SDK consumers pass an overrides object to `loadProject` or `loadProjectDocument`. `parseParameterAssignments` additionally handles `name=value` lists with JSON objects, arrays, booleans, numbers, and null; quote numeric-looking strings as JSON strings to preserve them.

## Configurations and batch data

Named configurations live in `variants`, with `id`, `label`, and `values`. Explicit values override the project's active values; omitted parameters use active values or defaults. Studio's configuration picker replaces active overrides with the selected configuration, so omitted values return to defaults.

```powershell
genmotion variants ./project --matrix matrix.json --output configurations.json
genmotion variants ./project --input configurations.csv --format json --output configurations.json
genmotion render-variants ./project --output ./exports --codec vp9
```

The `variants` command validates and exports without modifying the project. Use the shared project-save/patch transaction to install configurations, or Studio's **Parameter configurations** dialog. The dialog accepts JSON configurations, CSV, and a JSON parameter matrix; it can validate, save, export CSV as text, and apply a configuration to the preview.

`genmotion_variants` exposes the same operations over MCP. SDK exports are `expandParameterMatrix`, `importParameterVariants`, and `exportParameterVariants`. Studio uses `/api/variants` for read-only validation and conversion, followed by the existing revision-safe project save for persistence.

Matrices map parameter names to nonempty value arrays. Expansion uses authored axis order, stable sequential IDs, and a default maximum of 1,000 variants. Every combination is validated before returning. CSV supports quoted commas, doubled quotes, Unicode, multiline cells, and an optional BOM. Reserved columns are `$id` and `$label`; other columns must name declared parameters. Numeric, boolean, object, and array cells use JSON syntax. String cells preserve numeric-looking text. Duplicate columns, duplicate IDs, malformed rows, invalid typed values, and excessive row counts fail explicitly. CSV export refuses sparse rows whose missing fields would be confused with empty values; JSON preserves sparse overrides.

Coverage: `tests/parameters.test.ts`, `tests/variants.test.ts`, and the Studio browser scenario for generated typed controls and configuration persistence. This does not complete the broader backlog requirements for derived parameters, localized platform variants, side-by-side comparison, or immutable render dependency snapshots.
