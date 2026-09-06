# Frozen typed data

Implemented in 2.4.0. See the [milestone QA report](MILESTONE-QA-2026-09-07.md) for tested paths and remaining acceptance limits.

Project `dataSources` capture local JSON or CSV as typed values embedded in the Creative IR. A snapshot records its stable ID, supplied parameter, original source name and format, capture time, source-text SHA-256 and normalized-value SHA-256. Rendering uses the snapshot inside the project, not the original file. Project bundles therefore carry the required data without a personal cache or an external path.

Define a typed project parameter first, then import a source into it. JSON can supply any compatible parameter value. CSV requires an array whose item definition is an object with typed properties. Headers must be unique declared properties. Numeric, Boolean, object and array cells use JSON syntax; string-like cells retain their text. An empty optional cell becomes null. Missing object properties use their declared defaults. Quoted cells, escaped quotes and embedded line breaks use the shared CSV parser.

```sh
genmotion project-read ./project
genmotion data-import ./project --source ./rows.csv --format csv --id chart-data --parameter rows --expected-revision <file-revision>
```

`--dry-run` validates the proposed import without saving. MCP exposes `genmotion_data_import` with the same identity, parameter, local file and expected-revision contract. SDK callers use `importFrozenData` with source text. Studio's project inspector provides import, replacement and removal controls through the shared editing session. Importing replaces the explicitly named source ID and clears the supplied parameter's current override so the new snapshot becomes active. Removal uses the normal parameter fallback; unrelated explicit overrides remain.

Precedence is: runtime/variant overrides, saved `parameterValues`, frozen snapshot, declared parameter default. Derived parameters cannot be direct data-import targets, but can reference data-backed input parameters. Every declared snapshot is hash-checked and type-validated before parameter resolution, even when an explicit parameter override is active. Editing snapshot values without updating their recorded hash is refused; reimport to capture a deliberate change. Hashes detect content changes, not the trustworthiness of the original source.

Imports require valid UTF-8 and are bounded to 8 MiB of source text, 8 MiB of normalized JSON, 100000 values and 32 levels. CSV parsing is capped at 100000 cells. Up to 64 snapshots can be declared; source IDs and parameter ownership must be unique. Studio's overall request-body limit also applies to uploaded JSON envelopes. Ordinary project/type/asset validation still runs before an import is committed.

Loaded projects report `dataDependencies` with snapshot identities, hashes and byte sizes. The `data-sources` editing query returns a paginated manifest with hash/type validity and explicit override status, excluding large data values. The `parameters` query identifies a selected value as `frozen-data` when the snapshot supplies it. Full input schema is available through schema kind `data-source`.
