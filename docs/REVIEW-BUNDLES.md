# Portable review bundles

`createReviewBundle` freezes a revision-bound review artifact, its verified representative/variant frames, timestamped comments, and a complete content-addressed project bundle into one directory. The directory includes a local `index.html`, remains usable offline, and carries hashes and byte lengths for every file. `verifyReviewBundle` checks the manifest identity, every file, the nested project bundle, and the artifact's source identity before use.

Comments preserve ID, author, creation time, project time, optional stable target, message, and resolution state. Evidence files are copied only after their declared SHA-256 matches. Source revision mismatch, changed evidence, path escape, missing offline entry point, or project dependency drift invalidates the bundle.

Offline access needs no service. Shared access requires an explicit scrypt secret hash, may restrict origins, and may expire. `hashReviewSecret` enforces a minimum secret length and random salt; plaintext secrets are never stored in the bundle. A service hosting the directory must authenticate against this policy before serving files.
