# Editorial markers and ranges

Projects accept optional `markers` and `ranges` arrays. Markers have stable IDs, labels, seconds, kind (`marker`, `beat`, `comment`, `chapter`), color, notes and manual/analysis/import origin. A `sceneId` makes the time relative to that scene, so scene reordering preserves the local landmark. `globalMarkerTime` resolves the global clock. Missing scenes and out-of-timeline positions produce findings rather than silently moving markers.

Named ranges have an ID, label, global start and exclusive end. Their end must exceed their start. They are reusable in/out selections; Studio can loop the complete frames within a selected range. Marker and range boundaries join the timeline snapping candidates. The ruler exposes marker seek buttons. The project inspector opens paginated marker editing and range controls; these changes use ordinary project revisions and history.

`genmotion markers PROJECT` and `genmotion_markers` inspect resolved marker times and ranges. CLI `--file` accepts a JSON object containing replacement `markers` and/or `ranges`; writes require `--expected-revision`. MCP replacements use the same revision boundary.

SDK `parseTimelineTime` accepts seconds, frame literals such as `37.5f`, MM:SS, HH:MM:SS and non-drop HH:MM:SS:FF. `formatTimecode` formats nonnegative integer frames at integer FPS. Studio's Go to control uses that parser. Semicolon drop-frame timecode is refused explicitly.

Editorial metadata does not change pixels. Native and Studio regression cases are queued for the deferred QA pass.
