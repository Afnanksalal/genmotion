<p align="center">
  <img src="assets/genmotion-symbol.svg" width="104" height="104" alt="Genmotion symbol">
</p>

<h1 align="center">Genmotion</h1>

<p align="center"><strong>Native motion design for agents.</strong></p>

Genmotion is an agent-native motion design engine and visual editor. Hermes ACP, Codex, or Claude authors the actual scene graph, timing, vector geometry, keyframes, custom easing, media, and sound through structured local tools; humans can then direct every layer and phase in Studio. Native Skia frame workers stream the accepted composition directly into FFmpeg.

High-quality export means actual delivery resolution, not a low-resolution canvas with a better codec setting. `high` renders vector, type, and procedural layers at a minimum 1920-pixel long edge and encodes H.264 at CRF 14. `standard` targets at least 1280 pixels, while `draft` preserves the project's native working size. Every master is probed after encode for dimensions, frame rate, and duration.

It does not render React, HTML, CSS, a browser page, Remotion, or HyperFrames.

## Why it exists

General agents can write animation code, but code generation alone gives them a poor iteration surface. Genmotion gives the model a visual authoring loop while keeping the output inspectable:

- arbitrary agent-authored numeric property tracks with named, cubic-bezier, or spring timing;
- reusable nested compositions with local time offset, scaling, looping, deterministic cycle rejection, and one shared Creative IR;
- typed parameters, named variants, layer bindings, CLI/MCP overrides, and deterministic batch variant rendering;
- measured SVG path geometry with native trim drawing, point/tangent sampling, path-follow motion, cubic Bezier connectors, and shared anchors;
- first-class caption layers with word timing/highlighting and provider-neutral SRT, WebVTT, and timed-JSON conversion;
- transition timing separated from presentation, including native iris and directional wipe presentations;
- optional motion recipes that act as reusable references rather than a closed animation vocabulary;
- reference studies decomposed into composition, hierarchy, pacing, typography, surface, and motion decisions;
- contrastive retrieval that states what to borrow, avoid, and transform;
- transactional Creative IR patches with revision checks, visual frame responses, and evaluated timeline inspection;
- a typed Creative IR that agents and Studio edit together instead of hiding decisions in generated renderer code;
- validation that blocks invalid assets, timelines, transitions, opacity, geometry, and unsafe render contracts.

## Renderer

- Native Skia rasterization through `@napi-rs/canvas`
- No browser, DOM, React reconciliation, or screenshot capture
- Reproducible frame evaluation from project data, timestamp, and seed
- Continuous cross-scene transition evaluation with boundary mismatch validation
- Symlink- and junction-safe CLI execution for local and global development installs
- Parallel worker-thread frame generation
- Ordered raw RGBA streaming into FFmpeg while frames continue rendering
- Cancellation-safe export cleanup with no partial masters or hidden silent intermediates
- H.264, H.265, VP9, and ProRes outputs
- Image and video layers with local media freezing
- Multiple audio tracks with mute, solo, constant-power stereo pan, fades, looping, voice-aware music ducking, limiting, and AAC delivery
- Reusable native preview server with frame scrubbing
- Local Studio with visual color wells, CapCut-style canvas formats that reframe the real scene graph, searchable large-project navigation, automatic hierarchical workflow layout, visual easing curves, usage-aware asset search, project-local JSON motion libraries, a reference board, direct canvas transforms, magnetic frame-snapped layer, audio, and motion timelines, source-aware trimming, bounded revision and conversation history, agent conversations, and cancellable native export jobs with persistent downloadable masters
- Output probing and contract verification after every render

## Public examples

The [`examples/`](examples/) gallery contains four complete, editable projects with frozen assets, strict validation, rendered masters, and inspected contact sheets:

- **Kinetic Type** demonstrates clipped typography, direct property tracks, custom easing, and scene rhythm.
- **Data Pulse** demonstrates animated counters, converging signal fields, SVG path drawing, blend modes, and an editorial data-story resolve.
- **Arc One** demonstrates original vector product geometry, shadows, blend modes, macro movement, stable lockups, and a mixed stereo soundtrack.
- **Native Milestones** is an asset-free integration fixture for reusable compositions, typed variants, measured path motion, captions, and transition presentations.

Every project is reproducible with `npm run examples:build` and verified with `npm run examples:verify`; no remote render asset or external template is required.

## Requirements

- Node.js 22 or newer
- FFmpeg and ffprobe on `PATH`

## Install

One command on Windows:

```powershell
irm https://raw.githubusercontent.com/Afnanksalal/genmotion/main/scripts/install.ps1 | iex
```

One command on macOS or Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Afnanksalal/genmotion/main/scripts/install.sh | sh
```

The installers resolve the latest published GitHub release, verify Node.js 22+, install FFmpeg when a supported package manager is available, download the packaged CLI, verify it against the release's SHA-256 manifest, install it globally, and finish by running `genmotion doctor`. Review the scripts before executing them in a managed environment.

From npm and GitHub when the runtime is already installed:

```bash
npm install -g git+https://github.com/Afnanksalal/genmotion.git
genmotion doctor
```

Each tagged GitHub release publishes a tested `.tgz` package artifact and `SHA256SUMS`. The package carries a publishable shrinkwrap for reproducible runtime dependency resolution. Release packaging enforces that the tag matches `package.json`, performs a clean package-install smoke test, and reruns the unit, integration, native render, example verification, and Studio browser suites before attaching the artifact.

Or work from a checkout:

```bash
npm install
npm run build
node dist/cli.js doctor
```

## Callable tools for Codex and Claude

Genmotion ships a local MCP server with the same production engine used by the CLI and Studio:

```bash
genmotion-mcp
```

Register it with Codex:

```bash
codex mcp add genmotion -- genmotion-mcp
```

Register it with Claude Code:

```bash
claude mcp add genmotion --scope user -- genmotion-mcp
```

The server exposes the complete schema, revision-safe reads, transactional RFC 6902 patches, full-document saves, evaluated timeline inspection, visual PNG responses, validation, high-resolution rendering, probing, contact sheets, Studio, preview, and durable Studio requests. It uses local stdio, needs no model API key, and rejects paths outside the current workspace unless additional roots are explicitly provided through `GENMOTION_ALLOWED_ROOTS`.

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
genmotion render launch-film --variant social --params '{"headline":"A precise launch"}' --output launch-film/renders/acme-social.mp4
genmotion render-variants launch-film --output launch-film/renders/variants --quality standard
genmotion render launch-film --output launch-film/renders/acme-4k.mp4 --quality high --resolution 3840x2160
genmotion probe launch-film/renders/acme.mp4
genmotion contact-sheet launch-film/renders/acme.mp4 --output launch-film/renders/contact-sheet.jpg
```

