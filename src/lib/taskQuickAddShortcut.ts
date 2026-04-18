import type { TaskQuickAddShortcut } from "../types/note";
import { isMac } from "./platform";

const MODIFIER_KEYS = new Set([
  "Control", "Shift", "Alt", "Meta", "OS",
  "Hyper", "Super", "AltGraph", "CapsLock",
]);

function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

function normalizeKeyName(key: string): string | null {
  if (key === " ") return "Space";
  if (key === "Enter") return "Return";
  if (key === "Esc") return "Escape";
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (/^F\d{1,2}$/.test(key)) return key;
  const PASS_THROUGH_KEYS = [
    "Space", "Return", "Escape", "Backspace", "Delete", "Tab",
    "Left", "Right", "Up", "Down", "Home", "End", "PageUp", "PageDown",
  ];
  if (PASS_THROUGH_KEYS.includes(key)) return key;
  if (key === "ArrowLeft") return "Left";
  if (key === "ArrowRight") return "Right";
  if (key === "ArrowUp") return "Up";
  if (key === "ArrowDown") return "Down";
  return null;
}

export function captureAcceleratorFromEvent(event: KeyboardEvent): string | null {
  if (isModifierKey(event.key)) return null;

  const key = normalizeKeyName(event.key);
  if (!key) return null;

  const hasStrongModifier =
    event.ctrlKey || event.altKey || (isMac && event.metaKey);
  if (!hasStrongModifier) return null;

  const modifiers: string[] = [];
  if (isMac && event.metaKey) modifiers.push("Command");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  return [...modifiers, key].join("+");
}

export function acceleratorToLabel(accelerator: string): string {
  if (accelerator === "disabled") return "Off";
  const parts = accelerator.split("+");
  const displayParts = parts.map((part) => {
    if (isMac) {
      switch (part) {
        case "CommandOrControl":
        case "CmdOrCtrl":
        case "Command":
        case "Cmd":
          return "⌘";
        case "Control":
        case "Ctrl":
          return "⌃";
        case "Alt":
        case "Option":
          return "⌥";
        case "Shift":
          return "⇧";
        default:
          return part;
      }
    } else {
      switch (part) {
        case "CommandOrControl":
        case "CmdOrCtrl":
        case "Command":
        case "Cmd":
          return "Ctrl";
        case "Control":
        case "Ctrl":
          return "Ctrl";
        case "Alt":
          return "Alt";
        case "Shift":
          return "Shift";
        default:
          return part;
      }
    }
  });
  return isMac ? displayParts.join("") : displayParts.join("+");
}

export function getDefaultAccelerator(): string {
  return isMac ? "Control+Space" : "CommandOrControl+Shift+N";
}

export function getTaskQuickAddShortcutLabel(
  value: TaskQuickAddShortcut | null | undefined,
): string {
  if (!value) return acceleratorToLabel(getDefaultAccelerator());
  return acceleratorToLabel(value);
}

export const IN_APP_TASK_QUICK_ADD_SHORTCUT_LABEL = isMac ? "⌘⇧N" : "Ctrl+Shift+N";

export function matchesInAppTaskQuickAddShortcut(event: KeyboardEvent): boolean {
  return (
    (isMac ? event.metaKey : event.ctrlKey) &&
    !event.altKey &&
    event.shiftKey &&
    event.key.toLowerCase() === "n"
  );
}
