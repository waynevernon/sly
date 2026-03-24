import { alt, mod } from "../../lib/platform";

interface Shortcut {
  keys: string[];
  description: string;
  category?: string;
}

const shortcuts: Shortcut[] = [
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
    keys: [mod, "N"],
    description: "Create new note",
    category: "Notes",
  },
  {
    keys: [mod, "D"],
    description: "Duplicate current note",
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
    keys: [mod, ","],
    description: "Open settings",
    category: "Navigation",
  },
  {
    keys: [mod, "1"],
    description: "Switch to 1-pane view",
    category: "Navigation",
  },
  {
    keys: [mod, "2"],
    description: "Switch to 2-pane view",
    category: "Navigation",
  },
  {
    keys: [mod, "3"],
    description: "Switch to 3-pane view",
    category: "Navigation",
  },
  {
    keys: [mod, "\\"],
    description: "Cycle workspace layout",
    category: "Navigation",
  },
  {
    keys: [mod, "K"],
    description: "Add or edit link",
    category: "Editor",
  },
  {
    keys: [mod, "Shift", "C"],
    description: "Open Copy & Export menu",
    category: "Editor",
  },
  {
    keys: [mod, "F"],
    description: "Find in current note",
    category: "Editor",
  },
  {
    keys: [mod, "Shift", "M"],
    description: "Toggle Markdown source",
    category: "Editor",
  },
  {
    keys: [mod, "Shift", "Enter"],
    description: "Toggle Focus mode",
    category: "Editor",
  },
  {
    keys: ["/"],
    description: "Slash commands (at start of line)",
    category: "Editor",
  },
  {
    keys: [mod, "Shift", "F"],
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
    description: "Go to Shortcuts settings tab",
    category: "Settings",
  },
  {
    keys: [mod, alt, "4"],
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

// Group shortcuts by category
const groupedShortcuts = shortcuts.reduce(
  (acc, shortcut) => {
    const category = shortcut.category || "General";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(shortcut);
    return acc;
  },
  {} as Record<string, Shortcut[]>,
);

// Render individual key as keyboard button
function KeyboardKey({ keyLabel }: { keyLabel: string }) {
  return <kbd className="ui-kbd">{keyLabel}</kbd>;
}

// Render shortcut keys
function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {keys.map((key, index) => (
        <KeyboardKey key={index} keyLabel={key} />
      ))}
    </div>
  );
}

export function ShortcutsSettingsSection() {
  const categoryOrder = ["Navigation", "Notes", "Editor", "Settings"];

  return (
    <div className="space-y-10 pt-8 pb-10">
      {categoryOrder.map((category, idx) => {
        const categoryShortcuts = groupedShortcuts[category];
        if (!categoryShortcuts) return null;

        return (
          <div key={category}>
            {idx > 0 && <div className="ui-settings-separator" />}
            <section>
              <h2 className="text-xl font-medium pt-10 mb-4">{category}</h2>
              <div className="space-y-3">
                {categoryShortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-text font-medium">
                      {shortcut.description}
                    </span>
                    <ShortcutKeys keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        );
      })}
    </div>
  );
}
