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

  it("surfaces the matched alias separately when the stored shortcode must fall back", () => {
    const happyMatch = searchEmojiShortcodes("happy", 20).find(
      (item) => item.matchedAlias && item.shortcode !== item.matchedAlias,
    );

    expect(happyMatch).toBeTruthy();
    expect(happyMatch?.matchedAlias).toBe("happy");
    expect(happyMatch?.shortcode).not.toBe("happy");
  });
});
