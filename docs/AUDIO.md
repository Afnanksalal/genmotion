# Native audio processing

Nested video source audio follows composition instance clocks during preparation, including offsets, trims, loops, ping-pong, reverse time, remapping and freeze intervals. Audio uses a continuous 48 kHz clock independently of local video FPS. Frozen and clamped frame holds are silent. Nested retiming is varispeed with linear sample interpolation; it is not a pitch-preserving time-stretch algorithm. Direct static source tracks retain the existing pitch-preserving tempo path. Animated video volume, trim and playback-rate tracks use the mapped preparation path. Linked source-audio properties evaluate through the same dependency graph as visual properties, resolving only the requested video and its dependencies. Parent visibility is respected.

Mapped streams use a sixteen-page decoded PCM cache (1 MiB), bounded 4 GiB source/output streams, cancellation and deadline checks. They feed the same prepared-track mix, stem, loudness and export path. Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).

Video export, standalone audio export, and Studio's processed-mix preview share one native FFmpeg graph. Project audio tracks retain source trimming, timeline placement, looping, linear volume, stereo pan, fades, mute/solo and voice ducking. Additional fields are optional for compatibility with existing documents.

## Track controls

- `gainDb`: gain from −96 to +24 dB, combined with linear `volume` after the effect rack.
- `playbackRate`: 0.0625–16. Output duration controls how much source audio is consumed.
- `preservePitch`: true by default; tempo is decomposed into supported native stages. False changes source sample rate and resamples to 48 kHz.
- `reverse`: reverses the selected source interval before tempo and effects. Native reversal buffers the selected interval; long intervals can require substantial FFmpeg memory.
- `effects`: an ordered rack of up to 32 effects with unique `id` values. Each effect can be bypassed without removing its settings.

The SDK exposes a versioned rack clipboard, deterministic duplicate/paste ID handling and validated `voice-clean` and `delivery-safe` presets. `audioRackCapabilities` lists supported effect types, limits and automation support. Rack version 1 explicitly reports effect-parameter automation as unsupported instead of accepting values the signal graph would ignore.

| Effect type | Controls |
| --- | --- |
| `highpass`, `lowpass` | `frequency` in Hz and `q`. |
| `equalizer` | `frequency`, `q`, and `gainDb`; each entry is one parametric band. |
| `compressor` | `thresholdDb`, `ratio`, `attackMs`, `releaseMs`, `knee`, `makeupDb`. |
| `gate` | `thresholdDb`, `rangeDb`, `ratio`, `attackMs`, `releaseMs`. |
| `limiter` | `ceilingDb`, `attackMs`, `releaseMs`; automatic makeup gain is disabled and lookahead latency is compensated. |

All controls are validated against the supported filter ranges. Projects provide typed values rather than executable filter strings. The SDK exports `audioEffectFilters`, `audioTempoFilters`, and `decibelsToGain` for inspection and composition.

Voice tracks form the sidechain bus. Non-voice tracks with `duckUnderVoice: true` form the ducked bus. Voice tracks cannot feed themselves into both buses. Optional project `audioDucking` configures `thresholdDb`, `ratio`, `attackMs`, and `releaseMs`; omitted settings preserve the prior defaults. Studio exposes these shared controls in the project inspector. The final mix has a latency-compensated 0.95 linear limiter without automatic makeup gain, and pads/trims to the project duration.

Source video audio is included only when a visible source has an audio stream and nonzero volume. It follows video playback rate with pitch preservation. A solo authored audio track excludes video-source audio. Nested composition audio mapping, pitch automation, and source detachment remain separate work.

## Editing, preview and delivery

Studio's audio inspector adds, edits, reorders, bypasses, and removes effects, and exposes decibel gain, rate, reverse, and pitch preservation. **Preview processed mix** plays a WAV rendered from the current saved project. It includes the actual native effects and mix graph, rather than playing the unprocessed source. Preview preparation is cancelled when its request is disconnected; temporary files are removed after serving. This preview is a separate audio player, not yet a sample-synchronized timeline transport.

