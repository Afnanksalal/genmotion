# Creative preferences

Creative preferences are versioned, inspectable Creative IR records. Each record carries a stable ID and key, project or personal scope, a JSON value, its source, state, and an append-only confirmation/override/removal history.

`resolveCreativePreferences` applies active personal defaults first and project choices second, so an explicit project choice wins without destroying the personal record. Removal is a retained tombstone and exposes the earlier decision history. An inferred personal choice is always `proposed`; schema validation rejects it as an active default until a user-confirmation event exists. This prevents a one-off generated choice from silently affecting later projects.

Use `upsertCreativePreference`, `removeCreativePreference`, and `inspectCreativePreferences` to manage and audit records. Project-scoped records travel in `creativePreferences` with the project and its verified bundles. `readPersonalPreferences` and `writePersonalPreferences` persist the same records in an explicit host-owned file using atomic replacement; that separation keeps portable project behavior explicit.
