# Local catalog feedback

Search misses and content-quality judgments live in an explicit host-selected JSON store. Records retain the query, optional catalog item, bounded rating/note and creation time. `readCatalogFeedback` exposes the complete local history, while `deleteCatalogFeedback` removes selected records or clears the store through atomic replacement.

Genmotion has no background telemetry path for these records. `exportCatalogFeedback` must be called explicitly and only creates a caller-owned payload; it does not transmit anything. A host may separately present and send that payload after an explicit user action.
