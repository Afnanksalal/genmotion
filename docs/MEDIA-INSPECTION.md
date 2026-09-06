# Source metadata and looping

`inspectMedia` returns an audio/video stream inventory, container duration/bitrate, file size and modification time. Video fields include coded and display dimensions, rotation, sample aspect ratio, average/nominal frame rates, pixel format, reported bit depth, alpha-plane indication and color primaries/transfer/matrix/range. Audio fields include sample rate, channel count/layout, sample format and reported bit depth. Unavailable values are null.

PQ and HLG transfer tags are identified for explicit SDR preparation. Differing average/nominal rates are reported as a VFR hint, not proof from frame timestamps. Palette transparency and embedded ICC profiles are not inferred from an alpha-plane flag. Source changes during the bounded inspection operation are rejected.

CLI `media-info <source>`, MCP `genmotion_media_info`, Studio asset cards and image/video/audio inspectors expose the same information. Inspection uses the installed FFprobe decoder/demuxer inventory; it does not promise that every tagged format can be decoded successfully.

Video layers now accept `loop`, default false. Looped sources repeat the complete source while source trim determines the initial seek offset. FFmpeg prepares exactly the requested layer duration at project FPS and playback rate. Cache identity includes looping, preventing reuse of non-looped preparation. Direct source audio uses looped decoding, while nested/remapped source audio wraps against the probed source duration.

When an image source reports animation duration or multiple frames, Studio offers conversion to a muted looped video layer. It preserves geometry, masks and effects and uses native video frame preparation. GIF and other animated formats depend on successful native decoding; explicit image sequences and sprite sheets remain separately supported source contracts. No browser animation clock is used in rendered output.

These additions await the deferred metadata, audio-loop, decoder and visual QA pass.
