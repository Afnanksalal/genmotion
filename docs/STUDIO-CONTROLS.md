# Studio controls

Studio uses shared app-styled controls in `src/studio/controls.ts`. Native form elements remain the source of values and input/change events; their operating-system widgets do not provide the visible control chrome.

- Selects use anchored listboxes with arrow keys, Home/End, typeahead, Enter, Escape, disabled options and viewport-aware placement. Selecting a value keeps the current dialog. Disabled state, selected options and programmatic value assignments synchronize with the visible trigger.
- Numeric fields have custom increment/decrement buttons that respect step, min, max, disabled and read-only state. Direct typing and keyboard arrows remain available.
- Checkboxes, radio buttons, sliders, search clearing, disclosure indicators, focus rings and scrollbars share the Studio theme.
- Visible file inputs use a custom button and selected-file label. The operating system still supplies the file selection dialog.
- Marker colors use the Studio color picker, including editable hex/RGB values and hue/alpha sliders. Escape dismisses the picker first.
- Processed audio uses custom play/pause, seek and volume controls with time and failure feedback. Closing its dialog pauses playback.

The toolbar uses two rows at compact desktop and phone widths so tabs and actions remain accessible. Live-context polling reports stale synchronization without generating a transport error or overwriting newer context.

Controls added by inspector and dialog rerenders are enhanced automatically. Existing project edit handlers and revision checks remain authoritative. The shared controls require no external UI service or runtime download.

Browser coverage exercises real project persistence, keyboard navigation, menu placement, state synchronization, color changes, file import and decoded audio playback. See [milestone validation](MILESTONE-QA-2026-09-07.md).
