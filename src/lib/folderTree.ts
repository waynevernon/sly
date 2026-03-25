import {
  DEFAULT_FOLDER_SORT_MODE,
  type FolderManualOrder,
  type FolderNode,
  type FolderSortMode,
  type NoteMetadata,
} from "../types/note";

export interface FolderTreeData {
  rootNotes: NoteMetadata[];
  folders: FolderNode[];
}

export interface VisibleFolderRow {
  path: string;
  depth: number;
  parentPath: string;
  visibleIndex: number;
}

export interface ProjectedFolderDrop {
  parentPath: string;
  insertIndex: number;
  depth: number;
  lineAnchor: "before" | "after";
  beforePath?: string;
  afterPath?: string;
}

export interface FolderDropOrderPlan {
  activePath: string;
  sourceParentPath: string;
  targetParentPath: string;
  targetOrder: string[];
  sourceOrder?: string[];
  newPath: string;
  movedAcrossParents: boolean;
  isNoOp: boolean;
}

function isSameOrDescendantPath(path: string, ancestorPath: string): boolean {
  return path === ancestorPath || path.startsWith(`${ancestorPath}/`);
}

function getFolderLeaf(path: string): string {
  return path.split("/").pop() || path;
}

function getFolderParentPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash >= 0 ? path.substring(0, lastSlash) : "";
}

function buildFolderChildrenMap(tree: FolderTreeData): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();

  function visitChildren(parentPath: string, folders: FolderNode[]) {
    childrenByParent.set(
      parentPath,
      folders.map((folder) => folder.path),
    );

    folders.forEach((folder) => visitChildren(folder.path, folder.children));
  }

  visitChildren("", tree.folders);

  return childrenByParent;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function buildFolderTree(
  notes: NoteMetadata[],
  _pinnedIds: Set<string>,
  knownFolders?: string[],
  folderSortMode: FolderSortMode = DEFAULT_FOLDER_SORT_MODE,
  folderManualOrder: FolderManualOrder = {},
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
    parentPath: string,
  ): number {
    if (folderSortMode === "manual") {
      const positions = new Map(
        (folderManualOrder[parentPath] || []).map((path, index) => [path, index]),
      );
      const leftPosition = positions.get(left.path);
      const rightPosition = positions.get(right.path);

      if (leftPosition !== undefined && rightPosition !== undefined) {
        return leftPosition - rightPosition;
      }
      if (leftPosition !== undefined) return -1;
      if (rightPosition !== undefined) return 1;
    }

    const comparison = left.name.localeCompare(right.name);
    if (comparison !== 0) {
      return folderSortMode === "nameDesc" ? -comparison : comparison;
    }
    return left.path.localeCompare(right.path);
  }

  function sortNode(node: FolderNode) {
    node.children.sort((a, b) => compareFolders(a, b, node.path));
    node.children.forEach(sortNode);
  }

  const topLevelFolders = Array.from(folderMap.values()).filter(
    (f) => !f.path.includes("/"),
  );
  topLevelFolders.sort((a, b) => compareFolders(a, b, ""));
  topLevelFolders.forEach(sortNode);

  return { rootNotes, folders: topLevelFolders };
}

export function flattenVisibleFolders(
  tree: FolderTreeData,
  collapsedFolders: Set<string>,
): VisibleFolderRow[] {
  const rows: VisibleFolderRow[] = [];

  function walkFolder(folder: FolderNode, depth: number, parentPath: string) {
    rows.push({
      path: folder.path,
      depth,
      parentPath,
      visibleIndex: rows.length,
    });

    if (collapsedFolders.has(folder.path)) {
      return;
    }

    folder.children.forEach((child) => walkFolder(child, depth + 1, folder.path));
  }

  tree.folders.forEach((folder) => walkFolder(folder, 0, ""));

  return rows;
}

