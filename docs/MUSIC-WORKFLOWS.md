# Music and lyric workflows

`planMusicWorkflow` turns frozen, source-hashed audio features and reviewed lyric cues into an inspectable edit plan. It searches real analyzed phrase boundaries for a requested duration, ranks endings by distance and confidence, retains the selected source range, and maps source beat times through the frozen source-to-timeline map. Corrected feature evidence and both audio/lyric hashes remain attached to the result.

Lyric cues carry their verification state and source. Production planning rejects unverified lyrics by default. Every selected lyric is measured against the requested readable hold; short holds remain explicit unresolved findings rather than being silently stretched or moved. Missing analyzed duration, invalid source hashes, and ranges that cannot fit the source are refused.

The workflow returns data only. It does not claim music transcription, lyric accuracy, or aesthetic approval. Agents can convert its beat markers, phrase range, and lyric cues into ordinary Creative IR tracks and captions while keeping the reviewed evidence available for later QA.
