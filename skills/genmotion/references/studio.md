# Working with Genmotion Studio

Use Studio when the user needs to shape the composition interactively, compare references, tune exact timing, or review native pixels while the agent continues production work.

Start Studio on loopback. In Codex, use `genmotion studio <project> --no-open`, then open the printed URL in a browser panel when available. In Claude Code or an ordinary terminal, `genmotion studio <project>` opens the system browser. Keep the terminal process running until the review session ends.

The workflow canvas is production state, not a separate mockup. Scene and layer changes write the typed project through optimistic revision checks. Reference and note nodes live in `.genmotion/studio.json`; reference files live under `assets/studio/`; earlier project revisions live in `.genmotion/history/`. The renderer still consumes `genmotion.json` or YAML and never renders the Studio DOM.

Use the editor surfaces deliberately:

- Workflow expresses scene order, asset and reference relationships, and production notes.
- Preview requests exact frames from the native renderer. Scrub to entrances, peak action, settled holds, and transition boundaries.
- Inspector changes real project, scene, layer, brand, geometry, typography, motion, and timing fields.
- References preserve human-supplied visual cues and their annotations. Connect references to the scenes they inform.
- Agent requests record the current scene, layer, and frame so feedback has precise context.
- History restores an earlier IR while preserving the current revision as another recoverable entry.
- Export starts the same verified native render pipeline as the CLI.

Poll pending requests with `genmotion requests <project> --pending`. A request is not permission to fabricate product evidence, download unlicensed material, publish media, or expose Studio beyond loopback. Apply in-scope edits, validate, inspect the affected native frames, and resolve the request with a factual completion summary.

If Studio reports a revision conflict, another actor changed the project after the browser loaded it. Preserve both intents: reload, inspect the new revision, reapply only non-conflicting edits, then save. Never bypass the revision lock or replace the project file directly while Studio is open.
