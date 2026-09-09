# Supplied reference rights

Every supplied reference can be frozen in `referenceSources` with its project-local path, content hash, original location, rights owner/status, permitted delivery purposes, redistribution rule, attribution and the user’s explicit authorization. Unknown rights require a visible unresolved-rights warning and never become an implied license. The local bytes are verified before every render and included in portable dependency closure.

Native rendering calls `assertReferenceExportAllowed` before preparing frames. The requested delivery purpose must be allowed by every attached source; unresolved rights and public/commercial redistribution conflicts fail before output creation. CLI, MCP, Studio and dry-run plans expose the same delivery-purpose choice. Internal review remains the default purpose for projects without supplied-reference restrictions.
