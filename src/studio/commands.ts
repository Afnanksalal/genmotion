import { z } from 'zod';

export const studioCommands = [
  { id: 'palette', title: 'Search commands', category: 'Studio', shortcut: 'Mod+K' },
  { id: 'undo', title: 'Undo project edit', category: 'Edit', shortcut: 'Mod+Z' },
  { id: 'redo', title: 'Redo project edit', category: 'Edit', shortcut: 'Mod+Shift+Z' },
  { id: 'history', title: 'Open project history', category: 'Project', shortcut: '' },
  { id: 'checkpoints', title: 'Named checkpoints', category: 'Project', shortcut: '' },
  { id: 'source', title: 'Edit project source', category: 'Project', shortcut: 'Mod+Shift+E' },
  { id: 'export', title: 'Export video', category: 'Project', shortcut: 'Mod+Shift+R' },
  { id: 'preview', title: 'Show native preview', category: 'View', shortcut: '' },
  { id: 'workflow', title: 'Show production workflow', category: 'View', shortcut: '' },
  { id: 'play', title: 'Play or pause', category: 'Timeline', shortcut: 'Space' },
  { id: 'seek', title: 'Seek to frame or time', category: 'Timeline', shortcut: '' },
  { id: 'markers', title: 'Edit markers and ranges', category: 'Timeline', shortcut: '' },
  { id: 'add-scene', title: 'Add scene', category: 'Create', shortcut: '' },
  { id: 'add-layer', title: 'Add layer', category: 'Create', shortcut: '' },
  { id: 'canvas-view', title: 'Canvas view settings', category: 'View', shortcut: '' },
  { id: 'fit-workflow', title: 'Fit workflow to view', category: 'View', shortcut: '' },
  { id: 'agent-access', title: 'Live agent permissions', category: 'Studio', shortcut: '' },
  { id: 'shortcuts', title: 'Customize keyboard shortcuts', category: 'Studio', shortcut: '' },
] as const;
export type StudioCommandId = typeof studioCommands[number]['id'];
const commandIds = new Set<string>(studioCommands.map(command => command.id));
const keys = /^(?:[A-Z0-9]|Space|Enter|Escape|Backspace|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|F(?:[1-9]|1[0-2]))$/;
export function normalizeShortcut(input: string): string {
  if (!input.trim()) return '';
  const parts = input.split('+').map(part => part.trim()), key = parts.pop()!;
  const modifiers = new Set(parts.map(part => part === 'Ctrl' || part === 'Meta' || part === 'Cmd' ? 'Mod' : part));
  const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
  if (parts.length !== modifiers.size || [...modifiers].some(part => !['Mod', 'Alt', 'Shift'].includes(part)) || !keys.test(normalizedKey)) throw new Error('Use Mod, Alt, Shift and one supported key, such as Mod+Shift+K.');
  return [...['Mod', 'Alt', 'Shift'].filter(part => modifiers.has(part)), normalizedKey].join('+');
}
export function resolvedShortcuts(overrides: Record<string, string>): Record<StudioCommandId, string> {
  for (const id of Object.keys(overrides)) if (!commandIds.has(id)) throw new Error(`Unknown Studio command: ${id}`);
  const result = Object.fromEntries(studioCommands.map(command => [command.id, normalizeShortcut(overrides[command.id] ?? command.shortcut)])) as Record<StudioCommandId, string>;
  const owners = new Map<string, string>();
  for (const [id, shortcut] of Object.entries(result)) {
    if (!shortcut) continue;
    if (owners.has(shortcut)) throw new Error(`${shortcut} is assigned to both ${owners.get(shortcut)} and ${id}.`);
    if (['Mod+W', 'Mod+Q', 'Alt+F4'].includes(shortcut)) throw new Error('Application-closing shortcuts cannot be assigned to project commands.');
    owners.set(shortcut, id);
  }
  return result;
}
export const studioShortcutsSchema = z.record(z.string(), z.string().max(80)).superRefine((overrides, context) => {
  try { resolvedShortcuts(overrides); } catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) }); }
});
