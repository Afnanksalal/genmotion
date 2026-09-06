# Track groups, locks and property links

Direct animation tracks accept optional `group`, `solo` and `locked`. `enabled: false` mutes a track. A layer's optional `trackGroups` contains unique `{id, muted?, solo?, locked?}` entries; every referenced group must exist. Group controls apply to tracks in that layer, including inside reusable compositions.

Evaluation first excludes disabled tracks and muted groups. If any remaining track or group is soloed, only those soloed tracks/groups run. Their original track order and replace/add/multiply operations are preserved. A muted solo group cannot silence the other tracks. Locking has no effect on rendering.

Track and group locks protect canonical edits across Studio, SDK, CLI and MCP. A locked track cannot be edited, removed or removed with its container. A locked group protects its settings and member tracks. Unlocking must be a separate transaction before editing. Locks are authoring controls, not filesystem access controls; editing the raw source file directly bypasses transactional protection. Semantic capability queries report lock refusals before mutation.

Studio exposes group creation, mute/solo/lock controls, track membership and track locks. Locked controls are disabled while their unlock control remains available. Group rename updates member references. Releasing a group lock does not release individually locked tracks.

`propertyLinks` on a destination layer use this typed, expression-free contract:

```json
[{"target":"transform.x","sourceLayerId":"driver","sourceProperty":"transform.x","scale":2,"offset":12,"enabled":true}]
```

Sources are sibling layers in the same scene or composition. Each source is fully evaluated at the container timestamp, using its own local start. Links run after the destination's tracks, parent inheritance and constraints, replacing the linked property. Numeric values and point/rectangle components accept scale and offset. Color, path and gradient values can be copied directly, with scale 1 and offset 0. Properties must already exist and have compatible types; no arbitrary property names or code are accepted. Sources need not be visible to act as controls.

Links join the layer dependency graph. Unknown sources, cycles, duplicate active destination owners, incompatible properties and invalid native layer values fail validation. Evaluation also checks results at render time, including overflow that arises after time zero. Retarget dependent links before deleting their source. Linking a property already controlled by an animation track intentionally replaces that track's evaluated result.

Studio provides typed link controls; new links start disabled so source and destination can be configured first. SDK `resolveLayerGraph` evaluates the same graph that rendering uses. CLI `edit` and MCP `genmotion_edit` accept `property` edits for `trackGroups`/`propertyLinks` and `track-put` for track controls, through stable layer addresses and expected revisions. MCP `genmotion_timeline_inspect` exposes linked evaluated values; full schema inspection includes every field.

All fields are optional additions. Existing projects retain their previous evaluation behavior.
