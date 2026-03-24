export type FolderIconsMap = Record<string, string>;

export function sanitizeFolderIcons(
  folderIcons: FolderIconsMap | null | undefined,
): FolderIconsMap {
  if (!folderIcons) return {};

  return Object.fromEntries(
    Object.entries(folderIcons).filter(
      ([path, iconName]) => path.trim().length > 0 && iconName.trim().length > 0,
    ),
  );
}

export function getFolderIconName(
  folderIcons: FolderIconsMap,
  path: string | null,
): string | null {
  if (!path) return null;
  return folderIcons[path] ?? null;
}

export function rewriteFolderIconPaths(
  folderIcons: FolderIconsMap,
  oldPath: string,
  newPath: string,
): FolderIconsMap {
  const next = { ...folderIcons };
  const oldPrefix = `${oldPath}/`;
  const newPrefix = `${newPath}/`;

  for (const [path, iconName] of Object.entries(folderIcons)) {
    if (path === oldPath) {
      delete next[path];
      next[newPath] = iconName;
      continue;
    }

    if (path.startsWith(oldPrefix)) {
      delete next[path];
      next[`${newPrefix}${path.slice(oldPrefix.length)}`] = iconName;
    }
  }

  return next;
}

export function removeFolderIconPaths(
  folderIcons: FolderIconsMap,
  path: string,
): FolderIconsMap {
  const prefix = `${path}/`;
  return Object.fromEntries(
    Object.entries(folderIcons).filter(
      ([folderPath]) => folderPath !== path && !folderPath.startsWith(prefix),
    ),
  );
}
