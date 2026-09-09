# Reviewed transcription

`transcribeMedia` accepts any local or remote-backed provider adapter, an explicit model and optional language. The frozen result records the source SHA-256, provider/model identity, detected language, timed words, nullable confidence, partial state and limitations. Source-hash inspection invalidates the timing contract when media bytes change.

Every word begins unaccepted. `correctTranscript` retains the observed text while storing reviewed corrections and acceptance. `transcriptToCaptions` converts accepted words only, using configurable word-count and silence-gap grouping, and emits existing native caption cues with exact offsets and word timing. Provider execution remains optional; no model or network dependency is required by the renderer.
