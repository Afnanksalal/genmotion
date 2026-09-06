# Explicit SDR media preparation

`conformMedia` creates a new source derivative at a requested constant frame rate and even output dimensions. It uses native FFmpeg decoding, automatic display rotation, square-pixel output, and explicit BT.709 primaries, transfer, matrix and limited range. Output is ProRes 422 HQ/MOV or H.264/MP4. The first audio stream is preserved as 48 kHz PCM or AAC; other audio/subtitle streams are not included in this derivative contract.

Input transfer, primaries, matrix and range come from source tags or explicit user assumptions. Missing or unsupported tags are rejected rather than silently interpreted as BT.709. Supported input profiles include BT.709, BT.2020 PQ/HLG, sRGB and linear transfer with the exposed primaries/matrix choices. Embedded ICC profiles and arbitrary camera-log transforms require separate source preparation.

HDR sources require Hable, Mobius or Reinhard tone mapping; automatic mode selects Hable for PQ/HLG and no tone mapping for SDR. The pipeline linearizes into float RGB, converts primaries, tone maps, then encodes BT.709. FFmpeg documents the linear-light requirement for its tone-map filter in its [native implementation history](https://ffmpeg.org/pipermail/ffmpeg-devel/2017-July/213824.html); `zscale` exposes [nominal peak luminance](https://ffmpeg.org/pipermail/ffmpeg-cvslog/2021-February/126101.html). Mastering-display and content-light side data are removed after conversion using the [native side-data filter](https://ffmpeg.org/doxygen/6.1/f__sidedata_8c_source.html). Installed filter help was inspected while implementing the supported option names.

These output profiles discard alpha. Detected alpha planes require explicit `allowAlphaLoss`; otherwise the operation refuses. Output dimensions scale the source to the requested size, so preserve its display aspect ratio when avoiding stretch.

The source remains untouched. Existing destinations are refused, and publication uses an atomic same-volume hard link that also refuses a racing writer's file. Before publication, the derivative is probed for dimensions, duration, frame rate and SDR color tags and fully decoded. The receipt includes source/output SHA-256 hashes, conversion plan and output stream metadata. Source changes during the operation invalidate the result. Private staging is removed after success, failure or cancellation.

Limits are one-hour source windows, 8192-pixel dimensions, a 32 GiB source, a 16 GiB encoded derivative and a shared default 30-minute deadline. The encoded-size limit does not accept a truncated delivery: duration verification must still pass. Studio allows one conversion at a time and provides cancellation.

CLI `media-conform <source> --output <new-file> --options <json>` and MCP `genmotion_media_conform` support dry-run plans. Studio exposes a typed conversion dialog from source metadata, including missing color assumptions, output dimensions/rate, tone mapping and derivative placement in a scene. Conforming is explicit; loading an HDR asset does not silently change its color space.

Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md). This prepares SDR sources; it does not make the RGBA8 project compositor an HDR compositor.
