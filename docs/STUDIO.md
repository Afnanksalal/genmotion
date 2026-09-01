# Genmotion Studio

Studio supplies the fine-grained human controls that an autonomous renderer cannot infer from a brief. It is a local web application shipped inside Genmotion, launched with `genmotion studio <project>`, and backed by the exact Creative IR used for native rendering.

The project switcher discovers valid projects in the configured local workspace and creates a neutral artboard from a real creative brief. **Create with agent** immediately hands that brief to the selected Hermes ACP, Codex, or Claude host; **Blank artboard** leaves it entirely to the human. The default workspace is `~/Genmotion Projects`; pass `--workspace <directory>` when launching Studio to use another location.

## Authoring surfaces

- The node workflow shows the creative brief, ordered scenes, expanded layers, human references, notes, and final export relationship. Node positions and explanatory edges persist. **Auto layout** creates a bounded hierarchical scene grid, places every layer beneath its owning scene, moves the export after the final scene, and gives notes and references a separate lane. It is safe to rerun as a project grows.
- The inspector edits project delivery settings, brand colors, scene timing and transitions, layer geometry and content, arbitrary agent animation tracks, custom keyframes, and optional named motion assignments. Every named, cubic-bezier, and spring easing has a visual curve preview beside its exact controls. Cubic Bézier handles are directly draggable and keyboard adjustable, with the exact numeric points kept in sync. Color fields use a Studio-native dark picker with saturation/value, hue, alpha, RGB, exact hex, and an eyedropper where the browser supports it. Canvas format cards cover common landscape, portrait, square, social, and poster ratios; selecting one changes the actual project dimensions and uniformly reframes existing layers instead of applying a preview-only crop.
- The Editor renders exact native project frames. Playback, scrubbing, scene clips, layer tracks, motion phases, and the playhead use the project's real frame rate and duration.
- Every named motion directive is an editable phase clip beneath its owning layer. Select, drag, frame-snap, edge-trim, duplicate, remove, or tune its recipe, start, duration, intensity, and direction without creating a browser-only animation model.
- The motion library manager imports project-local JSON libraries. Each library is schema-validated, namespaced as `library-id:motion-id`, and compiled into native transform, shape-progress, text-reveal, or numeric-count tracks. It is declarative by design and cannot execute imported JavaScript.
- The reference board accepts local images, annotations, and tags. References connect to scenes without turning source artwork into a copied template.
- The scene tree searches scene IDs, purposes, layer IDs, types, and tags, so large projects do not require scrolling through the entire document.
- The asset browser ingests local image, video, audio, and font files into content-addressed project storage. Its inventory scans the project asset tree rather than only the current IR, so assets remain discoverable after their last layer is removed. It searches frozen paths, previews images and videos, reports byte size and live usage counts, and navigates directly to the first use. Unused Studio imports can be deleted explicitly; referenced assets are protected. Visual media becomes a scene layer, audio becomes a real audio track, and fonts join the project brand library.
- Audio inspection provides decoded source waveforms plus real mixer controls for gain, constant-power stereo pan, mute, solo, fades, looping, role assignment, and voice-driven ducking. Solo is resolved before assets are opened, so excluded tracks cannot break or slow a render.
- The native frame monitor exposes direct move and corner-resize controls for visual layers, including edge and center snapping plus fit, fill, center, and transform-reset actions.
- The timeline moves and edge-trims visual layers, audio tracks, and motion phases. Edits stay frame-snapped, magnetically align with nearby edges and the playhead, preserve source trim offsets, and support keyboard nudging.
- History stores the 100 most recent recoverable project revisions. Browser undo and redo cover the current editing session.
- Export runs the native render pipeline as a serialized background job and shows the exact output dimensions before queueing. Serialization prevents several full-core native renders from making the editor unusable. Draft uses native project size, standard guarantees at least a 1280-pixel long edge, and high guarantees at least a 1920-pixel long edge with a high-detail encode. The dialog remains synchronized through queued, rendering, failed, and complete states. Completed files remain listed after Studio restarts and download through a streamed attachment response, including when Studio runs behind an authenticated remote proxy. Duplicate submissions for the same active output are rejected, both agent and render queues apply explicit backpressure, and completion is announced once per job transition.

