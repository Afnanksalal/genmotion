# Real product evidence capture

`captureProductEvidence` runs an explicit browser session and freezes screenshots, optional session footage, visible text, visited source URLs with HTTP status, viewport and timestamps, and a generated contact sheet. Every accepted binary has a local SHA-256 and `pixelOrigin: captured-evidence`. The manifest states that later reconstructed or generated pixels require a different origin, so authored graphics cannot be presented as real product evidence.

Capture input is bounded to 100 declarative actions. A wall-clock deadline, one-session concurrency, text limit and total byte budget cover navigation, actions and output collection. Failed actions, timeouts, unavailable video and artifacts rejected by the byte budget appear in `skipped`; the result becomes `partial` or `failed` rather than claiming completion. The capture never participates in rendering directly: accepted files remain frozen local inputs.
