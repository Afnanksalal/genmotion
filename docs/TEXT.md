# Native text layout

Text measurement, fitting and rendering share Skia font metrics through `measureTextLayer` and `resolveTextLayout`. Layout returns every line, measured widths, fitted font size, line height, content dimensions, final box dimensions, and separate horizontal, vertical and line-count overflow flags.

`fit: "shrink"` searches for the largest size that satisfies width, height and optional `maxLines`, bounded by `minFontSize` (default 8, or the authored size when smaller) and the lesser of `fontSize` and optional `maxFontSize`. The search uses at most 24 iterations and a 0.001-pixel tolerance. `fit: "none"` retains the maximum size. If the complete text cannot fit at the minimum, the result explicitly reports overflow. Validation emits `TEXT_OVERFLOW`; it never deletes words to make a line-count check pass.

Long words break at grapheme boundaries by default, preserving combining marks and emoji sequences. Set `breakWords: false` to keep long words together and report horizontal overflow instead. Newlines preserve explicit paragraph boundaries. Whitespace within paragraphs is normalized to spaces. Nonzero letter spacing now uses native Skia shaping for both measurement and painting rather than drawing individual graphemes separately.

## Unicode and language controls

`locale` accepts a BCP 47 language tag and selects locale-aware word segmentation for wrapping and word reveals. Omitted locale retains the existing whitespace-based wrapping contract. `wrap` selects `word`, `grapheme`, or `none`; no-wrap still reports overflow and participates in shrink fitting. Explicit paragraph breaks include CRLF, CR, LF, U+2028 and U+2029. Locale-aware word wrapping uses ICU word boundaries, attaches punctuation, and preserves nonbreaking-space joins; it is not a claim of complete UAX #14 line-break conformance. Dictionary segmentation depends on the Node runtime's ICU version.

`direction` supports `ltr`, `rtl`, and `auto`. Automatic paragraph direction follows the first-strong-character rules P2/P3 from [Unicode UAX #9](https://www.unicode.org/reports/tr9/tr9-51.html), ignoring the contents of directional isolates. A frozen Unicode 17.0.0 bidi-class table supplies character classification; Skia handles the actual shaping and mixed-direction visual order. Wrapped lines retain their paragraph's direction. Alignment remains physical left/center/right. Layout reports a direction for each line.

`horizontalMetrics: "ink"` aligns the actual left/right glyph bounds instead of typographic advances. `verticalMetrics` chooses the existing `line-box`, an `H` cap-height reference, or the visible `ink` extent of the complete block. `baselineOffset` optionally fixes the first alphabetic baseline relative to the layer's top and overrides vertical alignment. A baseline that puts glyph ink outside the box reports vertical overflow. Layout returns the exact paint offsets, baseline mode and ink bounds consumed by drawing. Cap-height alignment intentionally uses the cap reference rather than fitting descenders; use ink metrics when the whole visible glyph block must fit. Studio exposes all three controls.

Character and glyph reveals advance through complete grapheme clusters, preserving surrogate pairs, combining marks and joined emoji. The explicit `glyphs` mode is a grapheme-safe authoring alias: shaping remains native and the engine never exposes half of a surrogate, combining sequence, or joined emoji. Word reveals preserve the original spacing and punctuation around revealed words; line reveals preserve authored paragraph boundaries. Number counters use the authored locale. Studio exposes language, direction, wrapping, and character/word/line reveal controls; the typed fields, including `glyphs`, also travel through CLI, MCP and SDK edits.

The source data is retained under `vendor/unicode/17.0.0`; `scripts/generate-unicode-bidi.mjs` regenerates the compact table and embeds its source hash. The package includes `UNICODE-LICENSE.txt`. Unicode reveal/direction tests and regenerated text examples cover the implementation; full typography conformance remains a broader acceptance task.

`autoSize: "height"` preserves the authored width and computes height from the complete lines. `autoSize: "both"` sizes to explicit lines without wrapping. Omitted or `"none"` retains authored dimensions. Evaluated geometry includes automatic dimensions before parent transforms and constraints. Source documents retain their authored dimensions so automatic sizing is reversible.

Studio exposes sizing, long-word wrapping, minimum/maximum sizes and **Measure text layout**. Measurement reads the saved layer and shows its complete fitted lines. CLI and MCP measurements address a layer by scene/composition and local timestamp:

```sh
genmotion text-measure project --container intro --layer title --at 0
genmotion text-measure project --kind composition --container card --layer heading
```

MCP `genmotion_text_measure` accepts `project` and `address: {kind, containerId, layerId, at}`. SDK `measureProjectText` registers frozen project fonts and evaluates the requested layer. Standalone `measureTextLayer` expects the caller to register fonts first. Measurements depend on the available native fonts; package project fonts for reproducible delivery.

Layout is limited to 200000 UTF-16 code units per layer. Invalid font ranges fail preflight. Existing documents keep their fields and defaults, but two defects are corrected: `maxLines` no longer silently truncates content before fitting, and oversized words participate in the fit test. Projects depending on that truncation should explicitly author their intended text. Text shadows and glyph ink overhangs are not part of the typographic advance-box overflow test.
## Readability blocks

Text layers can draw a native `blockBackground` behind their complete authored box. `blockPadding` reduces the text layout box on all sides, while `blockRadius` rounds the background independently of glyph styling. The block is drawn in the same layer transform, mask and effect stack as the text, so it stays attached during animation and exports identically in preview and render.

For independently highlighted multiline text, `lineBackground`, `linePadding`, and `lineRadius` draw a fitted background for each resolved line. They use the same native line-breaking result as the text draw, including fitted font sizes and direction-aware alignment.

`outlineColor` and `outlineWidth` add a rounded native stroke before the glyph fill. The stroke shares the resolved line positions, direction, font metrics, clipping, layer transforms, and shadows used by the fill pass.
