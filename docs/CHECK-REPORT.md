# Native check reports

`createCheckReport` returns one versioned, source-hash-bound result spanning schema, frozen assets and fonts, evaluated text/caption layout, media readiness, contrast/readability findings, motion sampling coverage and the complete dry-run output contract.

Every section reports `passed`, `warning`, `failed`, or `incomplete`, retains its structured findings and states whether its bounded check completed. The report also returns aggregate severity, every incomplete section, the deterministic review timestamps and any omitted candidate count. A truncated sampling budget therefore cannot present itself as a successful complete review.

Use SDK `createCheckReport`, `genmotion check-report <project>`, MCP `genmotion_check_report`, or authenticated Studio `POST /api/check-report`. All surfaces call the same validation, review-sampling and render-plan contracts.

Every current finding has bounded repair guidance tied to the same code and precise source location. Suggestions are explicitly `automatic: false`: they guide a revision-safe edit but never mutate the project or imply that a generic repair is safe without inspecting its target.
