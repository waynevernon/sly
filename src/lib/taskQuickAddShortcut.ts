import type { TaskQuickAddShortcut } from "../types/note";
import { ctrl, isMac, mod, shift, shortcut } from "./platform";

export const DEFAULT_TASK_QUICK_ADD_SHORTCUT: Exclude<
  TaskQuickAddShortcut,
  "disabled"
> = "control-space";

export const IN_APP_TASK_QUICK_ADD_SHORTCUT_LABEL = shortcut(mod, shift, "N");

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

export function matchesInAppTaskQuickAddShortcut(event: KeyboardEvent): boolean {
  return (
    (isMac ? event.metaKey : event.ctrlKey) &&
    !event.altKey &&
    event.shiftKey &&
    event.key.toLowerCase() === "n"
  );
}
