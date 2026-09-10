# Motion production and visual QA standard

This standard records reproducible failures found while producing and revising Genmotion examples and the Genmotion launch film. It applies to examples, templates, launch films, product demonstrations, Studio captures, and release renders. A composition is complete only when its story, geometry, timing, audio, native frames, and encoded master pass together.

Schema validation and automated tests are necessary evidence. They do not establish visual quality by themselves.

## Recurrent failure catalog

### Direction and story

- Authoring began before the audience, promise, proof, action, and shot sequence were resolved.
- Feature demonstrations lacked a credible use case and read as isolated proofs of concept.
- Scenes resembled presentation slides instead of a continuous motion system.
- Decorative rails, slash lines, particles, cards, and annotations had no narrative job.
- The tone drifted between product launch, tutorial, documentary, and generic technology promo.
- References were collected but their pacing, typography, camera logic, transitions, and sound structure were not translated into an explicit plan.
- Copy described mechanisms when a short, memorable statement was required.
- A requested correction was generalized beyond its stated target and broke an already approved decision.

### Composition, containment, and alignment

- Text crossed the left, right, top, or bottom edge of the delivery frame.
- Text fit at rest but clipped during scale, rotation, blur, spring overshoot, perspective, or camera motion.
- Left and right margins were unequal.
- A layer was centered against the composition rather than its intended panel, screenshot, or interior box.
- A correction flattened or displaced an intentionally diagonal composition.
- Background and focus panels extended beyond the total aspect frame.
- A scene background failed to cover the complete frame and exposed transparency or black edges.
- Transformed and rotated layers revealed their rectangular source bounds.
- Camera overscan exposed space outside the designed composition.
- Masks and clipping regions did not follow the transformed screenshot or panel.
- Adjacent scene content leaked through transition overlap.
- Preview, source, and encoded-output aspect ratios produced different framing.
- A still-frame correction failed at another animated state.

### Typography and readability

- Captions used generic subtitle styling in a composition that required authored editorial typography.
- Hierarchy, line length, type scale, and contrast did not support the scene's reading order.
- Text remained visible for less time than a viewer needed to read it.
- Large type was not measured at every animated extreme.
- Screenshot labels overlapped product controls or existing interface text.
- Caption plates introduced unwanted black rectangles.
- Internal or placeholder labels appeared in a public composition.
- Exact approved copy changed during revision.
- A label remained technically in bounds but was crowded against an edge.

### Motion and transitions

- Camera moves behaved like flat slide translation rather than changes in focus, depth, and viewpoint.
- Zoom, pan, focus, blur, and depth planes were animated independently instead of as one camera move.
- Motion blur reduced logo or type clarity.
- Transitions discarded incoming momentum or cut before the preceding move settled.
- Crossfades exposed two incompatible layouts at once.
- Scene content appeared before its background was opaque.
- An outgoing background stopped covering the frame before the incoming scene covered it.
- Motion effects were ornamental rather than motivated by hierarchy or story.
- Spatial layouts lacked sufficient depth separation to demonstrate the renderer's capabilities.

### Timing and audio

- Scene boundaries were chosen from a target duration instead of musical structure and reading time.
- Cuts approximated the beat but visual accents, type entrances, and camera landings did not share the same cue grid.
- A music bed was selected after picture timing had already been locked.
- Music direction sounded dated, documentary-like, sleepy, abrasive, or generically electronic for the intended product launch.
- A sequence was shortened to meet an arbitrary runtime and became unreadable.
- A title or claim disappeared in under a second.
- Transitions felt chopped because the outgoing settle, cut, and incoming attack occupied the same instant.
- Sound effects did not confirm visible events or competed with the music.
- Audio trim, fade, gain, and final limiter behavior were not reviewed from the encoded master.

### Brand, assets, and product evidence

- Logo transparency was confused with composition transparency.
- The logo source was rasterized too small, scaled through blur, or given a glow that damaged edge clarity.
- Composition colors did not match the approved logo and brand tokens.
- Studio captures became translucent or sat over an unintended background.
- Product screenshots were treated as generic cards rather than readable evidence.
- Added overlays competed with the captured interface.
- Captures, generated scenes, and the final mark did not share one visual language.
- Asset provenance, license, checksum, or source was missing from the project record.

### Rendering and delivery

- A transparent canvas was delivered when an opaque master was intended.
- Review renders and delivery renders were not named or distinguished clearly.
- Stale numbered renders remained available and viewers reviewed the wrong file.
- Temporary renderer intermediates were mistaken for masters.
- The render path was reported without verifying the file existed and decoded fully.
- Output metadata passed while the picture still contained clipping, leaks, weak timing, or poor composition.
- Platform-specific CI failures remained after local success.

