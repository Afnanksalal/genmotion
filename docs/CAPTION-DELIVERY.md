# Caption styling and delivery

Caption layers are native timed graphics. Each layer may declare a BCP 47 `language`, a human-readable `trackName`, whether it is the default track, a project-level `stylePresetId`, and deterministic `enter`/`exit` motion. Project `captionPreviewLanguages` chooses which language is visible in Studio and native preview. An empty selection renders default tracks, preserving single-track projects.

`captionStylePresets` stores named project-wide style values. Resolution is deterministic: the named preset is applied first, then the cue's speaker style, then its per-cue override. Source presets and overrides remain separate, so changing a preset updates every inheriting cue without destroying local exceptions. Validation rejects missing preset IDs and malformed language tags.

`createCaptionDeliveryPlan(project, options)` is the shared SDK contract. It resolves caption cue times to the absolute project timeline and supports:

- `burned-in`: returns the exact native caption layer IDs to render.
- `sidecar`: emits deterministic SRT or WebVTT artifacts per language.
- `embedded`: emits the sidecar inputs plus container-specific mux metadata (`mov_text` for MP4/MOV, SubRip for Matroska, WebVTT for WebM).

The planner rejects empty language selections, duplicate default tracks for one language, missing embedded containers, malformed language tags, and unsupported container/format values. It never changes project source or silently substitutes a delivery mode.

CLI:

```sh
genmotion captions-delivery ./project --mode embedded --languages en-US,fr --format vtt --container mp4 --json
```

MCP exposes the same operation as `genmotion_captions_delivery`. Studio exposes `POST /api/captions-delivery`; its request body is the same options object. Caption rendering uses the same preset resolver and language router as delivery planning, including deterministic entrance and exit easing at arbitrary seek order.
