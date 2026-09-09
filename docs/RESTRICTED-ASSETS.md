# Restricted asset acceptance

Restricted fonts and other gated assets require a dedicated `restrictedAssetAcceptance` record before acquisition. The record binds one asset role and source URL to expected bytes, the exact terms URL/version, actor and acceptance time. It is a separate explicit action and cannot be inferred from saving a project.

`acquireRestrictedAsset` delegates transport to an explicit host callback, stages the result, verifies the accepted SHA-256 and only then publishes it. Changed upstream bytes, substitutes and incomplete downloads are removed and refused. The acceptance records remain portable in Creative IR for later audit.
