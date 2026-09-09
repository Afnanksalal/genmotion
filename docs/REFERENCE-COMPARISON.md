# Reference comparison evidence

`compareReferenceOutput` compares explicit reference/output timestamp pairs without treating the reference as executable render input. Each alignment may declare normalized regions, intentional-change exclusion masks and whether it samples a scene or transition boundary.

The comparator freezes the reference and output SHA-256 identities, extracts exact local frames with FFmpeg, scales output evidence to the reference raster and reports per-channel mean absolute error, RMSE, PSNR and changed-pixel ratio globally and for every declared region. Excluded pixels do not affect preservation metrics; their IDs and reasons are retained separately as intentional adaptation differences.

The output directory contains the compared frame samples, a three-column reference/output/difference contact sheet and a machine-readable report. Boundary alignment IDs are surfaced separately for automated review gates.
