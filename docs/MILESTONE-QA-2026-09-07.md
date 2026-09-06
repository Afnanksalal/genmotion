# Genmotion 2.4.0 milestone validation

This release validates the editing, export and Studio control milestone. The canonical checklist is **75 checked / 317 total**. It does not complete the full capability program.

## Accepted scope

- Shared editing sessions: revision checks, atomic batches, bounded/coalesced undo and redo, reopenable and named checkpoints, stable target queries, sparse nested overrides, explicit reconciliation and materialization.
- Agent integration: typed SDK/CLI/MCP commands, bounded generated schema discovery, permission-scoped Studio connections and synchronized editing context.
- Native authoring: timestamped gesture recordings with pause preservation and proposed-frame review; direct cubic path nodes; Unicode-aware text segmentation, direction and ink/cap-height metrics; deterministic derived metadata and frozen typed JSON/CSV data.
- Export: selected scenes, frame intervals, compositions and groups; explicit alpha preservation or opaque flattening, with real VP9 and ProRes round trips.
- Studio: shared custom listboxes, numeric steppers, checkbox/radio styling, sliders, file controls, marker colors, search clearing and audio playback. Dropdowns stay in their originating dialog. Keyboard navigation, disabled states and responsive placement have browser coverage. See [control contract](STUDIO-CONTROLS.md).

Nine requirements were accepted: GM-047, GM-048, GM-050, GM-052, GM-053, GM-054, GM-056, deterministic derived preflight, and frozen typed data inputs. Broader checklist rows retain their unchecked status.

## Validation

| Check | Result |
| --- | --- |
| Native/unit/integration tests | 236 passed across 68 files |
| Coverage | 88.61% lines/statements, 94.99% functions, 76.10% branches; thresholds unchanged |
| ESLint and TypeScript | Passed |
| Studio browser suite | 51 passed, including desktop/phone control QA |
| Package installation | 565-file archive installed in a temporary directory; CLI 2.4.0, SDK exports, schema discovery and doctor passed |
| Example rendering | All eight masters regenerated at 1920×1080, 30 fps; strict project validation and full decoded playback checks |
| Visual inspection | All eight contact sheets; native and encoded frames around scene boundaries; Studio path/gesture/export previews; desktop and phone-width custom dropdowns |

Native tests verify failed and stale transactions, checkpoint/history recovery, override isolation and reconciliation, tamper detection, schema bounds, recorded pauses, path splitting, decimal frame boundaries and decoded transparent/translucent pixels. Browser tests exercise real file persistence, reload, keyboard and pointer edits, decoded native preview images, LUT import, marker color changes, processed audio controls and responsive layouts.

QA found and fixed oversized MCP schema responses, unwired gesture controls, a preview-image content-policy restriction, floating-point scene-boundary drift, live-context polling during agent work, and browser-default Studio widgets. Browser fixture cleanup retries transient Windows file locks; timeline tests wait for the rendered canvas target before dragging it. Build and browser verification run sequentially because a build replaces served distribution files.

## Examples

Kinetic Type, Data Pulse and Arc One now use explicit scene cuts where overlapping transitions obscured text. Entry frames retain readable content. Display typography in the newer gallery uses native ink/cap-height alignment. Data Pulse now renders exactly 420 frames across decimal-duration scenes, including the frame-288 handoff.

Each example has its source, master, contact sheet and render report. Reports include encoded boundary-frame hashes for repeatable inspection. Arc One is a fictional product concept; its marketing copy is illustrative.

## Limits

- Receipts prove source-document readback, not dispatched-host completion or rendered-frame verification. GM-055 remains open.
- Capability-specific controls for imported unsupported content and host-owned external history remain open.
- Text handling is not a claim of complete Unicode line-breaking or bidirectional-algorithm conformance.
- ProRes output stores the native renderer's 8-bit RGBA source in the selected codec precision; it does not create higher-precision source pixels.
- Automatic content duration requires finite timing anchors and does not infer duration from arbitrary media filenames.
- Studio pointer recording currently targets unparented scene layers. Export PNG previews show source alpha rather than a flattened encoder simulation.
- Language-server integration, distributed rendering and the remaining advanced compositing requirements are not completed by this milestone.

The release workflow verifies and uploads a package archive and SHA256SUMS to GitHub. It does not publish to the npm registry.
