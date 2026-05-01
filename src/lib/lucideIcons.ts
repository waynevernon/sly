import * as LucideIcons from "lucide-react";
import type { ComponentType } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { buildCatalogSearchIndex, searchCatalog } from "./catalogSearch";

export type LucideIconComponent = ComponentType<LucideProps> | LucideIcon;

export interface LucideIconCatalogEntry {
  name: string;
  searchText: string;
  aliases: string[];
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

function getDisplayName(
  component: LucideIconComponent,
  fallbackName: string,
): string {
  return component !== null &&
    (typeof component === "function" || typeof component === "object") &&
    "displayName" in component
    ? String(component.displayName ?? fallbackName)
    : fallbackName;
}

function getCanonicalIconName(
  component: LucideIconComponent,
  aliases: string[],
): string {
  const displayName = toKebabCase(getDisplayName(component, aliases[0] ?? "icon"));
  if (aliases.includes(displayName)) return displayName;

  return (
    aliases.find((alias) => !alias.startsWith("lucide-")) ??
    aliases[0] ??
    displayName
  );
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
  const iconsByComponent = new Map<
    LucideIconComponent,
    { Component: LucideIconComponent; aliases: Set<string> }
  >();

  for (const [exportName, exportedValue] of Object.entries(module)) {
    if (!isLucideIconExport(exportName, exportedValue)) {
      continue;
    }

    const aliases = iconsByComponent.get(exportedValue) ?? {
      Component: exportedValue,
      aliases: new Set<string>(),
    };
    aliases.aliases.add(toKebabCase(exportName));
    iconsByComponent.set(exportedValue, aliases);
  }

  return Array.from(iconsByComponent.values())
    .map(({ Component, aliases }) => {
      const searchableAliases = Array.from(aliases).sort();
      const name = getCanonicalIconName(Component, searchableAliases);

      return {
        name,
        searchText: [name, name.replace(/-/g, " "), ...searchableAliases].join(
          " ",
        ),
        aliases: searchableAliases,
        Component,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export const LUCIDE_ICON_MAP = buildLucideIconMap(
  LucideIcons as Record<string, unknown>,
);

export const LUCIDE_ICON_CATALOG = buildLucideIconCatalog(
  LucideIcons as Record<string, unknown>,
);

const lucideIconSearchIndex = buildCatalogSearchIndex(
  LUCIDE_ICON_CATALOG.map((icon) => ({
    item: icon,
    sortText: icon.name,
    terms: [
      { text: icon.name, kind: "primary" as const },
      { text: icon.name.replace(/-/g, " "), kind: "alias" as const },
      ...icon.aliases.flatMap((alias) => [
        { text: alias, kind: "alias" as const },
        { text: alias.replace(/-/g, " "), kind: "alias" as const },
      ]),
    ],
  })),
);

export function searchLucideIcons(
  query: string,
  limit?: number,
): LucideIconCatalogEntry[] {
  return searchCatalog(lucideIconSearchIndex, query, limit).map(
    ({ item }) => item,
  );
}
