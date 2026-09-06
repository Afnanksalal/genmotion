# Studio canvas view

The View control opens persisted editor preferences in `.genmotion/studio.json`. These preferences never alter the Creative IR or rendered pixels. Controls include fit, native-pixel view, 10–3200% zoom, pan, fullscreen, project-pixel grid, custom horizontal/vertical guides and safe-area overlays. Ctrl/Command-wheel zooms around the pointer; middle-button or Alt-drag pans. Fit restores the centered viewport.

Title/action safe areas use 10%/5% margins. The vertical UI allowance is a configurable planning guide, not a claim about current platform overlays. Custom margins are independently editable. Paused onion skinning displays neighboring native frames at an editable offset and opacity; it is hidden during playback.

Canvas movement snaps to authored object edges/centers, project edges/centers, geometry anchors, custom guides and an enabled grid. Shift constrains movement to its dominant axis. Eight resize handles are available, including composition and adjustment instances. Existing transformed/animated bounds and advanced multi-selection remain subject to the broader editing work; these controls do not imply a complete 3D or motion-path gizmo system.

Implementation is present and compilation succeeds. Validation results and limits are recorded in the [milestone QA report](MILESTONE-QA-2026-09-06.md) and [checklist reconciliation](CHECKLIST-RECONCILIATION-2026-09-06.md).

Focus the composition canvas for keyboard view controls: Control/Command plus/minus zooms, Control/Command 0 fits, Control/Command 1 selects native-pixel view, and Alt-arrow pans by 50 view pixels. These keys do not modify layer geometry. View preferences remain editable after autosave; queued saves are serialized and preserve the open dialog's state reference.
