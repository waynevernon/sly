import type { TaskQuickAddShortcut } from "../types/note";
import { ctrl, isMac, mod, shift, shortcut } from "./platform";

export const DEFAULT_TASK_QUICK_ADD_SHORTCUT: Exclude<
  TaskQuickAddShortcut,
  "disabled"
> = isMac ? "control-space" : "command-shift-n";

export function resolveTaskQuickAddShortcut(
  value: TaskQuickAddShortcut | null | undefined,
): TaskQuickAddShortcut {
  return value ?? DEFAULT_TASK_QUICK_ADD_SHORTCUT;
}

export function getTaskQuickAddShortcutAccelerator(
  value: TaskQuickAddShortcut | null | undefined,
): string | null {
  const resolved = resolveTaskQuickAddShortcut(value);

  if (resolved === "disabled") {
    return null;
  }

  if (resolved === "control-space") {
    return "Control+Space";
  }

  return "CommandOrControl+Shift+N";
}

export function getTaskQuickAddShortcutLabel(
  value: TaskQuickAddShortcut | null | undefined,
): string {
  const resolved = resolveTaskQuickAddShortcut(value);

  if (resolved === "disabled") {
    return "Off";
  }

  if (resolved === "control-space") {
    return shortcut(ctrl, "Space");
  }

  return shortcut(mod, shift, "N");
}

export function matchesTaskQuickAddShortcut(
  event: KeyboardEvent,
  value: TaskQuickAddShortcut | null | undefined,
): boolean {
  const resolved = resolveTaskQuickAddShortcut(value);

  if (resolved === "disabled") {
    return false;
  }

  if (resolved === "control-space") {
    return (
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.code === "Space"
    );
  }

  return (
    (isMac ? event.metaKey : event.ctrlKey) &&
    !event.altKey &&
    event.shiftKey &&
    event.key.toLowerCase() === "n"
  );
}
