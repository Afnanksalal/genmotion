# Deterministic render plans

`createRenderPlan` resolves the project preflight contract and hashes every frozen local asset before delivery. The returned plan includes the source hash, resolved variant values, selected scene/composition/group and exclusive frame range, dimensions, FPS, output identity, scene/composition timing, ordered dependency paths, byte sizes, individual SHA-256 hashes and one dependency-set hash.

Its delivery contract declares quality, codec/container, output filename, RGBA8 sRGB working space, BT.709 SDR output, resolved alpha mode, audio presence/sample rate/channels/codec/normalization, native renderer, FFmpeg encoder, hardware requirement and temporal sample count. Impossible codec/container and alpha combinations fail during planning.

Use `genmotion render-plan <project>` with its selection and delivery flags, MCP `genmotion_render_plan`, Studio `POST /api/render-plan`, or SDK `createRenderPlan`. Planning is read-only and uses the same project-root confinement and asset inventory as validation and bundling. Recreate the plan after any source edit; a changed source, dependency, selection, variant or delivery contract changes the output identity.

The `reproducibility` envelope records the Node runtime, platform and architecture, Creative IR schema, native canvas package, complete FFmpeg version line, dependency-set hash and the explicit absence of model-backed preparation. `verifyRenderPlanEnvironment` recomputes source/dependency hashes and reports every runtime or backend mismatch before reuse; changed environments are never silently treated as equivalent.