Studio lists and creates projects in `~/Genmotion Projects` by default. Use `--workspace <directory>` to select another local project workspace.

`init` creates a truthful `brief.json` and a neutral renderable artboard. It does not pretend that a fixed template is an AI-generated design. Open Studio and choose **Create with agent**, or let the calling Hermes, Codex, or Claude workflow inspect `genmotion_schema`, patch the project, render representative frames, and iterate visually.

## Local agent direction

Studio connects directly to Hermes through ACP and to Codex or Claude Code installed on the same machine. A new project can immediately enter **Create with agent**, which sends its real brief to the selected host. Later prompts include the focused scene, layer, and frame. Hermes receives Genmotion's project-scoped MCP server over its native ACP session, Claude receives a generated project-scoped MCP configuration, and Codex uses the registered Genmotion tools. Every host can patch precise properties and inspect actual native frames before finishing.

This workflow uses the existing ChatGPT or Claude sign-in managed by the local agent. Genmotion does not request, store, or configure model API keys.

## Commands

| Command | Purpose |
| --- | --- |
| `init` | Create a neutral artboard and real brief for agent or Studio authoring |
| `validate` / `check` | Validate schema, assets, timing, reference decisions, readability, and render safety |
| `frame` | Render a native PNG at an exact timeline time |
| `preview` | Open the interactive native-rendered timeline preview |
| `studio` | Open the local node workflow, reference, inspector, timeline, and export workspace |
| `requests` | List durable Studio agent conversations and externally queued feedback |
| `request-resolve` | Close externally handled feedback after its change is saved and verified |
| `render` | Render and encode a delivery video |
| `render-variants` | Render every named typed variant into a deterministic output set |
| `captions-import` | Parse SRT, WebVTT, or timed JSON into Creative IR cues |
| `captions-export` | Export a caption layer as SRT, WebVTT, or timed JSON |
| `probe` | Inspect codecs, dimensions, duration, frame rate, audio, and size |
| `contact-sheet` | Generate representative visual review frames |
| `catalog` | Search motions, blueprints, and taste references by creative intent |
| `catalog-audit` | Verify catalog identifiers, cross-references, licenses, and accessibility constraints |
| `doctor` | Verify Node.js, FFmpeg, ffprobe, and native Skia |
| `benchmark` | Measure real native render and encode throughput |

Every command supports top-level `--json` output for agent and CI use.

## Project contract

A project is `genmotion.json`, `genmotion.yaml`, or `genmotion.yml`. It declares:

- delivery dimensions, frame rate, seed, brand tokens, typed parameters, and named variants;
- ordered scenes with explicit durations and transitions;
- reusable compositions plus text, caption, vector shape, image, video, and composition-instance layers;
- arbitrary property tracks, custom cubic-bezier or spring easing, SVG paths, direct keyframes, and optional named motion directives;
- locally frozen assets and licensed fonts;
- positioned audio tracks and mixing behavior;
- reference decisions that preserve the creative rationale.

See [docs/IR.md](docs/IR.md) for the complete authoring model, [docs/STUDIO.md](docs/STUDIO.md) for the human and agent collaboration contract, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for renderer and throughput design.

The exhaustive, version-controlled capability program is tracked in [docs/NATIVE-CAPABILITY-BACKLOG.md](docs/NATIVE-CAPABILITY-BACKLOG.md). It records every transferable capability from the Remotion audit together with Genmotion's native-rendering and single-IR guardrails; partial or Studio-only implementations remain unchecked.

## Skills

The repository ships an Agent Skill at [`skills/genmotion`](skills/genmotion) and a Claude Code discovery entry at [`.claude/skills/genmotion`](.claude/skills/genmotion). The same workflow can be installed for Codex or Claude Code. The separate [Product Demo Video Skill](https://github.com/Afnanksalal/product-demo-video-skill) uses Genmotion for every constructed motion scene while retaining Playwright for real product capture and FFmpeg for raw-footage cleanup.

## Development

```bash
npm ci
npm run check
npm run benchmark
```

The test suite covers agent-authored tracks, custom easing, transactional patches, schema discovery, visual MCP responses, timeline evaluation, pixel-level transition continuity, native frame reproducibility, real video decoding, Studio persistence and security, local agent orchestration, preview delivery, H.264 encoding, and AAC audio muxing.

## Security

Remote render assets are rejected. Freeze every asset inside the project so renders remain reproducible and cannot perform render-time network access. Paths may not escape the project directory. Studio binds to loopback by default, protects mutations with a session token, and runs local agents with project-scoped write access and network access disabled. See [SECURITY.md](SECURITY.md).

## License

MIT. The abstract taste references are original CC0 reference studies and include provenance in the catalog. No third-party source artwork is distributed.
