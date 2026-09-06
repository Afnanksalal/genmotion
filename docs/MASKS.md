# Layer masks

Each layer accepts up to 32 masks. Masks combine in array order with `add`, `subtract`, `intersect` or `exclude`, using alpha compositing. A leading subtract or intersect starts from an opaque canvas; a leading add or exclude starts from transparent. Disabled masks do not participate.

Each mask has a unique `id`, SVG `path`, `enabled`, `mode`, `inverted`, `fillRule` (`nonzero` or `evenodd`), and numeric or keyframed `opacity`, `feather` and `expansion`. Paths use authored layer coordinates and follow the layer transform. Feather and expansion use output pixels, bounded to 256 pixels. Negative expansion erodes the boundary; positive expansion extends it with a round stroke.

Animated paths use `{ "keyframes": [{ "at": 0, "value": "M…Z", "ease": "linear" }, …] }`. Times must increase and paths must have compatible contour topology. Native cubic interpolation preserves curves. Masking occurs before the layer effects stack and final opacity/blend operation.

Studio exposes mask creation, order, bypass, combination, inversion, fill rule, path, feather, opacity, expansion and path animation. Shared project edits persist masks through the same revision and validation boundary as other layer properties. Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).
