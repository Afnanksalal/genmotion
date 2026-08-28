# Genmotion Studio

Studio supplies the fine-grained human controls that an autonomous renderer cannot infer from a brief. It is a local web application shipped inside Genmotion, launched with `genmotion studio <project>`, and backed by the exact Creative IR used for native rendering.

## Authoring surfaces

- The node workflow shows the creative brief, ordered scenes, expanded layers, human references, notes, and final export relationship. Node positions and explanatory edges persist.
- The inspector edits project delivery settings, brand colors, scene timing and transitions, layer geometry and content, and named motion assignments.
- The Editor renders exact native project frames. Playback, scrubbing, scene clips, layer tracks, motion phases, and the playhead use the project's real frame rate and duration.
- Every named motion directive is an editable phase clip beneath its owning layer. Select, drag, frame-snap, edge-trim, duplicate, remove, or tune its recipe, start, duration, intensity, and direction without creating a browser-only animation model.
- The reference board accepts local images, annotations, and tags. References connect to scenes without turning source artwork into a copied template.
- The asset browser ingests local image, video, audio, and font files into content-addressed project storage. Visual media becomes a scene layer, audio becomes a real audio track, and fonts join the project brand library.
- The native frame monitor exposes direct move and corner-resize controls for visual layers, including edge and center snapping plus fit, fill, center, and transform-reset actions.
- The timeline moves and edge-trims visual layers, audio tracks, and motion phases. Edits stay frame-snapped, magnetically align with nearby edges and the playhead, preserve source trim offsets, and support keyboard nudging.
- History stores recoverable project revisions. Browser undo and redo cover the current editing session.
- Export runs the native render pipeline as a background job and reports progress without blocking authoring. Duplicate submissions for the same active output are rejected and completion is announced once per job transition.

## Human and agent loop

The bottom chat bar detects authenticated local Codex and Claude Code installations. Choose a host and submit a prompt to start a real agent turn with the current scene, layer, and frame as context. Responses stream into the durable conversation record, and project edits appear in Studio after the resulting Creative IR passes validation.

Codex uses its official stdio app-server protocol and a persistent project conversation named `Genmotion · <project>`, which appears as a normal Codex task. Claude uses its authenticated streaming print mode and a persistent project session available through Claude Code's resume flow. Both reuse the host tool's managed account sign-in, so Studio has no model API key field or secret store.

Requests are serialized to prevent concurrent agents from overwriting one another. Browser writes are locked during an active turn. A failed or interrupted turn remains visible with its error and is never silently replayed on restart. The `requests` and `request-resolve` commands remain available for an agent already working in the user's current Codex or Claude chat.

## Persistence

- `genmotion.json`, YAML equivalent: renderer-owned project data
- `.genmotion/studio.json`: node layout, notes, and reference metadata
- `.genmotion/history/`: recoverable previous project revisions
- `.genmotion/requests/`: queued, active, completed, failed, and externally resolved agent conversations
- `.genmotion/agent-sessions.json`: local Codex and Claude conversation identifiers, never credentials
- `assets/studio/`: content-addressed imported assets
- `renders/`: exported masters

## Security

Studio binds to `127.0.0.1` unless explicitly configured otherwise. Do not bind it to a public interface. Mutations require the random session token obtained by the loaded page. Asset paths cannot escape the project and remote assets remain forbidden. Uploaded content is size limited and must match an allowlisted media or font signature. Project writes are atomic and reject stale revisions rather than silently overwriting another actor's work.

## Interface foundation

Studio uses Radix's maintained neutral color scales as its design-system foundation. Its graphite and steel palette intentionally avoids neon editor styling. Native selects, number spinners, range controls, textarea handles, browser tooltips, and scrollbars are replaced or normalized so the browser's default chrome does not leak into the product.
