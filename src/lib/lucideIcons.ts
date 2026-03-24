import * as LucideIcons from "lucide-react";
import type { ComponentType } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

export type LucideIconComponent = ComponentType<LucideProps> | LucideIcon;

export interface LucideIconCatalogEntry {
  name: string;
  searchText: string;
  Component: LucideIconComponent;
}

function toKebabCase(value: string) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d)/g, "$1-$2")
    .replace(/(\d)([a-zA-Z])/g, "$1-$2")
    .toLowerCase();
}

function isLucideComponentExportValue(
  exportedValue: unknown,
): exportedValue is LucideIconComponent {
  if (typeof exportedValue === "function") {
    return true;
  }

  return (
    typeof exportedValue === "object" &&
    exportedValue !== null &&
    "$$typeof" in exportedValue &&
    "render" in exportedValue
  );
}

function isLucideIconExport(
  exportName: string,
  exportedValue: unknown,
): exportedValue is LucideIconComponent {
  const firstCharacter = exportName[0];

  if (
    exportName === "Icon" ||
    exportName === "LucideProvider" ||
    exportName.endsWith("Icon") ||
    !firstCharacter ||
    firstCharacter !== firstCharacter.toUpperCase()
  ) {
    return false;
  }

  return isLucideComponentExportValue(exportedValue);
}

export function buildLucideIconMap(module: Record<string, unknown>) {
  const iconMap = new Map<string, LucideIconComponent>();

  for (const [exportName, exportedValue] of Object.entries(module)) {
    if (!isLucideIconExport(exportName, exportedValue)) {
      continue;
    }

    const iconName = toKebabCase(exportName);
    if (!iconMap.has(iconName)) {
      iconMap.set(iconName, exportedValue);
    }
  }

  return iconMap;
}

export function buildLucideIconCatalog(module: Record<string, unknown>) {
  const iconMap = buildLucideIconMap(module);

  return Array.from(iconMap.entries())
    .map(([name, Component]) => ({
      name,
      searchText: `${name} ${name.replace(/-/g, " ")}`,
      Component,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export const LUCIDE_ICON_MAP = buildLucideIconMap(
  LucideIcons as Record<string, unknown>,
);

export const LUCIDE_ICON_CATALOG = buildLucideIconCatalog(
  LucideIcons as Record<string, unknown>,
);