```powershell
genmotion audio-render ./project --output ./exports/mix.wav
genmotion audio-render ./project --variant english --output ./exports/mix.flac
```

Standalone output supports WAV (24-bit PCM), FLAC, M4A/AAC, and Opus at 48 kHz stereo. SDK `renderAudio` and MCP `genmotion_audio_render` use the same implementation. CLI/MCP project transactions author all rack settings in the shared schema. Audio export stages output beside the destination, verifies a complete decode, and atomically replaces the accepted file. Failure or cancellation preserves the previous output and removes staging. A project without audible tracks produces silence for explicit audio-only export; video export keeps its existing no-audio behavior.

Tests measure high/low-pass rejection, EQ attenuation, compressor reduction, limiter peaks and latency, gate attenuation, and tempo duration from decoded float PCM. All four video codecs encode/decode with the rack enabled. Additional tests cover video-source pitch preservation, silent-video muxing, all four standalone audio containers, failed-output preservation, Studio rack edits, and browser playback metadata for the processed mix.

Tracks are prepared sequentially as full-duration 48 kHz stereo float PCM before mixing. This isolates source trim/delay completion from the sidechain and mix graph: the original combined graph intermittently lost tails on the supported FFmpeg 7.1 Windows runtime. Concurrent rendered PCM hashes and tail-amplitude tests cover that regression. Preparation estimates and bounds retained PCM at 8 GiB, and owned staging is removed on success, failure, or cancellation. This adds preparation time and temporary disk use; the audio graph runs with one filter thread per export.

## Loudness analysis and normalization

Optional project `audioNormalization` sets `integratedLufs` (−70…−5, default −16), `truePeakDbtp` (−9…0, default −1), and `rangeLu` (1…50, default 11). Video export, standalone audio, and processed preview measure the unnormalized mix, then apply a second pass using those measurements. Silence and unmeasurable integrated loudness skip normalization. Existing projects retain their mix unless normalization is enabled.

The implementation uses FFmpeg's [EBU R128 loudnorm filter](https://ffmpeg.org/ffmpeg-filters.html#loudnorm). Linear normalization is requested when measured constraints allow it; the filter may use dynamic processing otherwise. Output is resampled to 48 kHz. Lossy encoding can change peaks, so measure the delivered file when checking a delivery ceiling.

`genmotion audio-measure ./project` analyzes the processed mix; `genmotion audio-measure ./exports/master.mp4 --media` measures a delivered file. SDK functions are `measureProjectAudio` and `measureAudioFile`; MCP exposes `genmotion_audio_measure`. Results include integrated LUFS, true peak, loudness range, gate threshold, silence status, and clipping warnings. Unmeasurable values are explicit `null`, never zero. Studio exposes targets and a processed-mix measurement with its project revision. Tests verify PCM and AAC delivery targets, clipping diagnostics, silence, MCP results, and Studio persistence.

## Stem delivery and metadata

`genmotion audio-render ./project --stem music --output ./exports/music.wav` exports a full-duration stem. Kinds are `music`, `voice`, `sfx`, and `source`; source includes embedded video audio. SDK `renderAudio` and MCP `genmotion_audio_render` accept the same `stem` option. Studio offers each file as a download in the project inspector. Missing categories produce full-duration silence.

Stems use 32-bit float WAV to retain headroom. They contain selected tracks after timing, effects, gain, fades, pan, mute/solo, and voice ducking, before master limiting or loudness normalization. Voice remains available to the music/SFX sidechain but is excluded from those audible stems. Apply master processing after recombining; a normalized or limited master need not equal a direct sum of stems. Tests reconstruct a low-level mixed master sample by sample from all four stems, including voice-driven ducking.

Audio and video mix exports embed project title and supported string metadata: `artist`, `album`, `copyright`, `date`, `genre`, and `language`. Stem comments identify their category and pre-master processing. Metadata values are bounded to 16 KiB. Native probe tests verify float encoding, duration, artist/title metadata, and Studio downloads. Existing documents need no migration.

Not yet implemented: nested audio retiming, a general bus router, automation curves for every DSP control, or a bounded disk waveform pyramid.
