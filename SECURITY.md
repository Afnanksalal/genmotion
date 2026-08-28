# Security policy

## Supported version

Security fixes are applied to the latest major version on the default branch.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting for `Afnanksalal/genmotion` and include the affected version, reproduction, impact, and suggested mitigation when known.

## Runtime model

Genmotion executes local native modules and FFmpeg with the permissions of the invoking user. Only install the package and skill from a reviewed source.

The renderer rejects HTTP assets and filesystem paths that escape the project root. Freeze licensed assets locally before rendering. Provider API keys are read from a named process environment variable and are never accepted in the Creative IR, logs, or generated concept files.

Preview binds to `127.0.0.1` by default. Binding it to another interface exposes rendered project frames and metadata to that network and should be an explicit operator choice.

Treat rendered media, source recordings, customer evidence, fonts, provider responses, and `.genmotion` planning artifacts according to their source confidentiality.
