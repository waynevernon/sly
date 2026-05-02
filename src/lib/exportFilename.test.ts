import { describe, expect, it } from "vitest";
import { sanitizeMarkdownExportFilename } from "./exportFilename";

describe("sanitizeMarkdownExportFilename", () => {
  it("replaces unsafe export filename characters", () => {
    expect(sanitizeMarkdownExportFilename("  My:/Note?  ")).toBe("My--Note-");
  });

  it("falls back when the title has no usable filename characters", () => {
    expect(sanitizeMarkdownExportFilename(" \u00A0\uFEFF ")).toBe("note");
  });
});
