# Native media geometry

Image and video layers accept `crop` in source pixels or normalized source ratios:

```json
{"x":0.25,"y":0,"width":0.5,"height":1,"unit":"ratio"}
```

Omitting `unit` preserves existing pixel-coordinate projects. Each bound accepts a number or native numeric keyframes. Numeric tracks may target `crop.x`, `crop.y`, `crop.width` and `crop.height`. This supports source pan-and-scan and Ken Burns framing without changing layer geometry. At render time the evaluated crop must remain inside its source with positive dimensions. For sprite sheets the source is the selected cell. Easing overshoot that leaves the source is an error, rather than an implicit out-of-bounds sample.

`cover` fills the target bounds while preserving aspect ratio and clipping overflow; `contain` fits the complete source crop inside the bounds; `fill` and `stretch` both stretch to the target bounds for backward compatibility.

`radius` remains the uniform corner control. Optional `cornerRadii` supplies top-left, top-right, bottom-right and bottom-left radii in layer coordinates. The renderer proportionally reduces radii when adjacent corners exceed an edge length. Optional `border` contains a native animated width and a color. Borders draw inside the same rounded clip and can be animated through `border.width` tracks.

Studio provides crop data/keyframes, independent corner radii, border width/color and fit controls for both images and video. Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md). Interactive source crop handles and animated bounding-box gizmos remain separate checklist work.
