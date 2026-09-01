---
name: genmotion
description: Create, edit, preview, validate, and render designed motion graphics with the Genmotion native renderer. Use for launch films, title cards, explainers, diagrams, data motion, brand choreography, product framing, and reusable video compositions. Do not use it for recording real browser interactions; capture those first and use them as truthful media assets.
license: MIT
metadata:
  author: afnanksalal
  version: "1.9.2"
---

# Genmotion

Use Genmotion as the only constructed-motion renderer. Do not introduce Remotion, HyperFrames, HTML compositions, browser screenshots of reconstructed interfaces, or ad hoc FFmpeg filter graphs for designed scenes.

Genmotion projects are typed JSON or YAML. Agents own story, hierarchy, content, references, SVG geometry, property tracks, custom easing, and optional motion recipes. The engine faithfully evaluates the accepted scene graph, decodes media, renders native frames in parallel, mixes audio, encodes, and verifies output.

Genmotion Studio is the human iteration surface. It edits the same Creative IR consumed by the renderer and persists workflow layout, reference annotations, revision history, and agent requests inside the project. Use it when the user wants to direct, compare, inspect, or fine-tune the work rather than treating feedback as a one-shot prompt.

The Editor workspace exposes visual layers, audio tracks, and named motion directives as frame-snapped clips. Use direct canvas handles to position and resize visuals, and the timeline to move, magnetically snap, edge-trim, duplicate, remove, or inspect media and motion against native rendered frames. Do not create a second browser-only motion model.

## Start

Run `genmotion doctor --json`. If the command is unavailable inside a Genmotion checkout, run `npm install && npm run build` and use `node dist/cli.js`. In a consuming project with Genmotion installed locally, use `npx genmotion`.

When Genmotion MCP tools are available, call them directly instead of spawning equivalent CLI commands. Start with `genmotion_schema`, create a neutral project with `genmotion_init`, read its revision, use `genmotion_project_patch` for precise transactions, validate, inspect the evaluated timeline, and examine returned PNG frames. The server also exposes full saves, rendering, probing, contact sheets, Studio, preview, catalogs, and requests without an API key. Keep its working directory at the user's project root; paths outside that root are rejected unless explicitly added through `GENMOTION_ALLOWED_ROOTS`.

For a new project:

```bash
genmotion init <directory> --title "<real title>" --promise "<one real promise>" --proof "<one verified proof point>" --action "<desired viewer action>" --audience "<primary audience>" --mode <walkthrough|launch|pitch|explainer> --duration <seconds>
```

Add any additional sourced facts, local assets with provenance, and real brand colors and fonts in `brief.json`. Never introduce example facts into a delivery project.

For collaborative iteration, launch the local Studio:

```bash
genmotion studio <project>
```

When working in Codex, start it with `--no-open`, read the printed local URL, and open that URL in a Codex browser panel when the capability is available. Claude Code can use the default system-browser launch. Do not expose Studio on a public interface.

## Creative workflow

1. Determine the viewer, one promise, proof, desired action, duration, format, energy, and real assets.
2. Keep product claims tied to observed or supplied sources. Designed scenes may explain evidence but cannot manufacture it.
3. Inspect `genmotion_schema` and the project revision. Build an original scene system with transactional patches. Genmotion does not provide a deterministic scene planner; the agent owns creative direction.
4. Use direct property tracks and custom timing whenever the concept needs motion outside the recipe library. Recipes are optional motion DNA, not a gate on creativity.
5. Render and inspect representative native PNG frames during iteration. A schema-valid project is not necessarily a well-directed composition.
6. Use Studio for fine-grained human direction or read [references/authoring.md](references/authoring.md) before editing `genmotion.json` by hand. Read [references/studio.md](references/studio.md) when Studio is active.
7. Run `genmotion validate <project> --strict` and fix every finding.
8. Use `genmotion preview <project>` to review timing, hierarchy, transitions, and holds. For multi-scene work, inspect the frame immediately before, at, and after every boundary; read [references/operations.md](references/operations.md) for the boundary gate.
9. Render the accepted timeline with `genmotion render <project> --output <file> --quality high`. High quality renders vector and type layers at a minimum 1920-pixel long edge instead of merely changing compression. Use `--resolution 3840x2160` or the matching project aspect ratio when a specific delivery size is required.
10. Run `genmotion probe <file>` and `genmotion contact-sheet <file> --output <sheet>`; inspect the actual sheet before delivery.

For reference selection and concept review, read [references/taste.md](references/taste.md). For production rendering, media, and troubleshooting, read [references/operations.md](references/operations.md).

## Studio collaboration

Studio can run an authenticated local Codex or Claude Code conversation directly from its bottom chat bar. No model API key is required. Each turn carries the selected scene, layer, and frame, applies edits to the real Creative IR, and streams its response into the durable request record. Prefer this path when the user is directing work in Studio.

When you are already the active agent in the user's current Codex or Claude chat, Studio requests remain durable project artifacts. Check `genmotion requests <project> --pending` at meaningful handoff points. Apply requested changes to the real Creative IR, validate and inspect the affected frames, then close the loop with:

```bash
genmotion request-resolve <project> --id <request-id> --response "<what changed and what was verified>"
```

Do not mark a request resolved before its edit is saved and validated. Do not overwrite a revision conflict; reload the newer project and reconcile the human's changes.

## Required judgment

- Use references as contrastive knowledge. Retrieve from different visual families and explicitly record what to borrow, avoid, and transform.
- Treat the catalog as reference material. Author direct tracks when they better express the idea; never force a scene into a named recipe.
- One scene gets one dominant move. Supporting motion establishes hierarchy rather than competing for attention.
- The first moving element is the first perceived priority. Order motion by meaning, not declaration order.
- Build, breathe, and resolve. Hold the complete result long enough to understand.
- Treat a camera state as continuity, not decoration. When adjacent scenes reuse the same source or camera coordinate system, the outgoing final crop, position, scale, rotation, fit, and anchor must equal the incoming initial state throughout the host transition. A crossfade does not conceal a mismatched transform.
- Do not reset a focused shot to neutral merely to prepare the next scene. Finish the move, settle, hold, and carry that state forward; begin the next pan or zoom only after the host transition clears unless the seam is intentionally a new shot.
- The host transition owns the boundary. Do not start an incoming zoom, pan, text entrance, or other internal animation during the same overlap unless both sides were authored as one continuous matched handoff.
- Use real product footage or supplied evidence when the scene claims product behavior. Never reconstruct a functioning interface as proof.
- Keep assets local and licensed. Remote render assets are invalid.
- A successful render is not delivery. Probe it, inspect representative frames, and review the encoded output wherever cadence, transitions, source video, or audio matter.

## Completion gate

Do not report completion until the project validates, the final encode matches its resolution and duration contract, the contact sheet has been inspected, every scene boundary advances without a blank/restart/backward jump, audio starts and ends cleanly, captions remain inside safe areas, product evidence is truthful, and no example copy or unsourced claim remains.
