import { describe, expect, it } from "vitest";
import { LUCIDE_ICON_CATALOG, searchLucideIcons } from "./lucideIcons";

describe("lucideIcons", () => {
  it("matches multi-word icon queries", () => {
    const results = searchLucideIcons("folder open", 10).map((icon) => icon.name);
    expect(results[0]).toBe("folder-open");
    expect(results).toContain("folder-open-dot");
  });

  it("shows one catalog item for each unique Lucide component", () => {
    const names = LUCIDE_ICON_CATALOG.map((icon) => icon.name);

    expect(names).toContain("circle-alert");
    expect(names).not.toContain("alert-circle");
    expect(names).not.toContain("lucide-circle-alert");
  });

  it("keeps old and prefixed Lucide aliases searchable", () => {
    expect(searchLucideIcons("alert-circle", 1)[0]?.name).toBe("circle-alert");
    expect(searchLucideIcons("lucide-alert-circle", 1)[0]?.name).toBe(
      "circle-alert",
    );
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