### Examples and documentation

- The gallery count differed from the examples present on disk.
- Source, rendered master, contact sheet, storyboard, and documentation described different revisions.
- Examples showcased one feature without demonstrating a useful workflow.
- Regeneration changed timing or composition without equivalent visual review.
- Checklist items were counted as complete before implementation, tests, documentation, and acceptance evidence all existed.
- Research references remained in public-facing text after their purpose had ended.
- Failed drafts and temporary acquisition files accumulated beside the canonical deliverable.

## Required production gates

### 1. Brief and evidence gate

Record the audience, one promise, product proof, requested action, target duration range, delivery formats, brand tokens, and hard exclusions. Every public claim must map to visible product evidence or an implemented engine capability. Freeze local assets and record their rights and provenance before final delivery.

### 2. Storyboard gate

Give every shot one narrative event, one dominant visual idea, required copy, camera behavior, readable hold, and motivated handoff. Remove decoration that does not clarify hierarchy, direction, depth, timing, or causality. Approve representative storyboard frames before a full render.

### 3. Geometry gate

Define a delivery-frame safe area and the local bounds of every panel. Alignment must be measured against the intended parent, not inferred from the full canvas. Evaluate transformed bounds over the complete lifetime of text, captions, screenshots, masks, rotated planes, and camera targets.

For each visible layer, inspect at least:

- the frame before entry;
- entry overshoot or peak scale;
- the resolved hold;
- the frame before exit;
- exit overshoot;
- both sides and the midpoint of every transition.

Background coverage must include camera overscan and transition transforms. Opaque projects must produce opaque pixels at all four frame corners throughout the timeline.

### 4. Typography gate

Measure complete glyph bounds with the actual bundled font. Check wrapping, line height, tracking, alignment, and contrast at delivery resolution. Preserve exact approved copy. Product captures must retain a clean reading area; captions may occupy surrounding composition space but may not cover essential interface content. Hold time must reflect copy length and scene complexity.

### 5. Motion gate

Animation must establish, move, settle, and hold. Camera motion needs a clear focus target and must preserve spatial continuity. Apply blur only where displacement warrants it, then verify the resolved logo and type are sharp. Inspect transitions as continuous intervals rather than isolated boundary frames.

### 6. Audio and editorial gate

Analyze the final local track before locking picture. Record tempo and transient landmarks, then place major scene changes, visible impacts, and camera landings on deliberate cues. Reading time takes precedence over an arbitrary short runtime. Listen to the encoded master from start to finish and verify that fades, cuts, peaks, and the final hold work with the picture.

### 7. Native-frame QA gate

Run strict project validation and render targeted native frames for every risky state. A reviewer must inspect these frames visually. Automated bounds checks should fail on transformed text overflow, uncovered opaque-frame corners, nonfinite geometry, and invalid transition coverage, but a passing result does not replace review.

### 8. Encoded-master QA gate

Probe and fully decode the actual delivery file. Verify resolution, aspect ratio, frame rate, duration, video codec, audio codec, audio presence, and expected opacity behavior. Generate dense contact sheets from the encoded video, including scene boundaries and transition midpoints. Watch the complete encoded master in real time with sound at least once.

The final review must explicitly check:

- frame-edge clipping and camera overscan;
- equal intended margins and parent-relative centering;
- complete background coverage with no scene leaks;
- logo and small-type sharpness;
- screenshot and caption separation;
- copy accuracy and readable holds;
- diagonal and perspective intent after alignment corrections;
- beat, cut, camera-landing, and transition synchronization;
- abrupt black, transparent, duplicate, frozen, or partial frames;
- audio start, end, level, distortion, and sync.

### 9. Repository gate

Keep one clearly named canonical master per delivery profile. Remove renderer intermediates, failed drafts, acquisition pages, and superseded review exports. Update the storyboard, brief, project source, asset ledger, QA report, contact sheets, gallery count, and documentation in the same change. Run the appropriate build, tests, example verification, and cross-platform CI before tagging a release.

## Acceptance record

A production artifact is accepted only when its record contains:

- source revision and project path;
- exact duration, dimensions, and frame rate;
- local asset inventory and provenance;
- strict validation result;
- native-frame review set;
- encoded probe and full-decode result;
- contact-sheet paths and reviewed boundary times;
- real-time audio-visual watch confirmation;
- known limitations and reviewer identity;
- canonical master path and checksum.

If any item is missing, describe the artifact as a review render rather than production-ready. Do not convert a narrower automated check into a claim that the full composition passed.
