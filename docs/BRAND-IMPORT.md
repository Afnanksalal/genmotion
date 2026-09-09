# Brand candidate import

`extractBrandImportManifest` converts captured CSS and observed assets into an inspectable candidate manifest. It ranks colors and font families by observation count, retains custom-property names, records source motion declarations, and preserves every logo/image/video/icon URL, local frozen path, rights state and attribution.

The importer makes no brand selection. Zero or multiple logo candidates produce identity findings; unknown rights are errors; remote candidates without a frozen local file remain warnings. The source capture ID, URL and content hash bind the observations to evidence, while `selection: null` and the explicit substitution policy prevent a plausible-looking font, logo or asset from being silently accepted.
