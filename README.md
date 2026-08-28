# Genmotion

Genmotion is an agent-native motion design engine with a deterministic native renderer and a curated taste system. It turns a creative brief into divergent, reference-aware directions, compiles the selected direction into a typed timeline, renders frames through native Skia, and streams them directly into FFmpeg.

It does not render React, HTML, CSS, a browser page, Remotion, or HyperFrames.

## Why it exists

General agents can write animation code, but unconstrained code generation does not create visual judgment. Genmotion moves judgment into maintained creative infrastructure:

- handcrafted motion recipes with semantic roles, constraints, cost, and accessibility guidance;
- reference studies decomposed into composition, hierarchy, pacing, typography, surface, and motion decisions;
- contrastive retrieval that states what to borrow, avoid, and transform;
- divergent concept generation followed by deterministic ranking;
- a typed Creative IR that agents edit instead of generating renderer code;
- validation that blocks invalid assets, timelines, transitions, opacity, geometry, and unsafe render contracts.

## Renderer

- Native Skia rasterization through `@napi-rs/canvas`
- No browser, DOM, React reconciliation, or screenshot capture
- Deterministic frame evaluation from project data, timestamp, and seed
- Parallel worker-thread frame generation
- Ordered raw RGBA streaming into FFmpeg while frames continue rendering
- H.264, H.265, VP9, and ProRes outputs
- Image and video layers with local media freezing
- Multiple audio tracks, fades, looping, voice-aware music ducking, limiting, and AAC delivery
- Reusable native preview server with frame scrubbing
- Local Studio with node workflows, a reference board, direct canvas transforms, magnetic frame-snapped layer, audio, and motion timelines, source-aware trimming, revision history, agent conversations, and native export jobs
- Output probing and contract verification after every render

## Requirements

- Node.js 22 or newer
- FFmpeg and ffprobe on `PATH`

## Install

From GitHub:

```bash
npm install -g https://github.com/Afnanksalal/genmotion/releases/download/v1.4.0/genmotion-1.4.0.tgz
genmotion doctor
```

Or work from a checkout:

```bash
npm install
npm run build
node dist/cli.js doctor
```

## Create a project

```bash
genmotion init launch-film \
  --title "Acme" \
  --promise "Ship verified releases without release-day chaos" \
  --proof "Every release includes a signed deployment record" \
  --action "Review the release workflow" \
  --audience "platform engineering teams" \
  --mode launch \
  --duration 30

genmotion validate launch-film --strict
genmotion studio launch-film
genmotion preview launch-film
genmotion render launch-film --output launch-film/renders/acme.mp4 --quality high
genmotion probe launch-film/renders/acme.mp4
genmotion contact-sheet launch-film/renders/acme.mp4 --output launch-film/renders/contact-sheet.jpg
```

`init` creates a valid `brief.json`, a ranked creative direction, and a renderable `genmotion.json`. Edit the brief with real proof, assets, brand fonts, and delivery language, then regenerate:

```bash
genmotion plan launch-film --brief launch-film/brief.json --concepts 8
```

The ranked concepts are preserved in `.genmotion/concepts.json`. The selected concept is compiled into `genmotion.json`.

## Local agent direction

Studio connects directly to Codex or Claude Code installed on the same machine. Choose the signed-in host beside the prompt bar, describe a change or ask a question, and follow the streamed result in the request panel. The conversation is persisted per project and edits are applied to the same typed Creative IR used by preview and render.

This workflow uses the existing ChatGPT or Claude sign-in managed by the local agent. Genmotion does not request, store, or configure model API keys.

## Commands

| Command | Purpose |
| --- | --- |
| `init` | Create a renderable project from a real promise, proof point, and viewer action |
| `plan` | Retrieve diverse references, generate concepts, rank them, and compile the selected direction |
| `validate` / `check` | Validate schema, assets, timing, reference decisions, readability, and render safety |
| `frame` | Render a native PNG at an exact timeline time |
| `preview` | Open the interactive native-rendered timeline preview |
| `studio` | Open the local node workflow, reference, inspector, timeline, and export workspace |
| `requests` | List durable Studio agent conversations and externally queued feedback |
| `request-resolve` | Close externally handled feedback after its change is saved and verified |
| `render` | Render and encode a delivery video |
| `probe` | Inspect codecs, dimensions, duration, frame rate, audio, and size |
| `contact-sheet` | Generate representative visual review frames |
| `catalog` | Search motions, blueprints, and taste references by creative intent |
| `catalog-audit` | Verify catalog identifiers, cross-references, licenses, and accessibility constraints |
| `doctor` | Verify Node.js, FFmpeg, ffprobe, and native Skia |
| `benchmark` | Measure real native render and encode throughput |

Every command supports top-level `--json` output for agent and CI use.

## Project contract

A project is `genmotion.json`, `genmotion.yaml`, or `genmotion.yml`. It declares:

- delivery dimensions, frame rate, seed, and brand tokens;
- ordered scenes with explicit durations and transitions;
- text, vector shape, image, and video layers;
- absolute keyframes and named motion directives;
- locally frozen assets and licensed fonts;
- positioned audio tracks and mixing behavior;
- reference decisions that preserve the creative rationale.

See [docs/IR.md](docs/IR.md) for the complete authoring model, [docs/STUDIO.md](docs/STUDIO.md) for the human and agent collaboration contract, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for renderer and throughput design.

## Skills

The repository ships an Agent Skill at [`skills/genmotion`](skills/genmotion) and a Claude Code discovery entry at [`.claude/skills/genmotion`](.claude/skills/genmotion). The same workflow can be installed for Codex or Claude Code. The separate [Product Demo Video Skill](https://github.com/Afnanksalal/product-demo-video-skill) uses Genmotion for every constructed motion scene while retaining Playwright for real product capture and FFmpeg for raw-footage cleanup.

## Development

```bash
npm ci
npm run check
npm run benchmark
```

The test suite covers schema behavior, deterministic timeline evaluation, creative retrieval, concept diversity, catalog integrity, native frame determinism, real video decoding, Studio persistence and security, local agent orchestration, preview delivery, H.264 encoding, and AAC audio muxing.

## Security

Remote render assets are rejected. Freeze every asset inside the project so renders remain reproducible and cannot perform render-time network access. Paths may not escape the project directory. Studio binds to loopback by default, protects mutations with a session token, and runs local agents with project-scoped write access and network access disabled. See [SECURITY.md](SECURITY.md).

## License

MIT. The abstract taste references are original CC0 reference studies and include provenance in the catalog. No third-party source artwork is distributed.
