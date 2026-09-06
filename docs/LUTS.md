# Frozen native lookup tables

Genmotion imports local CUBE files into `.genmotion/luts/<sha256>.cube`. Authoring IR stores a compact source reference, dimensions, domains, interpolation and explicit input/output color spaces. Project loading checks the source hash and metadata, then prepares table data in the compiled project. Embedded tables are also accepted. The source document does not grow with every imported table.

Supported limits are 1D tables with 2–65,536 rows, 3D tables with 2–65 samples per axis, 32 MiB source files and 256 MiB of compiled table values per project. Header duplication, unknown directives, combined shaper/3D files, malformed numbers, incorrect row counts and reversed domains are refused. Three-dimensional indexing changes red fastest. One-dimensional tables interpolate linearly; 3D tables offer tetrahedral (default) and trilinear sampling. Inputs outside the domain clamp to its endpoints. These format semantics follow [Adobe's Cube LUT Specification 1.0, preserved PDF](https://kono.phpage.fr/images/a/a1/Adobe-cube-lut-specification-1.0.pdf).

```sh
genmotion lut-import ./project ./grade.cube --input-space srgb --output-space srgb
```

The command returns a payload for `{ "id": "grade", "type": "lut", "amount": 1, "lut": PAYLOAD }` in an effects stack. MCP exposes `genmotion_lut_import`; Studio's Add visual effect → LUT opens a file import with color-space and interpolation controls. LUT amount is animatable intensity. LUT passes run in the same ordered native stack for preview and export. Source files travel in project bundles and participate in production-stage fingerprints.

Supported color spaces are `srgb` and `linear-srgb`; conversions are explicit around lookup evaluation. Native delivery currently clips to SDR RGBA8. This does not infer log-camera transforms or provide an HDR pipeline. Source/compiled mismatches require an explicit reimport; an imported source cannot be silently replaced in its content-addressed location.

Implementation and regression cases are present; the final native/browser QA pass is deferred.