export function projectFolderDrop({
  tree,
  collapsedFolders,
  activePath,
  overPath,
  placement,
  horizontalOffset,
  indentationWidth = 12,
}: {
  tree: FolderTreeData;
  collapsedFolders: Set<string>;
  activePath: string;
  overPath: string;
  placement: "before" | "after";
  horizontalOffset: number;
  indentationWidth?: number;
}): ProjectedFolderDrop | null {
  const rows = flattenVisibleFolders(tree, collapsedFolders);
  const activeRow = rows.find((row) => row.path === activePath);
  if (!activeRow) {
    return null;
  }

  const remainingRows = rows.filter(
    (row) => !isSameOrDescendantPath(row.path, activePath),
  );
  const overIndex = remainingRows.findIndex((row) => row.path === overPath);
  if (overIndex === -1) {
    return null;
  }

  const insertionIndex = overIndex + (placement === "after" ? 1 : 0);
  const previousRow = remainingRows[insertionIndex - 1];
  const nextRow = remainingRows[insertionIndex];
  const rawDepth =
    activeRow.depth + Math.round(horizontalOffset / indentationWidth);
  const maxDepth = previousRow ? previousRow.depth + 1 : 0;
  const minDepth = nextRow ? Math.min(nextRow.depth, maxDepth) : 0;
  const depth = clamp(rawDepth, minDepth, maxDepth);

  let parentPath = "";
  const nestedUnderPrevious = Boolean(previousRow && depth > previousRow.depth);

  if (depth > 0) {
    if (!previousRow) {
      return null;
    }

    if (nestedUnderPrevious) {
      parentPath = previousRow.path;
    } else if (depth === previousRow.depth) {
      parentPath = previousRow.parentPath;
    } else {
      const ancestorRow = [...remainingRows.slice(0, insertionIndex)]
        .reverse()
        .find((row) => row.depth === depth - 1);

      if (!ancestorRow) {
        return null;
      }

      parentPath = ancestorRow.path;
    }
  }

  const childrenByParent = buildFolderChildrenMap(tree);
  const targetChildren = (childrenByParent.get(parentPath) ?? []).filter(
    (path) => path !== activePath,
  );

  let insertIndex = targetChildren.length;
  if (nestedUnderPrevious) {
    insertIndex = 0;
  } else if (nextRow?.parentPath === parentPath) {
    const nextSiblingIndex = targetChildren.indexOf(nextRow.path);
    insertIndex = nextSiblingIndex === -1 ? targetChildren.length : nextSiblingIndex;
  } else if (previousRow?.parentPath === parentPath) {
    const previousSiblingIndex = targetChildren.indexOf(previousRow.path);
    insertIndex =
      previousSiblingIndex === -1
        ? targetChildren.length
        : previousSiblingIndex + 1;
  } else if (targetChildren.length === 0) {
    insertIndex = 0;
  }

  return {
    parentPath,
    insertIndex,
    depth,
    lineAnchor: nextRow ? "before" : "after",
    beforePath: previousRow?.path,
    afterPath: nextRow?.path,
  };
}

export function buildFolderDropOrderPlan(
  tree: FolderTreeData,
  activePath: string,
  projection: ProjectedFolderDrop,
): FolderDropOrderPlan | null {
  const sourceParentPath = getFolderParentPath(activePath);
  const targetParentPath = projection.parentPath;
  const childrenByParent = buildFolderChildrenMap(tree);
  const activeName = getFolderLeaf(activePath);
  const movedAcrossParents = sourceParentPath !== targetParentPath;
  const currentSourceChildren = childrenByParent.get(sourceParentPath) ?? [];
  const nextPath = movedAcrossParents
    ? targetParentPath
      ? `${targetParentPath}/${activeName}`
      : activeName
    : activePath;

  const targetChildren = (
    childrenByParent.get(targetParentPath) ?? []
  ).filter((path) => path !== activePath && path !== nextPath);
  const insertIndex = clamp(
    projection.insertIndex,
    0,
    targetChildren.length,
  );
  const nextTargetOrder = [...targetChildren];
  nextTargetOrder.splice(insertIndex, 0, nextPath);

  if (!movedAcrossParents) {
    return {
      activePath,
      sourceParentPath,
      targetParentPath,
      targetOrder: nextTargetOrder,
      newPath: activePath,
      movedAcrossParents: false,
      isNoOp: arraysEqual(currentSourceChildren, nextTargetOrder),
    };
  }

  const nextSourceOrder = currentSourceChildren.filter((path) => path !== activePath);

  return {
    activePath,
    sourceParentPath,
    targetParentPath,
    targetOrder: nextTargetOrder,
    sourceOrder: nextSourceOrder,
    newPath: nextPath,
    movedAcrossParents: true,
    isNoOp: false,
  };
}

function cloneFolderNode(folder: FolderNode): FolderNode {
  return {
    ...folder,
    notes: [...folder.notes],
    children: folder.children.map(cloneFolderNode),
  };
}

export function applyFolderDropOrderPlan(
  tree: FolderTreeData,
  plan: FolderDropOrderPlan,
): FolderTreeData {
  const rootFolders = tree.folders.map(cloneFolderNode);
  const rootNode: FolderNode = {
    name: "",
    path: "",
    notes: [],
    children: rootFolders,
  };
  const folderMap = new Map<string, FolderNode>([["", rootNode]]);

  function indexFolders(folder: FolderNode) {
    folderMap.set(folder.path, folder);
    folder.children.forEach(indexFolders);
  }

  rootFolders.forEach(indexFolders);

  const sourceParent = folderMap.get(plan.sourceParentPath);
  const activeNode = folderMap.get(plan.activePath);
  const targetParent = folderMap.get(plan.targetParentPath);

  if (!sourceParent || !activeNode || !targetParent) {
    return tree;
  }

  sourceParent.children = sourceParent.children.filter(
    (folder) => folder.path !== plan.activePath,
  );

  const insertPath = plan.movedAcrossParents ? plan.newPath : plan.activePath;
  const insertIndex = Math.max(
    0,
    plan.targetOrder.findIndex((path) => path === insertPath),
  );

  targetParent.children = targetParent.children.filter(
    (folder) => folder.path !== plan.activePath,
  );
  targetParent.children.splice(insertIndex, 0, activeNode);

  return {
    rootNotes: [...tree.rootNotes],
    folders: rootNode.children,
  };
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
