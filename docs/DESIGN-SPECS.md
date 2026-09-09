# Versioned design specifications

Projects can bind one strict `designSpec` to the Creative IR. Its stable identity includes an ID, external revision, source SHA-256 and provenance with rights status. The payload records named palette values, exact project-path bindings, font family/file/hash/license metadata, immutable asset identities and recommendations keyed by delivery medium.

`auditDesignSpec` is read-only. It verifies exact bindings, local font and immutable-asset bytes, palette enforcement, every named parameter variant and production-brief destination guidance. It returns precise drift codes and never silently substitutes a font, asset or color. Unknown rights stay explicit in the report.

Use `genmotion design-spec PROJECT --file spec.json --expected-revision HASH` to import and audit, or omit `--file` for a read-only audit. MCP `genmotion_design_spec` and Studio **Design specification** share the same schema, revision-safe save and report. The full payload remains portable in source documents and verified project bundles.
