# Output compatibility

`outputCompatibilityMatrix` is the canonical native delivery matrix for H.264, H.265, VP9 and ProRes. It declares supported containers, pixel formats, alpha capability, SDR color contract, audio codec and software/hardware backends. `resolveOutputCompatibility` validates one concrete filename, resolution, alpha mode and backend and returns `fallback: null`; unsupported requests fail instead of silently changing the accepted contract.

H.264 supports MP4/MOV, yuv420p, AAC and software or explicit hardware encoding. H.265 supports MP4/MOV, yuv420p10le and AAC in software. VP9 supports WebM, yuv420p or yuva420p and Opus. ProRes supports MOV, yuv422p10le or yuva444p10le and PCM. All current outputs are BT.709 SDR and require even dimensions.

The renderer and render planner call this contract. It is also available through SDK exports, `genmotion output-compatibility`, MCP `genmotion_output_compatibility`, and Studio `GET /api/output-compatibility`.
