import emojiCatalog from "emojilib/dist/emoji-en-US.json";
import * as nodeEmoji from "node-emoji";
import {
  buildCatalogSearchIndex,
  searchCatalog,
  type CatalogSearchMatchStrategy,
  type CatalogSearchTermInput,
  type CatalogSearchTermKind,
} from "./catalogSearch";

export interface EmojiItem {
  id: string;
  shortcode: string;
  primaryShortcode: string;
  emoji: string;
  aliases: string[];
  keywords: string[];
  matchedText?: string;
  matchedKind?: CatalogSearchTermKind;
  matchedStrategy?: CatalogSearchMatchStrategy;
}

interface EmojiCatalogEntry {
  id: string;
  emoji: string;
  primaryShortcode: string;
  aliases: string[];
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

function normalizeRequestedShortcode(value: string): string {
  return normalizeEmojiShortcode(value).replace(/\s+/g, "_");
}

function normalizeSearchValue(value: string): string {
  return normalizeRequestedShortcode(value).replace(/-/g, "_");
}

function getShortcodeAliases(shortcode: string): string[] {
  const normalized = normalizeRequestedShortcode(shortcode);
  if (!VALID_SHORTCODE_REGEX.test(normalized)) return [];

  const underscored = normalized.replace(/-/g, "_");
  const hyphenated = underscored.replace(/_/g, "-");

  return Array.from(new Set([underscored, hyphenated]));
}

function getSpacedShortcode(shortcode: string): string {
  return normalizeRequestedShortcode(shortcode).replace(/_/g, " ");
}

function getDerivedSearchTerms(
  primaryShortcode: string,
  keywords: string[],
): CatalogSearchTermInput[] {
  const derivedTerms: CatalogSearchTermInput[] = [];
  const primaryTokens = normalizeRequestedShortcode(primaryShortcode)
    .split("_")
    .filter(Boolean);

  if (primaryTokens.length === 0) {
    return derivedTerms;
  }

  const primaryHeadToken = primaryTokens[primaryTokens.length - 1];

  const singleTokenKeywords = Array.from(
    new Set(
      keywords
        .map(normalizeRequestedShortcode)
        .filter((keyword) => keyword && !keyword.includes("_")),
    ),
  );

  for (const keyword of singleTokenKeywords) {
    if (keyword === primaryHeadToken) continue;

    derivedTerms.push({
      text: `${keyword} ${primaryHeadToken}`,
      kind: "keyword",
    });
  }

  return derivedTerms;
}

function getSearchTerms(
  primaryShortcode: string,
  keywords: string[],
): CatalogSearchTermInput[] {
  const terms: CatalogSearchTermInput[] = [];

  for (const shortcode of getShortcodeAliases(primaryShortcode)) {
    terms.push({
      text: shortcode,
      kind: shortcode === primaryShortcode ? "primary" : "alias",
    });
  }

  terms.push({
    text: getSpacedShortcode(primaryShortcode),
    kind: "alias",
  });

  for (const keyword of keywords) {
    terms.push({ text: keyword, kind: "keyword" });

    for (const shortcode of getShortcodeAliases(keyword)) {
      terms.push({ text: shortcode, kind: "keyword" });
    }

    terms.push({
      text: getSpacedShortcode(keyword),
      kind: "keyword",
    });
  }

  terms.push(...getDerivedSearchTerms(primaryShortcode, keywords));

  return terms;
}

function createEmojiItem(
  entry: EmojiCatalogEntry,
  shortcode: string,
  match?: {
    text: string;
    kind: CatalogSearchTermKind;
    strategy: CatalogSearchMatchStrategy;
  },
): EmojiItem {
  return {
    id: entry.id,
    shortcode,
    primaryShortcode: entry.primaryShortcode,
    emoji: entry.emoji,
    aliases: entry.aliases,
    keywords: entry.keywords,
    ...(match
      ? {
          matchedText: match.text,
          matchedKind: match.kind,
          matchedStrategy: match.strategy,
        }
      : {}),
  };
}

function getPreferredPrimaryShortcode(
  entry: EmojiCatalogEntry,
  prefersHyphen: boolean,
): string {
  if (!prefersHyphen) return entry.primaryShortcode;

  const hyphenated = entry.primaryShortcode.replace(/_/g, "-");
  return hyphenated !== entry.primaryShortcode ? hyphenated : entry.primaryShortcode;
}

function getOwnedMatchedShortcode(
  entry: EmojiCatalogEntry,
  matchedText: string,
  prefersHyphen: boolean,
): string | null {
  const normalized = normalizeRequestedShortcode(matchedText);
  if (!VALID_SHORTCODE_REGEX.test(normalized)) return null;

  const ownedEntry = emojiEntriesByShortcode.get(normalized);
  if (ownedEntry?.id !== entry.id) return null;

  return prefersHyphen ? normalized.replace(/_/g, "-") : normalized;
}

const emojiLookup = new Map<string, string>();
const emojiEntriesByShortcode = new Map<string, EmojiCatalogEntry>();

const emojiEntries = Object.entries(rawEmojiCatalog)
  .map(([fallbackEmoji, aliases]) => {
    const normalizedAliases = Array.from(
      new Set(
        aliases.map(normalizeRequestedShortcode).filter((alias) =>
          VALID_SHORTCODE_REGEX.test(alias),
        ),
      ),
    );

    if (normalizedAliases.length === 0) return null;

    const primaryShortcode = normalizedAliases[0];

    return {
      id: `${fallbackEmoji}-${primaryShortcode}`,
      emoji: fallbackEmoji,
      primaryShortcode,
      aliases: normalizedAliases,
      keywords: normalizedAliases.filter((alias) => alias !== primaryShortcode),
    } satisfies EmojiCatalogEntry;
  })
  .filter((entry): entry is EmojiCatalogEntry => entry !== null);

for (const entry of emojiEntries) {
  for (const alias of entry.aliases) {
    for (const shortcode of getShortcodeAliases(alias)) {
      if (!emojiLookup.has(shortcode)) {
        emojiLookup.set(shortcode, entry.emoji);
        emojiEntriesByShortcode.set(shortcode, entry);
      }
    }
  }
}

const emojiCatalogItems = [...emojiEntries]
  .sort((a, b) => a.primaryShortcode.localeCompare(b.primaryShortcode))
  .map((entry) => createEmojiItem(entry, entry.primaryShortcode));

const emojiSearchIndex = buildCatalogSearchIndex(
  emojiEntries.map((entry) => ({
    item: entry,
    sortText: entry.primaryShortcode,
    terms: getSearchTerms(entry.primaryShortcode, entry.keywords),
  })),
);

export function getEmojiCatalogItems(): readonly EmojiItem[] {
  return emojiCatalogItems;
}

export function getEmojiItem(shortcode: string): EmojiItem | null {
  const normalized = normalizeRequestedShortcode(shortcode);
  const entry = emojiEntriesByShortcode.get(normalized);
  if (!entry) return null;

  return createEmojiItem(entry, normalized);
}

export function getEmojiForShortcode(shortcode: string): string | null {
  const normalized = normalizeRequestedShortcode(shortcode);
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

export function searchEmojiShortcodes(
  query: string,
  limit?: number,
): EmojiItem[] {
  const prefersHyphen = normalizeEmojiShortcode(query).includes("-");
  const normalizedQuery = normalizeSearchValue(query);

  const matches = searchCatalog(emojiSearchIndex, query).map(
    ({ item, match }, index) => {
      const matchedShortcode = getOwnedMatchedShortcode(
        item,
        match.text,
        prefersHyphen,
      );
      const displayShortcode =
        matchedShortcode ?? getPreferredPrimaryShortcode(item, prefersHyphen);

      return {
        index,
        item: createEmojiItem(item, displayShortcode, {
          text: match.text,
          kind: match.kind,
          strategy: match.strategy,
        }),
      };
    },
  );

  matches.sort((left, right) => {
    const leftExactDisplay =
      normalizeSearchValue(left.item.shortcode) === normalizedQuery ? 0 : 1;
    const rightExactDisplay =
      normalizeSearchValue(right.item.shortcode) === normalizedQuery ? 0 : 1;

    if (leftExactDisplay !== rightExactDisplay) {
      return leftExactDisplay - rightExactDisplay;
    }

    return left.index - right.index;
  });

  const items = matches.map(({ item }) => item);
  return typeof limit === "number" ? items.slice(0, limit) : items;
}
