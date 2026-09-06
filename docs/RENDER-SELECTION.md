# Composition, scene and frame-range exports

Implemented in 2.4.0. See the [milestone QA report](MILESTONE-QA-2026-09-07.md) for tested paths and remaining acceptance limits.

SDK `renderProject` accepts either `sceneId` or `range: {startFrame, endFrame}`. Range endpoints are integer source frames with an exclusive end; at least one frame must lie inside the project. Scene selection calculates the interval from the resolved timeline, including parameter-driven and automatic durations. A scene with no integer frame inside its interval is refused.

```sh
genmotion render ./project --scene closing
genmotion render ./project --frames 120:240 --output ./excerpt.mp4
```

MCP `genmotion_render` exposes the same selection fields. Studio's export dialog offers whole-project, scene, named-range and custom-frame choices. Named ranges convert their second-based boundaries to source-frame intervals. Result metadata and queued Studio jobs identify the selected source interval.

The frame pool samples the original project frame numbers. It does not rebase animation, transitions, noise, video time mapping or composition-local playback. Audio processing and loudness normalization retain the full-project context; the final processed mix is trimmed to the selected interval and rebased to output time zero. This retains preceding effect and envelope state, at the cost of processing audio before the selected interval. It does not normalize an excerpt independently.

Selected output duration is the number of selected frames divided by project FPS. Output verification checks that duration, dimensions and frame rate before atomic destination replacement. Render identities include the selection. Default CLI/SDK output names include the selected scene or frame interval; explicit output paths take precedence. Studio automatically updates its suggested filename until the user edits it.

Scene interval export retains surrounding project transition context. For isolation, SDK/MCP `compositionId` and CLI `--composition` wrap a resolved composition on its local canvas, FPS and duration using the native composition playback path. Its effects, background and embedded video audio remain; the global soundtrack is excluded. Local canvas dimensions are rounded up to pixels and must meet the project canvas contract. The selected composition can also take a local frame range through SDK/MCP or CLI `--frames`.

Studio lists standalone compositions in its export selector. CLI `frame --composition` and MCP `genmotion_frame` with `compositionId` also export stills on the local timeline. SDK callers can use `projectForRenderComposition` before rendering a still. The source project is not modified.


For a layer group, SDK/MCP accept `group: {sceneId, layerId}`; CLI render and frame commands accept `--group scene-id/layer-id`. The group includes the selected layer and its parented descendants, including the contents of selected composition instances. Up to 10000 scene layers may be selected. The full scene graph remains available for constraints, property links and external parent transforms; only selected layers paint. Scene effects and transition poses remain, while the scene background, other scenes and transition overlays are omitted. Group output keeps the full project canvas and global frame coordinates. It is not automatically cropped to content bounds.

Group video export defaults to the containing scene interval. An explicit range must remain within that interval. Source audio is restricted to selected video layers and selected composition instances; the global soundtrack is excluded. Source processing and master settings still apply to that isolated audio selection. PNG stills preserve transparency. Video transparency is controlled explicitly as described below.

Studio offers the currently selected layer group in its export selector. **Preview selected output** renders up to three native frames at reduced resolution, with a checkerboard for transparency and source-frame labels. Changing the selection or range invalidates these preview images. Project revisions are checked before and after previews; previews are separate from full output verification.

## Transparency

CLI `--alpha-mode auto|preserve|flatten`, SDK/MCP `alphaMode`, and Studio's Transparency selector share one contract. Auto preserves VP9 alpha and flattens other codecs onto black. Supplying `alphaBackground` (CLI `--alpha-background`) selects an opaque CSS background in auto mode. Preserve requires VP9 WebM or ProRes; ProRes uses 4444, or 4444 XQ at high quality. H.264 and H.265 reject preserve mode before rendering. An explicit background conflicts with preserve mode.

Flatten composites straight RGBA onto the opaque background before YUV encoding. ProRes alpha is encoded with 16-bit storage, but native canvas pixels remain 8-bit RGBA. The output probe checks alpha signaling; regression tests additionally decode transparent and translucent pixels through both alpha codecs. Studio's PNG previews show source transparency before encoding; they do not simulate flattening or codec artifacts.
