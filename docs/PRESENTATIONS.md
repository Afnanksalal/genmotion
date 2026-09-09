# Native presentations

A versioned presentation manifest references existing Creative IR scene and layer IDs. It orders scenes and declares timed fragment holds, layer-backed hotspots, speaker notes, and branches with optional return scenes. Validation rejects missing or duplicate scenes, missing hotspot/branch targets, invalid fragment times/order, and cycles among branches without an explicit return.

`PresentationSession` is a framework-neutral presenter/audience state machine. It supports arrow, page, space, and escape navigation; fragment holds; branch stacks and return behavior; monotonic state synchronization; and subscriptions. Presenter views include persistent notes. Audience snapshots omit notes. Remote snapshots with stale sequence numbers or invalid scene/fragment identities are rejected.

`planPresentationExport` converts an explicit route and hold policy into deterministic native source-time segments. Interactive projects must supply a route. The planner reports missing route targets, unresolved interactions, and scenes the route cannot reach before rendering. It never rewrites source scene duration or guesses how long an interactive wait should last.
