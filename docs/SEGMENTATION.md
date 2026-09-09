# Subject segmentation and matting

`prepareSegmentation` wraps an optional local or provider-backed segmentation model as a reversible preparation job. It preserves the source, freezes a transparent foreground and a separate inverse-alpha matte as PNG, alpha WebM or alpha ProRes handoff files, and records source hash, provider, model and complete settings.

The result includes measured edge error, optional video temporal-instability score, thresholds, pass state and notes. A source-hash check invalidates derivatives when the original changes. The inverse artifact is always labelled `inverse-alpha` with the contract “inverse opacity matte; not an inpainted background”; Genmotion does not claim that transparent regions contain reconstructed scene pixels.
