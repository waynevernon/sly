import { alt, mod, shift } from "./platform";

export interface ShortcutDefinition {
  keys: string[];
  description: string;
  category?: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    keys: [mod, "W"],
    description: "Close window",
    category: "Navigation",
  },
  {
    keys: [mod, "P"],
    description: "Open command palette",
    category: "Navigation",
  },
  {
    keys: [mod, "/"],
    description: "Open shortcuts & markdown guide",
    category: "Navigation",
  },
  {
    keys: [mod, "1"],
    description: "Switch to notes mode",
    category: "Navigation",
  },
  {
    keys: [mod, "2"],
    description: "Switch to tasks mode",
    category: "Navigation",
  },
  {
    keys: [mod, "N"],
    description: "Create new note",
    category: "Notes",
  },
  {
    keys: [mod, shift, "N"],
    description: "Open quick task capture",
    category: "Tasks",
  },
  {
    keys: [mod, "D"],
    description: "Duplicate current note",
    category: "Notes",
  },
  {
    keys: [mod, "A"],
    description: "Select all visible notes",
    category: "Notes",
  },
  {
    keys: ["Shift", "↑ / ↓"],
    description: "Extend note selection",
    category: "Notes",
  },
  {
    keys: ["Delete"],
    description: "Delete current note",
    category: "Notes",
  },
  {
    keys: [mod, "Backspace"],
    description: "Delete current note",
    category: "Notes",
  },
  {
    keys: [mod, "R"],
    description: "Reload current note",
    category: "Notes",
  },
  {
    keys: ["Escape"],
    description: "Clear multi-note selection",
    category: "Notes",
  },
  {
    keys: [mod, ","],
    description: "Open settings",
    category: "Navigation",
  },
  {
    keys: [mod, shift, "["],
    description: "Cycle workspace layout",
    category: "Navigation",
  },
  {
    keys: [mod, shift, "J"],
    description: "Switch to 1-pane view (notes mode only)",
    category: "Navigation",
  },
  {
    keys: [mod, shift, "K"],
    description: "Switch to 2-pane view",
    category: "Navigation",
  },
  {
    keys: [mod, shift, "L"],
    description: "Switch to 3-pane view",
    category: "Navigation",
  },
  {
    keys: [mod, shift, "]"],
    description: "Toggle Right Pane",
    category: "Navigation",
  },
  {
    keys: [mod, "K"],
    description: "Add or edit link",
    category: "Editor",
  },
  {
    keys: [mod, shift, "C"],
    description: "Open Copy & Export menu",
    category: "Editor",
  },
  {
    keys: [mod, "F"],
    description: "Find in current note",
    category: "Editor",
  },
  {
    keys: [mod, shift, "M"],
    description: "Toggle Markdown source",
    category: "Editor",
  },
  {
    keys: [mod, shift, "Enter"],
    description: "Toggle Focus mode",
    category: "Editor",
  },
  {
    keys: ["/"],
    description: "Slash commands (at start of line)",
    category: "Editor",
  },
  {
    keys: [mod, shift, "F"],
    description: "Search notes",
    category: "Navigation",
  },
  {
    keys: [mod, alt, "1"],
    description: "Go to General settings tab",
    category: "Settings",
  },
  {
    keys: [mod, alt, "2"],
    description: "Go to Appearance settings tab",
    category: "Settings",
  },
  {
    keys: [mod, alt, "3"],
    description: "Go to Assistant & CLI settings tab",
    category: "Settings",
  },
  {
    keys: [mod, alt, "4"],
    description: "Go to Shortcuts settings tab",
    category: "Settings",
  },
  {
    keys: [mod, alt, "5"],
    description: "Go to About settings tab",
    category: "Settings",
  },
  {
    keys: [mod, "="],
    description: "Zoom in",
    category: "Navigation",
  },
  {
    keys: [mod, "−"],
    description: "Zoom out",
    category: "Navigation",
  },
  {
    keys: [mod, "0"],
    description: "Reset zoom",
    category: "Navigation",
  },
];
