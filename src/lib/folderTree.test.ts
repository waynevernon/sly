import { describe, expect, it } from "vitest";
import { buildFolderTree, rewriteFolderPathList } from "./folderTree";
import type { NoteMetadata } from "../types/note";

const notes: NoteMetadata[] = [
  {
    id: "work/zeta/task",
    title: "Task",
    preview: "",
    modified: 3,
    created: 3,
  },
  {
    id: "work/alpha/plan",
    title: "Plan",
    preview: "",
    modified: 2,
    created: 2,
  },
  {
    id: "inbox",
    title: "Inbox",
    preview: "",
    modified: 1,
    created: 1,
  },
];

describe("folderTree", () => {
  it("rewrites renamed folder paths in the visible folder list without changing order", () => {
    expect(
      rewriteFolderPathList(
        ["bravo", "charlie", "charlie/nested", "delta"],
        "charlie",
        "alpha",
      ),
    ).toEqual(["bravo", "alpha", "alpha/nested", "delta"]);
  });

  it("builds an alphabetical tree in ascending order and keeps empty folders", () => {
    const tree = buildFolderTree(
      notes,
      new Set<string>(),
      ["work", "work/alpha", "work/zeta", "archive"],
      "nameAsc",
    );

    expect(tree.rootNotes.map((note) => note.id)).toEqual(["inbox"]);
    expect(tree.folders.map((folder) => folder.path)).toEqual([
      "archive",
      "work",
    ]);
    expect(tree.folders[1]?.children.map((folder) => folder.path)).toEqual([
      "work/alpha",
      "work/zeta",
    ]);
  });

  it("builds an alphabetical tree in descending order", () => {
    const tree = buildFolderTree(
      notes,
      new Set<string>(),
      ["work", "work/alpha", "work/zeta", "archive"],
      "nameDesc",
    );

    expect(tree.folders.map((folder) => folder.path)).toEqual([
      "work",
      "archive",
    ]);
    expect(tree.folders[0]?.children.map((folder) => folder.path)).toEqual([
      "work/zeta",
      "work/alpha",
    ]);
  });
});
