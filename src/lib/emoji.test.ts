import emojiCatalog from "emojilib/dist/emoji-en-US.json";
import { describe, expect, it } from "vitest";
import {
  getEmojiCatalogItems,
  getEmojiForShortcode,
  isEmojiShortcode,
  searchEmojiShortcodes,
} from "./emoji";

describe("emoji", () => {
  it("returns one catalog item per emoji entry", () => {
    expect(getEmojiCatalogItems()).toHaveLength(Object.keys(emojiCatalog).length);
    expect(
      new Set(getEmojiCatalogItems().map((item) => item.emoji)).size,
    ).toBe(getEmojiCatalogItems().length);
  });

  it("dedupes alias-heavy search results down to one item per emoji", () => {
    for (const query of ["smile", "happy", "joy", "book"]) {
      const results = searchEmojiShortcodes(query, 40);
      expect(new Set(results.map((item) => item.id)).size).toBe(results.length);
      expect(new Set(results.map((item) => item.emoji)).size).toBe(results.length);
    }
  });

  it("keeps exact alias matches ahead of broader keyword matches", () => {
    const [firstResult] = searchEmojiShortcodes("book", 10);
    expect(firstResult?.shortcode).toBe("book");
  });

  it("matches multi-word searches across emoji keywords", () => {
    const [firstResult] = searchEmojiShortcodes("red flag", 10);
    expect(firstResult).toMatchObject({
      emoji: "🚩",
      primaryShortcode: "triangular_flag",
    });
  });

  it("keeps non-country flag emoji in the top limited results for generic flag searches", () => {
    const topFlagResults = searchEmojiShortcodes("flag", 10);
    const triangularFlagIndex = topFlagResults.findIndex(
      (item) => item.emoji === "🚩",
    );
    const canadaFlagIndex = topFlagResults.findIndex(
      (item) => item.primaryShortcode === "flag_canada",
    );

    expect(topFlagResults).toHaveLength(10);
    expect(triangularFlagIndex).toBeGreaterThanOrEqual(0);
    if (canadaFlagIndex >= 0) {
      expect(triangularFlagIndex).toBeLessThan(canadaFlagIndex);
    }
  });

  it("prefers hyphenated aliases when the query uses hyphens", () => {
    const [firstResult] = searchEmojiShortcodes("open-book", 1);
    expect(firstResult).toMatchObject({
      shortcode: "open-book",
      primaryShortcode: "open_book",
    });
  });

  it("continues resolving legacy underscore and hyphen aliases", () => {
    expect(isEmojiShortcode("open_book")).toBe(true);
    expect(isEmojiShortcode("open-book")).toBe(true);
    expect(getEmojiForShortcode("open_book")).toBe(getEmojiForShortcode("open-book"));
  });

  it("surfaces generic match metadata when a keyword drives the result", () => {
    const happyMatch = searchEmojiShortcodes("happy", 20).find(
      (item) =>
        item.matchedText &&
        item.shortcode !== item.matchedText &&
        item.matchedKind === "keyword",
    );

    expect(happyMatch).toBeTruthy();
    expect(happyMatch?.matchedText).toBe("happy");
    expect(happyMatch?.matchedStrategy).toBe("exact");
    expect(happyMatch?.shortcode).not.toBe("happy");
  });

  it("keeps open-book discoverable with spaced queries", () => {
    const [firstResult] = searchEmojiShortcodes("open book", 10);
    expect(firstResult).toMatchObject({
      primaryShortcode: "open_book",
    });
  });

  it("matches compact emoji shortcode queries without separators", () => {
    const compactQueryMatch = searchEmojiShortcodes("orangecircle", 20).find(
      (item) => item.primaryShortcode === "orange_circle",
    );

    expect(compactQueryMatch).toBeTruthy();
  });

  it("matches compact synthetic keyword-plus-primary queries without adding aliases", () => {
    const redFlagResults = searchEmojiShortcodes("redflag", 10);

    expect(redFlagResults[0]).toMatchObject({
      primaryShortcode: "triangular_flag",
    });
  });
});
