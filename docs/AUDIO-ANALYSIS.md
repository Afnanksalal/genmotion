# Source audio analysis

`analyzeAudioFile(source, options, processOptions)` analyzes the first audio stream of a local audio/video file. Options select source start and window duration, silence threshold/duration and BPM range. The default window is 600 seconds; the maximum is 3600 seconds. Longer sources can be analyzed in consecutive windows. Results identify the source by SHA-256 and reject source changes during decoding.

The analysis decodes stereo float PCM at 16 kHz, keeps bounded buffers while reading it, and removes its private temporary directory after success, failure or cancellation. A shared five-minute deadline covers hashing, decoding and analysis. Studio allows at most two concurrent analyses. Temporary PCM is at most approximately 440 MiB for the maximum one-hour window. Dense result memory grows with the selected window; use shorter windows for interactive work.

Waveform levels contain interleaved left minimum, maximum and RMS followed by right minimum, maximum and RMS. The base level has 320 samples per bin (20 ms). Subsequent levels combine pairs with sample-count-weighted RMS, including partial final bins. These are resampled source peaks, not delivery true peaks. Existing loudness analysis remains the delivery measurement API.

Spectrum data uses a 1024-sample Hann window and 512-sample hop. Twenty-four logarithmic bands span 30 Hz to 8 kHz. Each value is the mean bin power in dBFS, bounded to -120–0. Channels are combined by energy rather than summing their waveforms, so stereo phase inversion does not cancel analysis. The first spectrum frame is centered 32 ms after the selected source start.

Positive spectral flux, a local median baseline and a minimum separation produce transient candidates. Normalized autocorrelation within the selected BPM range estimates a fixed tempo and phase; at least three detected transients and sufficient correlation are required. Beat positions are estimates, with half/double-time ambiguity and no variable-tempo tracking. Silence detection uses both channels' 20 ms RMS bins and the requested minimum duration. All reported times are source seconds, including the selected start offset.

```sh
genmotion --json audio-analyze assets/music.wav --options '{"start":30,"duration":60,"silenceDb":-50}'
```

MCP exposes `genmotion_audio_analyze`. Dense waveform and spectrum arrays are opt-in; summary mode returns detection results and data dimensions. Studio provides analysis from audio-track inspectors and the Markers and ranges dialog. Review stereo waveforms and spectrum, then explicitly import beat, transient or silence-boundary markers using a destination time, playback rate and optional reverse mapping. Imported marker notes retain source fingerprints and original source times. Window mapping does not automatically repeat markers for looped tracks.

Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
