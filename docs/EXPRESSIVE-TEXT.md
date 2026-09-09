# Expressive native text

Text remains editable Unicode content while supporting designed motion treatment. `runs` apply ordered, non-overlapping code-unit ranges for per-word or per-character color, family, size, weight, style, tracking, outline, and background. `timedWords` binds source ranges to local layer time; `currentWordStyle` overlays the active range without replacing its authored run. Grapheme segmentation keeps emoji and joined characters intact while painting.

`textPath` lays graphemes along a native SVG path with normalized offset, reversible direction, tangent orientation, and animatable reveal progress. Text-on-path requires `wrap: "none"`; malformed geometry, overlapping runs, overlapping timed words, and out-of-range source offsets fail schema or project validation.

`notations` retains semantic source ranges for rough underline, circle, highlight, and strike-through marks. Each mark has a stable ID, deterministic seed, color, width, padding, and animatable progress. Marks use the same measured line geometry as the text renderer, so random seeking produces the same result.

All treatments are Creative IR fields rendered by the native canvas backend. They work through the SDK, schema-derived CLI/MCP project operations, Studio persistence, packaged schema, and native frame renderer without browser text layout.
