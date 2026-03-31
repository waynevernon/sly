import { describe, expect, it } from "vitest";
import {
  buildCatalogSearchIndex,
  normalizeCatalogSearchText,
  searchCatalog,
} from "./catalogSearch";

describe("catalogSearch", () => {
  const index = buildCatalogSearchIndex([
    {
      item: { id: "triangular-flag" },
      sortText: "triangular-flag",
      terms: [
        { text: "triangular_flag", kind: "primary" },
        { text: "triangular flag", kind: "alias" },
        { text: "flag", kind: "keyword" },
        { text: "red", kind: "keyword" },
      ],
    },
    {
      item: { id: "flag-canada" },
      sortText: "flag-canada",
      terms: [
        { text: "flag_canada", kind: "primary" },
        { text: "flag canada", kind: "alias" },
        { text: "flag", kind: "keyword" },
        { text: "canada", kind: "keyword" },
      ],
    },
    {
      item: { id: "folder-open" },
      sortText: "folder-open",
      terms: [
        { text: "folder-open", kind: "primary" },
        { text: "folder open", kind: "alias" },
      ],
    },
  ]);

  it("normalizes spaces, hyphens, underscores, and punctuation into one query form", () => {
    expect(normalizeCatalogSearchText("  red_flag  ")).toBe("red flag");
    expect(normalizeCatalogSearchText("folder-open")).toBe("folder open");
    expect(normalizeCatalogSearchText("folder/open")).toBe("folder open");
  });

  it("matches compact queries against terms that were indexed with separators", () => {
    const [firstResult] = searchCatalog(index, "folderopen");
    expect(firstResult?.item.id).toBe("folder-open");
  });

  it("matches all query tokens across indexed terms", () => {
    const [firstResult] = searchCatalog(index, "red flag");
    expect(firstResult?.item.id).toBe("triangular-flag");
  });

  it("prefers suffix-style exact token matches over prefixed family labels", () => {
    const results = searchCatalog(index, "flag").map(({ item }) => item.id);
    expect(results.indexOf("triangular-flag")).toBeLessThan(
      results.indexOf("flag-canada"),
    );
  });

  it("falls back to fuzzy matching for small typos", () => {
    const [firstResult] = searchCatalog(index, "foldr");
    expect(firstResult?.item.id).toBe("folder-open");
    expect(firstResult?.match.strategy).toBe("fuzzy");
  });
});
