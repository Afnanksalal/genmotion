# Native rendering

`renderProject` is the shared render service used by the SDK, CLI, MCP and Studio. It prepares local video assets, evaluates native frames, encodes, mixes audio, and verifies the output before replacing the destination. A failed or cancelled job preserves an existing master. Intermediates live in a unique directory beside the destination and are removed after workers and processes close.

## Resource controls

```sh
genmotion render ./project --output ./renders/master.mp4 --workers 4 --max-buffered-frames 2 --max-buffered-bytes 67108864 --timeout-ms 300000
```

The SDK accepts `workers`, `maxBufferedFrames`, `maxBufferedBytes`, `timeoutMs`, `signal`, and `onProgress`. The `genmotion_render` MCP tool and Studio's authenticated `POST /api/render` accept the same numeric controls. MCP request cancellation reaches the render service. The CLI handles SIGINT and SIGTERM and removes its handlers when the job finishes.

Workers default to at most four; an explicit request may use at most sixteen. The default frame reservation budget is 256 MiB or one output frame, whichever is larger. Effective concurrency is the smallest of the worker count, frame limit, frames remaining, and the number of RGBA frames that fit the byte budget. A budget too small for one frame is rejected before work starts. A slow frame or blocked encoder does not allow later work to accumulate outside this window.

This budget covers frame reservations, not total process memory. Native canvases, decoded assets, worker runtimes, and FFmpeg have additional memory costs. Progress reports include in-flight and buffered counts, buffered bytes, reservation limits, elapsed time and frame throughput. The result includes peak completed-frame bytes and effective worker count.

Each native runtime retains at most 128 MiB and 64 entries of decoded image/video-frame cache. Oversized images can be drawn but are not retained. The cache checks source size and filesystem timestamps before reuse and removes failed decodes. These checks are invalidation hints, not cryptographic asset identity.

Video preparation writes a unique staging directory, checks frame availability and source stability, and atomically switches the manifest to a completed generation. Failed or cancelled preparation removes pending files and preserves the previous accepted cache. Cache variants include source, trim, rate, FPS and effective duration, so same-named layers with different clip settings cannot overwrite each other. Legacy video caches are rebuilt on first preparation. Completed generations remain on disk; cache eviction and content-hash reproducibility manifests are separate backlog work.

Deadlines cover media preparation through output verification, in milliseconds from render start. The maximum is 2147483647 ms. Studio queue waiting time is outside the render deadline. A queued job captures the submitted project revision; later project edits do not change it. Source asset files must remain available and unchanged for the job.

## Output contract

| Codec | Container | Audio |
| --- | --- | --- |
| H.264 | MP4 or MOV | AAC |
| H.265 | MP4 or MOV | AAC |
| VP9 | WebM | Opus |
| ProRes | MOV | AAC |

Incompatible extensions fail before encoding. Studio updates the extension when the codec changes. Variant exports choose the codec's default extension. Verification checks dimensions, frame rate and duration; the returned `probe` is captured from the staged output before it is accepted. Verification does not certify visual quality, loudness, or every decoded frame.

Stages are `preparing`, `rendering`, `encoding`, `mixing`, `verifying`, and `complete`. Studio displays these stages instead of leaving the dialog at “Rendering 100%” while audio and verification continue. Completion is authoritative only after the render promise resolves or Studio reports a complete job.

## Regression coverage

`tests/frame-stream.test.ts` blocks the first frame and encoder independently, including 4K RGBA buffers, and checks bounded reservations and ordering. `tests/process.test.ts` checks process exit, pipe lifecycle, cancellation, deadlines and output limits. `tests/render.test.ts` checks output preservation, deadline and destination contention, cancellation at pipeline boundaries, and real encode/decode with audio for all four codecs. Studio tests cover queued revision isolation, limits, duplicate output rejection, cancellation and output delivery. Browser tests exercise the export dialog and cancellation.

These checks cover the implemented render lifecycle. They do not establish completion of the full native capability backlog.
