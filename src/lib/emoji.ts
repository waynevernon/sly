import emojiCatalog from "emojilib/dist/emoji-en-US.json";
import * as nodeEmoji from "node-emoji";

export interface EmojiItem {
  shortcode: string;
  emoji: string;
  keywords: string[];
}

const rawEmojiCatalog = emojiCatalog as Record<string, string[]>;

const SHORTCODE_LOOKUP_REGEX = /:([+\-\w]+):/g;
const VALID_SHORTCODE_REGEX = /^[+\-\w]+$/;

export function normalizeEmojiShortcode(value: string): string {
  return value.trim().replace(/^:/, "").replace(/:$/, "").toLowerCase();
}

function resolveEmojiForShortcode(
  shortcode: string,
  fallbackEmoji: string | null = null,
): string | null {
  return nodeEmoji.get(shortcode) ?? fallbackEmoji;
}

function normalizeSearchValue(value: string): string {
  return normalizeEmojiShortcode(value).replace(/[\s-]+/g, "_");
}

function getShortcodeAliases(shortcode: string): string[] {
  const normalized = normalizeSearchValue(shortcode);
  if (!VALID_SHORTCODE_REGEX.test(normalized)) return [];

  return Array.from(new Set([normalized, normalized.replace(/_/g, "-")]));
}

const emojiLookup = new Map<string, string>();
const emojiItemsByShortcode = new Map<string, EmojiItem>();

for (const [emoji, aliases] of Object.entries(rawEmojiCatalog)) {
  const normalizedSearchTerms = Array.from(
    new Set(aliases.map(normalizeSearchValue)),
  );

  for (const alias of aliases) {
    for (const shortcode of getShortcodeAliases(alias)) {
      if (!emojiLookup.has(shortcode)) {
        emojiLookup.set(shortcode, emoji);
      }
      if (!emojiItemsByShortcode.has(shortcode)) {
        emojiItemsByShortcode.set(shortcode, {
          shortcode,
          emoji: resolveEmojiForShortcode(shortcode, emoji) ?? emoji,
          keywords: normalizedSearchTerms.filter((term) => term !== shortcode),
        });
      }
    }
  }
}

const emojiItems = Array.from(emojiItemsByShortcode.values());

export function getEmojiItem(shortcode: string): EmojiItem | null {
  return emojiItemsByShortcode.get(normalizeSearchValue(shortcode)) ?? null;
}

export function getEmojiForShortcode(shortcode: string): string | null {
  const normalized = normalizeSearchValue(shortcode);
  return resolveEmojiForShortcode(normalized, emojiLookup.get(normalized) ?? null);
}

export function isEmojiShortcode(shortcode: string): boolean {
  return getEmojiItem(shortcode) !== null;
}

export function emojifyShortcodes(text: string): string {
  return text.replace(SHORTCODE_LOOKUP_REGEX, (fullMatch, shortcode) => {
    return getEmojiForShortcode(shortcode) ?? fullMatch;
  });
}

function getSearchScore(item: EmojiItem, query: string): number | null {
  const normalizedShortcode = normalizeSearchValue(item.shortcode);
  const normalizedKeywords = item.keywords.map(normalizeSearchValue);

  if (normalizedShortcode === query) return 0;
  if (normalizedKeywords.includes(query)) return 1;
  if (normalizedShortcode.startsWith(query)) return 2;
  if (normalizedKeywords.some((keyword) => keyword.startsWith(query))) return 3;
  if (normalizedShortcode.includes(query)) return 4;
  if (normalizedKeywords.some((keyword) => keyword.includes(query))) return 5;
  return null;
}

export function searchEmojiShortcodes(
  query: string,
  limit = 10,
): EmojiItem[] {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return [];

  return emojiItems
    .map((item) => ({
      item,
      score: getSearchScore(item, normalizedQuery),
    }))
    .filter(
      (entry): entry is { item: EmojiItem; score: number } =>
        entry.score !== null,
    )
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.item.shortcode.length !== b.item.shortcode.length) {
        return a.item.shortcode.length - b.item.shortcode.length;
      }
      return a.item.shortcode.localeCompare(b.item.shortcode);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}
