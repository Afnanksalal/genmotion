# Working with Genmotion Studio

Use Studio when the user needs to shape the composition interactively, compare references, tune exact timing, or review native pixels while the agent continues production work.

Start Studio on loopback. In Codex, use `genmotion studio <project> --no-open`, then open the printed URL in a browser panel when available. In Claude Code or an ordinary terminal, `genmotion studio <project>` opens the system browser. Keep the terminal process running until the review session ends.

Use the project switcher in the top bar to open another valid local project or create one from a complete creative brief. New projects are saved under `~/Genmotion Projects` unless Studio was launched with `--workspace <directory>`. **Create with agent** writes a real brief and neutral artboard, opens the isolated project, and immediately sends the brief to the selected local host. **Blank artboard** skips that agent turn.

The workflow canvas is production state, not a separate mockup. Scene and layer changes write the typed project through optimistic revision checks. Reference and note nodes live in `.genmotion/studio.json`; reference files live under `assets/studio/`; earlier project revisions live in `.genmotion/history/`. The renderer still consumes `genmotion.json` or YAML and never renders the Studio DOM.

Use the editor surfaces deliberately:

- Workflow expresses scene order, asset and reference relationships, and production notes.
- Editor requests exact frames from the native renderer. Scrub to entrances, peak action, settled holds, and transition boundaries. Visual layers, audio tracks, and motion directives move and edge-trim on the shared timeline, remain frame-snapped, and magnetically align with the playhead and nearby edges. The Snap control disables magnetic guides but deliberately retains frame integrity.
- Select a visual layer to move or resize it directly over the native frame. Corner handles resize freely, Shift preserves the current aspect ratio, and the inspector provides center, fit, fill, and reset actions.
- Inspector changes real project, scene, layer, brand, geometry, typography, direct animation tracks, optional recipes, and timing fields.
- The inspector exposes the complete production controls for every Creative IR layer family, including visual color wells with exact alpha-preserving hex input, project canvas format cards that reframe existing content, clipping, cropping, shadows, text layout, vector paths, source playback, blend modes, anchors, audio behavior, inbound and outbound transitions, and named, cubic-bezier, or spring easing. Text and vector layers can be created without an agent.
- **Source** opens the complete typed Creative IR consumed by Studio, MCP, chat, and the renderer. Saving it uses the same optimistic revision check and server-side schema validation as every other edit. Use it for unusual or bulk authoring without leaving Studio; invalid candidates never replace the last persisted project.
- Scene, layer, and audio duplication and ordering controls mutate production order in the real project. Expanded workflow nodes are another navigation and organization surface over those same objects, not a parallel mock graph.
- **Inspect** shows the fully evaluated active scene and layer state at the current frame after motion compilation. Completed exports can be probed for their encoded contract and turned into representative contact sheets without leaving Studio.
- References preserve human-supplied visual cues and their annotations. Connect references to the scenes they inform.
- Agent conversations record the current scene, layer, and frame, stream progress, persist the host session, and reload validated project edits into Studio. Hermes runs through native ACP with a project-scoped Genmotion MCP server; Claude receives a generated project-local MCP configuration. No provider API key is stored.
- Motion libraries can be imported as declarative JSON from the Motion library manager. Custom ids are project-local and namespaced as `library-id:motion-id`; imported data must validate and never contains executable JavaScript.
- History restores an earlier IR while preserving the current revision as another recoverable entry.
- Export starts the same verified native render pipeline as the CLI. The dialog follows live progress, preserves a recent-file list across Studio restarts, shows each project-relative output path, and can reveal a completed file in the local operating system's file manager.

Use the configured Hermes ACP runtime or signed-in Codex or Claude host in Studio for embedded turns. If you are already working in the user's current external chat, poll pending requests with `genmotion requests <project> --pending`. A request is not permission to fabricate product evidence, download unlicensed material, publish media, or expose Studio beyond loopback. Apply in-scope edits, validate, inspect the affected native frames, and resolve the request with a factual completion summary.

If Studio reports a revision conflict, another actor changed the project after the browser loaded it. Preserve both intents: reload, inspect the new revision, reapply only non-conflicting edits, then save. Never bypass the revision lock or replace the project file directly while Studio is open.
