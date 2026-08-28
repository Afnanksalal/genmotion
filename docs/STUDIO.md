# Genmotion Studio

Studio supplies the fine-grained human controls that an autonomous renderer cannot infer from a brief. It is a local web application shipped inside Genmotion, launched with `genmotion studio <project>`, and backed by the exact Creative IR used for native rendering.

## Authoring surfaces

- The node workflow shows the creative brief, ordered scenes, expanded layers, human references, notes, and final export relationship. Node positions and explanatory edges persist.
- The inspector edits project delivery settings, brand colors, scene timing and transitions, layer geometry and content, and named motion assignments.
- The native preview renders exact project frames. Playback, scrubbing, scene clips, and the playhead use the project's real frame rate and duration.
- The reference board accepts local images, annotations, and tags. References connect to scenes without turning source artwork into a copied template.
- The asset browser ingests local image, video, audio, and font files into content-addressed project storage and can attach visual media to the active scene.
- History stores recoverable project revisions. Browser undo and redo cover the current editing session.
- Export runs the native render pipeline as a background job and reports progress without blocking authoring.

## Human and agent loop

The bottom request bar writes a durable request containing the prompt and current scene, layer, and frame selection. An agent reads pending work with:

```bash
genmotion requests <project> --pending
```

After changing the real project, validating it, and inspecting affected frames, the agent resolves the request:

```bash
genmotion request-resolve <project> --id <request-id> --response "Adjusted the selected scene and verified frames 120, 138, and 164."
```

This makes iteration inspectable and asynchronous. Studio does not claim an agent is connected when no agent process is checking requests.

## Persistence

- `genmotion.json`, YAML equivalent: renderer-owned project data
- `.genmotion/studio.json`: node layout, notes, and reference metadata
- `.genmotion/history/`: recoverable previous project revisions
- `.genmotion/requests/`: pending and resolved human requests
- `assets/studio/`: content-addressed imported assets
- `renders/`: exported masters

## Security

Studio binds to `127.0.0.1` unless explicitly configured otherwise. Do not bind it to a public interface. Mutations require the random session token obtained by the loaded page. Asset paths cannot escape the project and remote assets remain forbidden. Uploaded content is size limited and must match an allowlisted media or font signature. Project writes are atomic and reject stale revisions rather than silently overwriting another actor's work.
