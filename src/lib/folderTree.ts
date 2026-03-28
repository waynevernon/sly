import {
  DEFAULT_FOLDER_SORT_MODE,
  type FolderNode,
  type FolderSortMode,
  type NoteMetadata,
} from "../types/note";

export interface FolderTreeData {
  rootNotes: NoteMetadata[];
  folders: FolderNode[];
}

export function rewriteFolderPathList(
  paths: string[],
  oldPath: string,
  newPath: string,
): string[] {
  const oldPrefix = `${oldPath}/`;
  const newPrefix = `${newPath}/`;
  const seen = new Set<string>();
  const nextPaths: string[] = [];

  for (const path of paths) {
    const nextPath =
      path === oldPath
        ? newPath
        : path.startsWith(oldPrefix)
          ? `${newPrefix}${path.slice(oldPrefix.length)}`
          : path;

    if (seen.has(nextPath)) {
      continue;
    }

    seen.add(nextPath);
    nextPaths.push(nextPath);
  }

  return nextPaths;
}

export function buildFolderTree(
  notes: NoteMetadata[],
  _pinnedIds: Set<string>,
  knownFolders?: string[],
  folderSortMode: FolderSortMode = DEFAULT_FOLDER_SORT_MODE,
): FolderTreeData {
  const rootNotes: NoteMetadata[] = [];
  const folderMap = new Map<string, FolderNode>();

  function ensureFolder(path: string): FolderNode {
    const existing = folderMap.get(path);
    if (existing) return existing;

    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const node: FolderNode = { name, path, children: [], notes: [] };
    folderMap.set(path, node);

    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureFolder(parentPath);
      if (!parent.children.some((c) => c.path === path)) {
        parent.children.push(node);
      }
    }

    return node;
  }

  // Ensure all known disk folders exist in the tree (even if empty)
  if (knownFolders) {
    for (const folderPath of knownFolders) {
      ensureFolder(folderPath);
    }
  }

  for (const note of notes) {
    const lastSlash = note.id.lastIndexOf("/");
    if (lastSlash === -1) {
      rootNotes.push(note);
    } else {
      const folderPath = note.id.substring(0, lastSlash);
      const folder = ensureFolder(folderPath);
      folder.notes.push(note);
    }
  }

  function compareFolders(
    left: FolderNode,
    right: FolderNode,
  ): number {
    const comparison = left.name.localeCompare(right.name);
    if (comparison !== 0) {
      return folderSortMode === "nameDesc" ? -comparison : comparison;
    }
    return left.path.localeCompare(right.path);
  }

  function sortNode(node: FolderNode) {
    node.children.sort(compareFolders);
    node.children.forEach(sortNode);
  }

  const topLevelFolders = Array.from(folderMap.values()).filter(
    (f) => !f.path.includes("/"),
  );
  topLevelFolders.sort(compareFolders);
  topLevelFolders.forEach(sortNode);

  return { rootNotes, folders: topLevelFolders };
}

export type TreeItem =
  | { type: "note"; id: string }
  | { type: "folder"; path: string };

/** Build a flat list of visible tree items in DFS order (for keyboard navigation). */
export function getVisibleItems(
  tree: FolderTreeData,
  pinnedIds: Set<string>,
  collapsedFolders: Set<string>,
): TreeItem[] {
  const items: TreeItem[] = [];

  // Pinned root notes first
  for (const note of tree.rootNotes) {
    if (pinnedIds.has(note.id)) {
      items.push({ type: "note", id: note.id });
    }
  }

  // Folders (recursive DFS)
  function walkFolder(folder: FolderNode) {
    items.push({ type: "folder", path: folder.path });
    if (!collapsedFolders.has(folder.path)) {
      for (const child of folder.children) {
        walkFolder(child);
      }
      for (const note of folder.notes) {
        items.push({ type: "note", id: note.id });
      }
    }
  }
  for (const folder of tree.folders) {
    walkFolder(folder);
  }

  // Unpinned root notes
  for (const note of tree.rootNotes) {
    if (!pinnedIds.has(note.id)) {
      items.push({ type: "note", id: note.id });
    }
  }

  return items;
}

export function countNotesInFolder(folder: FolderNode): number {
  let count = folder.notes.length;
  for (const child of folder.children) {
    count += countNotesInFolder(child);
  }
  return count;
}
