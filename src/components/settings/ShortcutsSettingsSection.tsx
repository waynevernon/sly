import { useState } from "react";
import { alt, mod } from "../../lib/platform";
import { Button } from "../ui";

interface Shortcut {
  keys: string[];
  description: string;
  category?: string;
}

interface MarkdownExample {
  syntax: string;
  result: string;
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
    keys: [mod, "/"],
    description: "Open shortcuts & markdown guide",
    category: "Navigation",
  },
  {
    keys: [mod, "N"],
    description: "Create new note",
    category: "Notes",
  },
  {
    keys: [mod, "Shift", "N"],
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
    keys: [mod, "4"],
    description: "Toggle right panel",
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

const markdownExamples: MarkdownExample[] = [
  { syntax: "# Heading 1", result: "Large section heading" },
  { syntax: "## Heading 2", result: "Subsection heading" },
  { syntax: "**bold**", result: "Bold text" },
  { syntax: "*italic*", result: "Italic text" },
  { syntax: "~~strike~~", result: "Strikethrough text" },
  { syntax: "- List item", result: "Bulleted list" },
  { syntax: "1. List item", result: "Numbered list" },
  { syntax: "- [ ] Task", result: "Task list item" },
  { syntax: "[Label](https://example.com)", result: "Link" },
  { syntax: "[[Note Title]]", result: "Wikilink to another note" },
  { syntax: "`inline code`", result: "Inline code" },
  {
    syntax: "```js\nconsole.log('Hello')\n```",
    result: "Fenced code block",
  },
  { syntax: "> Quote", result: "Blockquote" },
  { syntax: "---", result: "Divider" },
  { syntax: "$$x^2 + y^2$$", result: "Block math" },
  {
    syntax: "```mermaid\ngraph TD\nA-->B\n```",
    result: "Mermaid diagram",
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

function ShortcutsReference() {
  const categoryOrder = ["Navigation", "Notes", "Tasks", "Editor", "Settings"];

  return (
    <div className="space-y-10">
      {categoryOrder.map((category, idx) => {
        const categoryShortcuts = groupedShortcuts[category];
        if (!categoryShortcuts) return null;

        return (
          <div key={category}>
            {idx > 0 && <div className="ui-settings-separator" />}
            <section>
              <h2 className={idx > 0 ? "text-xl font-medium pt-10 mb-4" : "text-xl font-medium mb-4"}>
                {category}
              </h2>
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

function MarkdownGuide() {
  return (
    <section>
      <h2 className="text-xl font-medium mb-2">Markdown Guide</h2>
      <p className="text-sm text-text-muted mb-4">
        Common syntax supported in Sly&apos;s editor.
      </p>
      <div className="ui-settings-panel overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)]">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted border-b border-border">
            Syntax
          </div>
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted border-b border-border">
            Result
          </div>
          {markdownExamples.map((example) => (
            <div
              key={example.syntax}
              className="col-span-2 grid grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)] border-b border-border last:border-b-0"
            >
              <div className="px-4 py-3">
                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm text-text">
                  <code>{example.syntax}</code>
                </pre>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-text">{example.result}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ShortcutsSettingsSection() {
  const [activeTab, setActiveTab] = useState<"shortcuts" | "markdown">(
    "shortcuts",
  );

  return (
    <div className="space-y-6 pt-8 pb-10">
      <section>
        <h1 className="text-xl font-medium mb-2">Reference</h1>
        <p className="text-sm text-text-muted mb-4">
          Browse keyboard shortcuts or switch to the markdown guide.
        </p>
        <div className="flex gap-2 p-1 rounded-[10px] border border-border w-fit">
          <Button
            onClick={() => setActiveTab("shortcuts")}
            variant={activeTab === "shortcuts" ? "primary" : "ghost"}
            size="md"
          >
            Keyboard Shortcuts
          </Button>
          <Button
            onClick={() => setActiveTab("markdown")}
            variant={activeTab === "markdown" ? "primary" : "ghost"}
            size="md"
          >
            Markdown Guide
          </Button>
        </div>
      </section>

      <div className="ui-settings-separator" />

      {activeTab === "shortcuts" ? <ShortcutsReference /> : <MarkdownGuide />}
    </div>
  );
}
