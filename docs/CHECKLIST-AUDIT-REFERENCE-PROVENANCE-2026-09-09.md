# Checklist audit — reference-derived work and provenance

The canonical backlog now includes GM-092 through GM-098. They were added after reviewing a public, reproducible reference-adaptation project for workflow lessons only. No source code, visual assets, fonts, audio or implementation approach from that project was imported into Genmotion.

## Findings applied

1. A reference adaptation needs a source record that states rights and redistribution limits, not merely a generic asset path or a creative reference note.
2. Derived plates, crops, measurements and audio extraction need a reversible parent-child graph with exact time mapping. An output must be able to explain which pixels originate from a source and which were authored or generated later.
3. A reconstruction should record source observations and intentional differences separately. Static target frames alone cannot establish whether a result preserves, changes or copies a source region.
4. Reproducibility needs both asset verification and a render-input firewall. A shipped comparison export must never silently become a render dependency.
5. Restricted downloads require explicit, hash-bound license acceptance. A missing or changed font must fail clearly instead of falling back silently.

## Scope boundary

These requirements extend existing media-ledger, bundle, workflow, review and render-manifest work. They preserve Genmotion's native Creative IR and native evaluator. They do not add HTML, Canvas, browser automation or a second rendering path.

## Count impact

Seven open requirements were added. The canonical program is now **75 checked / 324 total**; this audit does not mark any capability complete.
