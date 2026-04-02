import { describe, expect, it } from "vitest";
import {
  deriveNoteTitleFromMarkdown,
  isDefaultPlaceholderNoteId,
  isDefaultPlaceholderTitle,
  sanitizeNoteFilename,
} from "./noteIdentity";

describe("noteIdentity", () => {
  it("derives the title from the first h1 after frontmatter", () => {
    expect(
      deriveNoteTitleFromMarkdown("---\nlayout: note\n---\n# Hello\n\nBody"),
    ).toBe("Hello");
  });

  it("falls back to the first non-empty line when no h1 exists", () => {
    expect(deriveNoteTitleFromMarkdown("\n\nHello world\nBody")).toBe(
      "Hello world",
    );
  });

  it("sanitizes filenames using the backend-compatible rules", () => {
    expect(sanitizeNoteFilename('  My:/Note  ')).toBe("My--Note");
    expect(sanitizeNoteFilename(" \u00A0\uFEFF ")).toBe("Untitled");
  });

  it("recognizes only the default untitled placeholder names", () => {
    expect(isDefaultPlaceholderNoteId("Untitled")).toBe(true);
    expect(isDefaultPlaceholderNoteId("journal/Untitled-2")).toBe(true);
    expect(isDefaultPlaceholderNoteId("Daily")).toBe(false);
    expect(isDefaultPlaceholderTitle("Untitled")).toBe(true);
    expect(isDefaultPlaceholderTitle("Untitled 2")).toBe(true);
    expect(isDefaultPlaceholderTitle("Untitled Copy")).toBe(false);
  });
});
