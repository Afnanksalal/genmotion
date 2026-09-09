# Version-safe upgrades and rollback

`inspectProjectCompatibility` reports the source Creative IR version and hash, current runtime, target schema, preserved motion-library pins, required migrations and a human-readable change list. Unknown future schemas fail explicitly. Project loading also rejects missing or version-drifted pinned libraries.

`upgradeProject` migrates only through registered bounded migrations, validates the complete project, and renders first/middle/last native frames before writing. Dry runs perform the same migration and representative validation without changing disk. A real upgrade writes an immutable timestamped backup under `.genmotion/upgrades`, then atomically replaces the project and returns source/output hashes, actor, changes, findings, backup path and frame evidence.

`rollbackProjectUpgrade` accepts only a backup inside the project upgrade directory, validates that it is a supported project document and restores its exact bytes atomically. CLI, MCP, Studio and SDK expose inspection, application and rollback, and the generated capability-contract gate checks those surfaces for drift.
