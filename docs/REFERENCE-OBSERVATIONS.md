# Reviewable reference observations

Reference analysis accepts bounded, frozen measurement samples and emits strict Creative IR observations for timing peaks, motion landmarks, camera positions, cursor positions and visual regions. Every observation retains the reference ID, exact interval, normalized geometry, confidence, source content hash and analyzer/version identity.

`correctReferenceObservation` records the reviewer, timestamp, reason and hash of the prior observation. Corrections therefore remain explicit instead of silently replacing analyzer output. `compileObservationTracks` converts reviewed point observations into ordinary dimension-aware native x/y keyframes with stable source-observation IDs and confidence values. No executable project code or render-time inference is accepted.

The analyzer is deliberately bounded by sample and observation limits. Its result describes the limits of extracted camera, cursor and region confidence and exposes truncation rather than implying complete coverage.
