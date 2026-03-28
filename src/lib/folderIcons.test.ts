import { describe, expect, it } from "vitest";
import {
  removeFolderAppearancePaths,
  rewriteFolderAppearancePaths,
  sanitizeFolderAppearances,
} from "./folderIcons";

describe("folderIcons helpers", () => {
  it("normalizes legacy lucide strings and emoji appearances", () => {
    expect(
      sanitizeFolderAppearances({
        docs: "folder-open-dot",
        journal: {
          icon: { kind: "emoji", shortcode: "book" },
          colorId: "blue",
        },
        empty: "   ",
      }),
    ).toEqual({
      docs: {
        icon: { kind: "lucide", name: "folder-open-dot" },
      },
      journal: {
        icon: { kind: "emoji", shortcode: "book" },
        colorId: "blue",
      },
    });
  });

  it("rewrites nested folder paths without dropping color or emoji data", () => {
    expect(
      rewriteFolderAppearancePaths(
        {
          docs: {
            icon: { kind: "lucide", name: "folder-open" },
            colorId: "olive",
          },
          "docs/ideas": {
            icon: { kind: "emoji", shortcode: "bulb" },
            colorId: "amber",
          },
        },
        "docs",
        "work",
      ),
    ).toEqual({
      work: {
        icon: { kind: "lucide", name: "folder-open" },
        colorId: "olive",
      },
      "work/ideas": {
        icon: { kind: "emoji", shortcode: "bulb" },
        colorId: "amber",
      },
    });
  });

  it("removes a folder path and all descendants", () => {
    expect(
      removeFolderAppearancePaths(
        {
          docs: {
            icon: { kind: "lucide", name: "folder" },
          },
          "docs/ideas": {
            icon: { kind: "emoji", shortcode: "book" },
            colorId: "blue",
          },
          journal: {
            icon: { kind: "emoji", shortcode: "memo" },
          },
        },
        "docs",
      ),
    ).toEqual({
      journal: {
        icon: { kind: "emoji", shortcode: "memo" },
      },
    });
  });
});
