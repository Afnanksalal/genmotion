# Native text layout

Text measurement, fitting and rendering share Skia font metrics through `measureTextLayer` and `resolveTextLayout`. Layout returns every line, measured widths, fitted font size, line height, content dimensions, final box dimensions, and separate horizontal, vertical and line-count overflow flags.

`fit: "shrink"` searches for the largest size that satisfies width, height and optional `maxLines`, bounded by `minFontSize` (default 8, or the authored size when smaller) and the lesser of `fontSize` and optional `maxFontSize`. The search uses at most 24 iterations and a 0.001-pixel tolerance. `fit: "none"` retains the maximum size. If the complete text cannot fit at the minimum, the result explicitly reports overflow. Validation emits `TEXT_OVERFLOW`; it never deletes words to make a line-count check pass.

Long words break at grapheme boundaries by default, preserving combining marks and emoji sequences. Set `breakWords: false` to keep long words together and report horizontal overflow instead. Newlines preserve explicit paragraph boundaries. Whitespace within paragraphs is normalized to spaces. Nonzero letter spacing uses the same grapheme advance measurements as rendering.

`autoSize: "height"` preserves the authored width and computes height from the complete lines. `autoSize: "both"` sizes to explicit lines without wrapping. Omitted or `"none"` retains authored dimensions. Evaluated geometry includes automatic dimensions before parent transforms and constraints. Source documents retain their authored dimensions so automatic sizing is reversible.

Studio exposes sizing, long-word wrapping, minimum/maximum sizes and **Measure text layout**. Measurement reads the saved layer and shows its complete fitted lines. CLI and MCP measurements address a layer by scene/composition and local timestamp:

```sh
genmotion text-measure project --container intro --layer title --at 0
genmotion text-measure project --kind composition --container card --layer heading
```

MCP `genmotion_text_measure` accepts `project` and `address: {kind, containerId, layerId, at}`. SDK `measureProjectText` registers frozen project fonts and evaluates the requested layer. Standalone `measureTextLayer` expects the caller to register fonts first. Measurements depend on the available native fonts; package project fonts for reproducible delivery.

Layout is limited to 200000 UTF-16 code units per layer. Invalid font ranges fail preflight. Existing documents keep their fields and defaults, but two defects are corrected: `maxLines` no longer silently truncates content before fitting, and oversized words participate in the fit test. Projects depending on that truncation should explicitly author their intended text. Text shadows and glyph ink overhangs are not part of the typographic advance-box overflow test.
