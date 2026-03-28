import type {
  FolderAppearance,
  FolderColorId,
  FolderIconSpec,
} from "../types/note";

export type FolderAppearanceInput =
  | FolderAppearance
  | string
  | null
  | undefined;

export type FolderAppearanceMap = Record<string, FolderAppearance>;

export const FOLDER_COLOR_IDS: FolderColorId[] = [
  "slate",
  "blue",
  "teal",
  "green",
  "olive",
  "amber",
  "orange",
  "red",
  "plum",
];

export const FOLDER_COLOR_PALETTE: Record<
  FolderColorId,
  { light: string; dark: string; swatch: string }
> = {
  slate: {
    light: "#58677a",
    dark: "#b8c5d6",
    swatch: "#64748b",
  },
  blue: {
    light: "#2f6fde",
    dark: "#7fb4ff",
    swatch: "#3b82f6",
  },
  teal: {
    light: "#0f8b82",
    dark: "#59d0c8",
    swatch: "#14b8a6",
  },
  green: {
    light: "#2f8a4c",
    dark: "#74d39a",
    swatch: "#22c55e",
  },
  olive: {
    light: "#708238",
    dark: "#bfd36e",
    swatch: "#84a53a",
  },
  amber: {
    light: "#b26a00",
    dark: "#f0c061",
    swatch: "#f59e0b",
  },
  orange: {
    light: "#c45a1d",
    dark: "#ffb07c",
    swatch: "#f97316",
  },
  red: {
    light: "#c14545",
    dark: "#ff8f8f",
    swatch: "#ef4444",
  },
  plum: {
    light: "#8950bb",
    dark: "#d2a4ff",
    swatch: "#a855f7",
  },
};

function isFolderColorId(value: unknown): value is FolderColorId {
  return (
    typeof value === "string" &&
    FOLDER_COLOR_IDS.includes(value as FolderColorId)
  );
}

function sanitizeFolderIconSpec(value: unknown): FolderIconSpec | null {
  if (!value || typeof value !== "object") return null;

  const nextValue = value as Partial<FolderIconSpec>;
  if (
    nextValue.kind === "lucide" &&
    typeof nextValue.name === "string" &&
    nextValue.name.trim().length > 0
  ) {
    return {
      kind: "lucide",
      name: nextValue.name.trim(),
    };
  }

  if (
    nextValue.kind === "emoji" &&
    typeof nextValue.shortcode === "string" &&
    nextValue.shortcode.trim().length > 0
  ) {
    return {
      kind: "emoji",
      shortcode: nextValue.shortcode.trim(),
    };
  }

  return null;
}

export function sanitizeFolderAppearance(
  folderAppearance: FolderAppearanceInput,
): FolderAppearance | null {
  if (typeof folderAppearance === "string") {
    const iconName = folderAppearance.trim();
    return iconName
      ? {
          icon: {
            kind: "lucide",
            name: iconName,
          },
        }
      : null;
  }

  if (!folderAppearance || typeof folderAppearance !== "object") {
    return null;
  }

  const icon = sanitizeFolderIconSpec(folderAppearance.icon);
  const colorId = isFolderColorId(folderAppearance.colorId)
    ? folderAppearance.colorId
    : undefined;

  if (!icon && !colorId) return null;

  return {
    ...(icon ? { icon } : {}),
    ...(colorId ? { colorId } : {}),
  };
}

export function sanitizeFolderAppearances(
  folderIcons:
    | Record<string, FolderAppearanceInput>
    | null
    | undefined,
): FolderAppearanceMap {
  if (!folderIcons) return {};

  return Object.fromEntries(
    Object.entries(folderIcons).flatMap(([path, folderAppearance]) => {
      const normalizedPath = path.trim();
      if (!normalizedPath) return [];

      const normalizedAppearance = sanitizeFolderAppearance(folderAppearance);
      return normalizedAppearance ? [[normalizedPath, normalizedAppearance]] : [];
    }),
  );
}

export function getFolderAppearance(
  folderAppearances: FolderAppearanceMap,
  path: string | null,
): FolderAppearance | null {
  if (!path) return null;
  return folderAppearances[path] ?? null;
}

export function getFolderIcon(
  folderAppearances: FolderAppearanceMap,
  path: string | null,
): FolderIconSpec | null {
  return getFolderAppearance(folderAppearances, path)?.icon ?? null;
}

export function rewriteFolderAppearancePaths(
  folderAppearances: FolderAppearanceMap,
  oldPath: string,
  newPath: string,
): FolderAppearanceMap {
  const next = { ...folderAppearances };
  const oldPrefix = `${oldPath}/`;
  const newPrefix = `${newPath}/`;

  for (const [path, folderAppearance] of Object.entries(folderAppearances)) {
    if (path === oldPath) {
      delete next[path];
      next[newPath] = folderAppearance;
      continue;
    }

    if (path.startsWith(oldPrefix)) {
      delete next[path];
      next[`${newPrefix}${path.slice(oldPrefix.length)}`] = folderAppearance;
    }
  }

  return next;
}

export function removeFolderAppearancePaths(
  folderAppearances: FolderAppearanceMap,
  path: string,
): FolderAppearanceMap {
  const prefix = `${path}/`;
  return Object.fromEntries(
    Object.entries(folderAppearances).filter(
      ([folderPath]) => folderPath !== path && !folderPath.startsWith(prefix),
    ),
  );
}

export function areFolderAppearancesEqual(
  a: FolderAppearance | null | undefined,
  b: FolderAppearance | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const aIcon = a.icon;
  const bIcon = b.icon;
  if (!aIcon && bIcon) return false;
  if (aIcon && !bIcon) return false;
  if (aIcon?.kind !== bIcon?.kind) return false;
  if (aIcon?.kind === "lucide" && aIcon.name !== (bIcon as typeof aIcon).name) {
    return false;
  }
  if (
    aIcon?.kind === "emoji" &&
    aIcon.shortcode !== (bIcon as typeof aIcon).shortcode
  ) {
    return false;
  }

  return a.colorId === b.colorId;
}

export function resolveFolderColorValue(
  colorId: FolderColorId | null | undefined,
  resolvedTheme: "light" | "dark",
): string | null {
  if (!colorId) return null;
  return FOLDER_COLOR_PALETTE[colorId][resolvedTheme];
}

export function resolveFolderAppearanceTextColor(
  folderAppearance: FolderAppearance | null | undefined,
  resolvedTheme: "light" | "dark",
): string | null {
  return resolveFolderColorValue(folderAppearance?.colorId, resolvedTheme);
}

export function resolveFolderAppearanceIconColor(
  folderAppearance: FolderAppearance | null | undefined,
  resolvedTheme: "light" | "dark",
): string | null {
  if (isEmojiFolderIcon(folderAppearance?.icon)) return null;
  return resolveFolderAppearanceTextColor(folderAppearance, resolvedTheme);
}

export function isEmojiFolderIcon(
  icon: FolderIconSpec | null | undefined,
): icon is Extract<FolderIconSpec, { kind: "emoji" }> {
  return icon?.kind === "emoji";
}

export function isLucideFolderIcon(
  icon: FolderIconSpec | null | undefined,
): icon is Extract<FolderIconSpec, { kind: "lucide" }> {
  return icon?.kind === "lucide";
}
