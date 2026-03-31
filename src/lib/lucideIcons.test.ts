import { describe, expect, it } from "vitest";
import { searchLucideIcons } from "./lucideIcons";

describe("lucideIcons", () => {
  it("matches multi-word icon queries", () => {
    const results = searchLucideIcons("folder open", 10).map((icon) => icon.name);
    expect(results[0]).toBe("folder-open");
    expect(results).toContain("folder-open-dot");
  });

  it("matches compact icon queries without separators", () => {
    const [firstResult] = searchLucideIcons("folderopen", 10);
    expect(firstResult?.name).toBe("folder-open");
  });

  it("falls back to fuzzy matching for small typos", () => {
    const [firstResult] = searchLucideIcons("foldr", 10);
    expect(firstResult?.name).toBe("folder");
  });
});
