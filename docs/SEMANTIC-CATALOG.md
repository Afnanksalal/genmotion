# Offline semantic catalog search

Genmotion’s local semantic index combines word and character-fragment TF-IDF signals for meaning-tolerant catalog retrieval without sending query text anywhere. Every result exposes its score, answering tier, algorithm, model/index version and offline state; the response records that query retention is `none`. Optional embedding-model files are explicit local inputs pinned by ID, version and SHA-256 before indexing.

`auditSemanticIndex` detects registry/index skew in both directions and lists unavailable indexed entries. Search reports unavailable matches separately instead of presenting a misleading empty result. `refreshSemanticIndex` builds a complete replacement and commits it atomically, so interrupted refreshes preserve the accepted index.
