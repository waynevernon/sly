import emojiCatalog from "emojilib/dist/emoji-en-US.json";
import * as nodeEmoji from "node-emoji";

export interface EmojiItem {
  id: string;
  shortcode: string;
  primaryShortcode: string;
  emoji: string;
  aliases: string[];
  keywords: string[];
  matchedAlias?: string;
}

interface EmojiCatalogEntry {
  id: string;
  emoji: string;
  primaryShortcode: string;
  aliases: string[];
  keywords: string[];
}

interface EmojiMatchCandidate {
  alias: string;
  score: number;
  owned: boolean;
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

function createEmojiItem(
  entry: EmojiCatalogEntry,
  shortcode: string,
  matchedAlias?: string,
): EmojiItem {
  return {
    id: entry.id,
    shortcode,
    primaryShortcode: entry.primaryShortcode,
    emoji: entry.emoji,
    aliases: entry.aliases,
    keywords: entry.keywords,
    ...(matchedAlias ? { matchedAlias } : {}),
  };
}

function getSearchScore(alias: string, query: string): number | null {
  const normalizedAlias = normalizeSearchValue(alias);

  if (normalizedAlias === query) return 0;
  if (normalizedAlias.startsWith(query)) return 1;
  if (normalizedAlias.includes(query)) return 2;
  return null;
}

function isPreferredAliasFormat(alias: string, prefersHyphen: boolean): boolean {
  return prefersHyphen ? alias.includes("-") : !alias.includes("-");
}

function compareCandidates(
  a: EmojiMatchCandidate,
  b: EmojiMatchCandidate,
  prefersHyphen: boolean,
): number {
  if (a.score !== b.score) return a.score - b.score;
  if (a.alias.length !== b.alias.length) return a.alias.length - b.alias.length;

  const aPreferred = isPreferredAliasFormat(a.alias, prefersHyphen) ? 0 : 1;
  const bPreferred = isPreferredAliasFormat(b.alias, prefersHyphen) ? 0 : 1;
  if (aPreferred !== bPreferred) return aPreferred - bPreferred;

  if (a.owned !== b.owned) return a.owned ? -1 : 1;

  return a.alias.localeCompare(b.alias);
}

function getCandidateAliases(entry: EmojiCatalogEntry): EmojiMatchCandidate[] {
  const seen = new Set<string>();
  const candidates: EmojiMatchCandidate[] = [];

  for (const alias of entry.aliases) {
    for (const candidate of getShortcodeAliases(alias)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      candidates.push({
        alias: candidate,
        score: Number.POSITIVE_INFINITY,
        owned: emojiEntriesByShortcode.get(candidate)?.id === entry.id,
      });
    }
  }

  return candidates;
}

function findBestMatch(
  entry: EmojiCatalogEntry,
  normalizedQuery: string,
  prefersHyphen: boolean,
): EmojiMatchCandidate | null {
  let bestMatch: EmojiMatchCandidate | null = null;

  for (const candidate of getCandidateAliases(entry)) {
    const score = getSearchScore(candidate.alias, normalizedQuery);
    if (score === null) continue;

    const nextCandidate = { ...candidate, score };
    if (
      bestMatch === null ||
      compareCandidates(nextCandidate, bestMatch, prefersHyphen) < 0
    ) {
      bestMatch = nextCandidate;
    }
  }

  return bestMatch;
}

function getPreferredPrimaryShortcode(
  entry: EmojiCatalogEntry,
  prefersHyphen: boolean,
): string {
  if (!prefersHyphen) return entry.primaryShortcode;

  const hyphenated = entry.primaryShortcode.replace(/_/g, "-");
  return hyphenated !== entry.primaryShortcode ? hyphenated : entry.primaryShortcode;
}

const emojiLookup = new Map<string, string>();
const emojiEntriesByShortcode = new Map<string, EmojiCatalogEntry>();

const emojiEntries = Object.entries(rawEmojiCatalog)
  .map(([fallbackEmoji, aliases]) => {
    const normalizedAliases = Array.from(
      new Set(
        aliases.map(normalizeSearchValue).filter((alias) =>
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
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return [];

  const prefersHyphen = normalizeEmojiShortcode(query).includes("-");

  const matches = emojiEntries
    .map((entry) => {
      const bestMatch = findBestMatch(entry, normalizedQuery, prefersHyphen);
      if (!bestMatch) return null;

      const chosenShortcode = bestMatch.owned
        ? bestMatch.alias
        : getPreferredPrimaryShortcode(entry, prefersHyphen);

      return {
        item: createEmojiItem(
          entry,
          chosenShortcode,
          bestMatch.alias !== chosenShortcode ? bestMatch.alias : undefined,
        ),
        match: bestMatch,
      };
    })
    .filter(
      (
        entry,
      ): entry is { item: EmojiItem; match: EmojiMatchCandidate } =>
        entry !== null,
    )
    .sort((a, b) => {
      const candidateOrder = compareCandidates(
        a.match,
        b.match,
        prefersHyphen,
      );
      if (candidateOrder !== 0) return candidateOrder;

      if (a.item.shortcode.length !== b.item.shortcode.length) {
        return a.item.shortcode.length - b.item.shortcode.length;
      }

      return a.item.shortcode.localeCompare(b.item.shortcode);
    })
    .map((entry) => entry.item);

  return typeof limit === "number" ? matches.slice(0, limit) : matches;
}
