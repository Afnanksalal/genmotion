# Studio canvas view

The View control opens persisted editor preferences in `.genmotion/studio.json`. These preferences never alter the Creative IR or rendered pixels. Controls include fit, native-pixel view, 10–3200% zoom, pan, fullscreen, project-pixel grid, custom horizontal/vertical guides and safe-area overlays. Ctrl/Command-wheel zooms around the pointer; middle-button or Alt-drag pans. Fit restores the centered viewport.

Title/action safe areas use 10%/5% margins. The vertical UI allowance is a configurable planning guide, not a claim about current platform overlays. Custom margins are independently editable. Paused onion skinning displays neighboring native frames at an editable offset and opacity; it is hidden during playback.

Canvas movement snaps to authored object edges/centers, project edges/centers, geometry anchors, custom guides and an enabled grid. Shift constrains movement to its dominant axis. Eight resize handles are available, including composition and adjustment instances. Existing transformed/animated bounds and advanced multi-selection remain subject to the broader editing work; these controls do not imply a complete 3D or motion-path gizmo system.

Implementation is present and compilation succeeds. Browser, accessibility and gesture QA are deferred to the final pass.
