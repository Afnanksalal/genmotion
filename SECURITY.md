# Security policy

## Supported version

Security fixes are applied to the latest major version on the default branch.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting for `Afnanksalal/genmotion` and include the affected version, reproduction, impact, and suggested mitigation when known.

## Runtime model

Genmotion executes local native modules and FFmpeg with the permissions of the invoking user. Only install the package and skill from a reviewed source.

The renderer rejects HTTP assets, lexical parent-directory escapes, and existing symlink or junction targets outside the canonical project root. Freeze licensed assets locally before rendering. Genmotion has no model API-key configuration or credential store.

Preview binds to `127.0.0.1` by default. Binding it to another interface exposes rendered project frames and metadata to that network and should be an explicit operator choice.

Studio also binds to `127.0.0.1` by default. It uses a per-process mutation token, same-origin and Fetch Metadata enforcement, per-response script nonces, optimistic project revisions, atomic writes, a restrictive Content Security Policy and Permissions Policy, project-root path confinement, upload size limits, extension allowlists, file-signature validation, bounded queues, and bounded preview memory. Do not publicly expose Studio without an authenticated reverse proxy; it is a local authoring surface, not a multi-tenant web service.

The Studio agent bridge invokes the locally installed Codex app-server or Claude Code process without a shell. Those tools reuse their own managed sign-in. Agent turns run in the selected project directory, Codex receives a workspace-write sandbox with network disabled, and Claude receives only local read and edit tools. Unexpected approval requests are declined. Studio locks browser project writes while an agent turn is active and validates the resulting IR before accepting it.

Treat rendered media, source recordings, customer evidence, fonts, agent conversations, and `.genmotion` planning artifacts according to their source confidentiality.
