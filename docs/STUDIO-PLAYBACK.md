# Studio playback

Studio renders the Creative IR with the native renderer on persistent worker threads. Live playback sends bounded, viewport-sized RGBA frames directly to a browser canvas. It does not encode or decode a PNG for every playback frame. Paused inspection requests full-resolution PNGs on a separate worker, and the PNG encoder operates directly on the drawn canvas.

The browser keeps at most two fetches active and a 64 MiB decoded playback cache, with a 48-entry ceiling. Completed frames can be presented even when rendering took longer than one clock interval. Upcoming frames are prefetched, including loop boundaries. A seek, revision change or preview-resolution change invalidates stale work. Obsolete bitmaps and object URLs are released. Hiding the page pauses playback.

Preview resolution follows viewport dimensions and device pixel ratio, bounded to 2048 pixels on the long edge. Sustained slow requests reduce resolution; sustained headroom can restore it. The preview badge reports presented FPS and dimensions. Full-resolution inspection and master exports remain available. This is a native CPU-rendering and browser-canvas pipeline; it does not claim a new WGPU rendering backend or universal real-time performance for arbitrary effects, hardware or remote connections.

The controller checks overload every second using request latency and displayed-frame lag. Quality recovery requires five seconds of headroom. This asymmetric timing lets slower machines recover promptly without repeatedly changing resolution.

Resolution changes reuse the existing native workers and carry dimensions with each request, avoiding worker startup pauses during playback. Project revisions and transport formats still replace the worker context.

Server preview queues are bounded independently of exports. Identical in-flight frames are shared. Cache identity includes project revision, dimensions, transport format and exact frame time. Stale revision requests are refused, while unversioned responses cannot be cached immutably. Studio closes its workers and settles queued requests when shutting down.

## Validation

`node scripts/benchmark-studio-playback.mjs` runs after building and requires Playwright Chromium. It measures actual presentations after a 2.5-second warmup, over a 5-second window, at a 1920×1080 Studio viewport. It fails below 90% of the project's frame rate, on frame errors, or when the 95th-percentile displayed-frame lag exceeds the greater of two frames and 100 ms. Run it without competing builds or benchmarks. CI and release jobs run the same benchmark.

Local measurements on Windows, Node 22.14.0, Ryzen 5 5600H:

| Example | Target FPS | Presented FPS | Preview | Cache | Errors | P95 / maximum sampled lag |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Kinetic Type | 30 | 29.96 | 1280×720 | 63.28 MiB | 0 | 0 / 0 frames |
| Data Pulse | 30 | 29.98 | 1280×720 | 63.28 MiB | 0 | 0 / 0 frames |
| Chromatic Orbit | 30 | 29.95 | 1280×720 | 63.28 MiB | 0 | 0 / 0 frames |

The initial full-resolution PNG path took median 94.7, 141.7 and 134.9 ms per frame respectively in five-frame local samples. These timings describe frame production, not a measured prior playback FPS. Live playback now bypasses PNG compression and uses parallel, viewport-sized rendering.

Regression tests verify visible frame advancement under delayed responses, bounded requests, precise fractional seeking, stale revision rejection, transport dimensions, raw/PNG pixel equivalence, queue saturation, revision replacement and worker shutdown. Benchmark JSON and screenshots are written under `output/playback-qa`.

The patch passed 239 native tests, all 53 Studio browser tests, lint and type checking. Native coverage was 88.25% of lines, 94.76% of functions and 75.94% of branches, with the existing thresholds unchanged.
