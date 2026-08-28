---
name: genmotion
description: Create, edit, preview, validate, and render designed motion graphics with the Genmotion native renderer. Use for launch films, title cards, explainers, diagrams, data motion, brand choreography, product framing, and reusable video compositions. Do not use it for recording real browser interactions; capture those first and use them as truthful media assets.
license: MIT
metadata:
  author: afnanksalal
  version: "1.0.0"
---

# Genmotion

Use Genmotion as the only constructed-motion renderer. Do not introduce Remotion, HyperFrames, HTML compositions, browser screenshots of reconstructed interfaces, or ad hoc FFmpeg filter graphs for designed scenes.

Genmotion projects are typed JSON or YAML. Agents choose story, hierarchy, content, references, and named motion recipes. The engine owns layout evaluation, animation execution, media decoding, parallel native rendering, audio mixing, encoding, and output verification.

## Start

Run `genmotion doctor --json`. If the command is unavailable inside a Genmotion checkout, run `npm install && npm run build` and use `node dist/cli.js`. In a consuming project with Genmotion installed locally, use `npx genmotion`.

For a new project:

```bash
genmotion init <directory> --title "<real title>" --promise "<one real promise>" --audience "<primary audience>" --mode <walkthrough|launch|pitch|explainer> --duration <seconds>
```

Replace the generated proof sentence with sourced facts, add local assets with provenance, and set real brand colors and fonts in `brief.json`. Never leave example facts in a delivery project.

## Creative workflow

1. Determine the viewer, one promise, proof, desired action, duration, format, energy, and real assets.
2. Keep product claims tied to observed or supplied sources. Designed scenes may explain evidence but cannot manufacture it.
3. Run `genmotion plan <project> --brief <brief.json> --concepts 8`.
4. Review `.genmotion/concepts.json`. Confirm that the selected direction borrows, avoids, and transforms reference knowledge instead of imitating one reference.
5. Read [references/authoring.md](references/authoring.md) before editing `genmotion.json` by hand.
6. Run `genmotion validate <project> --strict` and fix every finding.
7. Render representative frames with `genmotion frame <project> --at <seconds> --output <file>`.
8. Use `genmotion preview <project>` to review timing, hierarchy, transitions, and holds.
9. Render the accepted timeline with `genmotion render <project> --output <file> --quality high`.
10. Run `genmotion probe <file>` and `genmotion contact-sheet <file> --output <sheet>`; inspect the actual sheet before delivery.

For reference selection and concept review, read [references/taste.md](references/taste.md). For production rendering, media, and troubleshooting, read [references/operations.md](references/operations.md).

## Required judgment

- Use references as contrastive knowledge. Retrieve from different visual families and explicitly record what to borrow, avoid, and transform.
- Prefer reusable motion DNA over full-scene imitation. Search with `genmotion catalog "<semantic intent>"` before assigning motion.
- One scene gets one dominant move. Supporting motion establishes hierarchy rather than competing for attention.
- The first moving element is the first perceived priority. Order motion by meaning, not declaration order.
- Build, breathe, and resolve. Hold the complete result long enough to understand.
- Use real product footage or supplied evidence when the scene claims product behavior. Never reconstruct a functioning interface as proof.
- Keep assets local and licensed. Remote render assets are invalid.
- A successful render is not delivery. Probe it and inspect representative frames.

## Completion gate

Do not report completion until the project validates, the final encode matches its resolution and duration contract, the contact sheet has been inspected, audio starts and ends cleanly, captions remain inside safe areas, product evidence is truthful, and no example copy or unsourced claim remains.
