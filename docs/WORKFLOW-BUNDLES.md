# Reusable workflow bundles

A workflow bundle freezes an approved production workflow as an immutable, content-identified JSON document. It includes the brief structure, design specification and exact brand bindings, storyboard skeleton, typed parameters and defaults, every referenced asset with a SHA-256 identity, and explicit acceptance checks.

`createWorkflowBundle` refuses to freeze a storyboard with an unapproved shot. `openWorkflowBundle` verifies the bundle identity, engine-major compatibility, and each required dependency in the target project. Missing and changed files remain visible as structured diagnostics. `instantiateWorkflowBundle` reopens the approved structure while deliberately resetting build stages, shot approvals and comments because those decisions belong to the new project revision.

The reader supports bounded schema migration. Version 0 migrates to version 1 by adding the engine compatibility and immutable identity fields, and reports that migration to the caller. Unknown versions fail explicitly.
