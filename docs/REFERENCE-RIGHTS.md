# Supplied reference rights

Every supplied reference can be frozen in `referenceSources` with its content hash, original location, rights owner/status, permitted delivery purposes, redistribution rule, attribution and the user’s explicit authorization. Unknown rights require a visible unresolved-rights warning and never become an implied license.

Native rendering calls `assertReferenceExportAllowed` before preparing frames. The requested delivery purpose must be allowed by every attached source; unresolved rights and public/commercial redistribution conflicts fail before output creation. Internal review remains the default purpose for projects without supplied-reference restrictions.
