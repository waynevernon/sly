import type { ReactNode } from "react";

export type CommandSection =
  | "Notes"
  | "Tasks"
  | "Editor"
  | "Navigation"
  | "Git"
  | "Settings"
  | "System";

export interface AppCommand {
  id: string;
  label: string;
  section: CommandSection;
  shortcut?: string;
  keywords?: string[];
  icon?: ReactNode;
  action: () => void;
}

export function commandMatchesQuery(command: AppCommand, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    command.label,
    command.section,
    command.shortcut,
    ...(command.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}
