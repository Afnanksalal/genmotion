# Render input and output attestation

Every native render resolves the complete project dependency closure before frame work begins. The attestation records the source-document hash and each dependency's project-relative path, byte size, SHA-256 identity and semantic roles. Declared hashes in reference-source and media-ledger records are enforced. The destination is explicitly excluded and a render fails if an output is also present in its input closure.

Before accepting the staged master, Genmotion decodes the complete video stream to RGBA and, when present, the complete audio stream to signed 32-bit PCM. The delivery manifest retains separate SHA-256 identities for the encoded file, decoded video and decoded audio. A missing stream hash fails before the existing destination is replaced.

The input attestation is returned through the SDK render result and therefore through the same CLI, MCP and Studio render surfaces. Portable bundles include the same frozen dependencies because the attestation and bundler share `projectAssetReferences`.
