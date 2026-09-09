# Shared content-addressed inputs

`ContentStore` is the common immutable input store for local render jobs, remote-provider adapters and repeated project submissions. Every entry is addressed by SHA-256, verified before reuse and after staging, and materialized through an exclusive destination so a racing writer cannot replace accepted bytes.

The store enforces explicit byte and entry quotas. `putProject` freezes the source document and every resolved project dependency, retains each original role, and derives one deterministic dependency-set identity. Repeated assets and project submissions reuse the same bytes. Rendering still resolves a complete local dependency set; the shared store never turns network or mutable provider state into a runtime render dependency.