## Human and agent loop

The bottom chat bar detects an available Hermes ACP runtime and authenticated local Codex and Claude Code installations. Choose a host and submit a prompt to start a real agent turn with the current scene, layer, and frame as context. The agent can discover the schema, patch the exact project revision, validate, inspect evaluated timeline values, and view native PNG frames through Genmotion's local tools. Responses stream into the durable conversation record, and project edits appear in Studio after the resulting Creative IR passes validation.

Hermes uses the official Agent Client Protocol over private stdio, keeps one resumable session per project, and receives Genmotion's MCP server as a project-root-confined tool surface. Codex uses its official stdio app-server protocol and a persistent project conversation named `Genmotion · <project>`, which appears as a normal Codex task. Claude uses its authenticated streaming print mode, a persistent project session, and an automatically generated project-scoped MCP configuration. All three reuse their host runtime's provider configuration, so Studio has no model API key field or secret store. Set `GENMOTION_HERMES_COMMAND` only when the Hermes executable is not on `PATH`, and optionally set `GENMOTION_HERMES_PROFILE` to select an existing Hermes profile.

Requests are serialized to prevent concurrent agents from overwriting one another. Browser writes are locked during an active turn. An authoring request is completed only when the validated project revision actually changes; a conversational refusal or no-op is recorded as failed instead of masquerading as finished work. Hermes receives one automatic continuation when it answers a feasible authoring request with a scope-only blocker. Transient provider overloads, rate limits, gateway failures, and connection resets receive bounded retries with visible progress. A retry is allowed only while the persisted project revision is unchanged, preventing a provider response that landed late from being replayed over newer work. A failed or interrupted turn remains visible with its exact error and is never silently replayed on restart. The `requests` and `request-resolve` commands remain available for an agent already working in the user's current Codex or Claude chat.

## Persistence

- `genmotion.json`, YAML equivalent: renderer-owned project data
- `.genmotion/studio.json`: node layout, notes, and reference metadata
- `.genmotion/history/`: recoverable previous project revisions
- `.genmotion/requests/`: queued, active, completed, failed, and externally resolved agent conversations
- `.genmotion/agent-sessions.json`: local Hermes, Codex, and Claude conversation identifiers, never credentials
- `.genmotion/agent-mcp.json`: generated local Claude tool configuration, never credentials
- `.genmotion/motions/`: validated custom motion library JSON files
- `assets/studio/`: content-addressed imported assets
- `renders/`: exported masters

## Security

Studio binds to `127.0.0.1` unless explicitly configured otherwise. Do not bind it to a public interface without an authenticated reverse proxy. Mutations require the random session token obtained by the loaded page. Cross-site browser requests and mismatched origins are rejected. Inline JavaScript is authorized with a per-response CSP nonce, privileged browser capabilities are disabled, and state is never allowed to frame another origin. Asset paths cannot escape the project and remote assets remain forbidden. Uploaded content is size limited and must match an allowlisted media or font signature. Project writes are atomic and reject stale revisions rather than silently overwriting another actor's work. The decoded-frame preview cache has both byte and entry limits, so high-resolution projects cannot grow memory without bound.

Keyboard users can move between Studio views with arrow, Home, and End keys, manipulate timeline handles and Bézier control points, and remain focus-contained inside dialogs. Escape closes the active dialog and restores focus to its launcher. The interface honors `prefers-reduced-motion`.

## Interface foundation

Studio uses Radix's maintained neutral color scales as its design-system foundation. Its graphite and steel palette intentionally avoids neon editor styling. Native selects, number spinners, range controls, textarea handles, browser tooltips, and scrollbars are replaced or normalized so the browser's default chrome does not leak into the product.
