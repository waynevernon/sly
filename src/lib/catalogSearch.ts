export type CatalogSearchTermKind = "primary" | "alias" | "keyword";

export type CatalogSearchMatchStrategy =
  | "exact"
  | "prefix"
  | "substring"
  | "fuzzy";

export interface CatalogSearchTermInput {
  text: string;
  kind: CatalogSearchTermKind;
}

export interface CatalogSearchItemInput<T> {
  item: T;
  terms: CatalogSearchTermInput[];
  sortText: string;
}

export interface CatalogSearchMatch {
  text: string;
  kind: CatalogSearchTermKind;
  strategy: CatalogSearchMatchStrategy;
  isFuzzy: boolean;
}

export interface CatalogSearchResult<T> {
  item: T;
  match: CatalogSearchMatch;
}

interface PreparedSearchTerm {
  text: string;
  kind: CatalogSearchTermKind;
  normalized: string;
  tokens: string[];
  isCompactVariant: boolean;
}

interface PreparedSearchEntry<T> {
  item: T;
  terms: PreparedSearchTerm[];
  primaryTerm: PreparedSearchTerm;
  sortText: string;
}

export type CatalogSearchIndex<T> = PreparedSearchEntry<T>[];

interface PreparedSearchQuery {
  normalized: string;
  tokens: string[];
}

interface TokenMatch {
  term: PreparedSearchTerm;
  strategyRank: number;
  fuzzyScore: number;
  matchedTokenIndex: number;
}

interface StrongEntryMatch {
  phase: "strong";
  exactPhrase: boolean;
  worstStrategyRank: number;
  totalStrategyRank: number;
  bestSameTermCoverage: number;
  bestMatch: TokenMatch;
  tokenMatches: TokenMatch[];
}

interface FuzzyEntryMatch {
  phase: "fuzzy";
  fuzzyCount: number;
  totalFuzzyScore: number;
  totalStrategyRank: number;
  bestSameTermCoverage: number;
  bestMatch: TokenMatch;
  tokenMatches: TokenMatch[];
}

type EntryMatch = StrongEntryMatch | FuzzyEntryMatch;

const TERM_KIND_PRIORITY: Record<CatalogSearchTermKind, number> = {
  primary: 0,
  alias: 1,
  keyword: 2,
};

const STRONG_STRATEGY_PRIORITY: Record<
  Exclude<CatalogSearchMatchStrategy, "fuzzy">,
  number
> = {
  exact: 0,
  prefix: 1,
  substring: 2,
};

function compareNumbers(a: number, b: number): number {
  return a - b;
}

export function normalizeCatalogSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prepareQuery(value: string): PreparedSearchQuery | null {
  const normalized = normalizeCatalogSearchText(value);
  if (!normalized) return null;

  return {
    normalized,
    tokens: normalized.split(" ").filter(Boolean),
  };
}

function prepareTerms(terms: CatalogSearchTermInput[]): PreparedSearchTerm[] {
  const preparedTermsByNormalized = new Map<string, PreparedSearchTerm>();

  for (const term of terms) {
    const normalized = normalizeCatalogSearchText(term.text);
    if (!normalized) continue;

    const variants = [normalized];
    const tokens = normalized.split(" ").filter(Boolean);
    if (tokens.length > 1) {
      variants.push(tokens.join(""));
    }

    for (const normalizedVariant of variants) {
      const candidate: PreparedSearchTerm = {
        text: term.text,
        kind: term.kind,
        normalized: normalizedVariant,
        tokens:
          normalizedVariant === normalized
            ? tokens
            : [normalizedVariant],
        isCompactVariant: normalizedVariant !== normalized,
      };

      const current = preparedTermsByNormalized.get(normalizedVariant);
      if (!current) {
        preparedTermsByNormalized.set(normalizedVariant, candidate);
        continue;
      }

      const currentKindPriority = TERM_KIND_PRIORITY[current.kind];
      const nextKindPriority = TERM_KIND_PRIORITY[candidate.kind];

      if (
        nextKindPriority < currentKindPriority ||
        (nextKindPriority === currentKindPriority &&
          candidate.text.length < current.text.length)
      ) {
        preparedTermsByNormalized.set(normalizedVariant, candidate);
      }
    }
  }

  return Array.from(preparedTermsByNormalized.values()).sort((left, right) => {
    const kindOrder = compareNumbers(
      TERM_KIND_PRIORITY[left.kind],
      TERM_KIND_PRIORITY[right.kind],
    );
    if (kindOrder !== 0) return kindOrder;

    if (left.tokens.length !== right.tokens.length) {
      return left.tokens.length - right.tokens.length;
    }

    if (left.normalized.length !== right.normalized.length) {
      return left.normalized.length - right.normalized.length;
    }

    return left.normalized.localeCompare(right.normalized);
  });
}

function buildEntry<T>(input: CatalogSearchItemInput<T>): PreparedSearchEntry<T> | null {
  const terms = prepareTerms(input.terms);
  if (terms.length === 0) return null;

  return {
    item: input.item,
    terms,
    primaryTerm:
      terms.find((term) => term.kind === "primary" && !term.isCompactVariant) ??
      terms.find((term) => term.kind === "primary") ??
      terms[0],
    sortText: input.sortText,
  };
}

function boundedLevenshtein(
  source: string,
  target: string,
  maxDistance: number,
): number | null {
  const sourceLength = source.length;
  const targetLength = target.length;

  if (Math.abs(sourceLength - targetLength) > maxDistance) {
    return null;
  }

  if (sourceLength === 0) {
    return targetLength <= maxDistance ? targetLength : null;
  }

  if (targetLength === 0) {
    return sourceLength <= maxDistance ? sourceLength : null;
  }

  const previous = Array.from({ length: targetLength + 1 }, (_, index) => index);
  const current = new Array<number>(targetLength + 1);

  for (let row = 1; row <= sourceLength; row += 1) {
    current[0] = row;
    let rowMinimum = current[0];

    for (let column = 1; column <= targetLength; column += 1) {
      const substitutionCost =
        source[row - 1] === target[column - 1] ? 0 : 1;

      const nextValue = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitutionCost,
      );

      current[column] = nextValue;
      rowMinimum = Math.min(rowMinimum, nextValue);
    }

    if (rowMinimum > maxDistance) {
      return null;
    }

    for (let column = 0; column <= targetLength; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[targetLength] <= maxDistance ? previous[targetLength] : null;
}

function isSubsequence(query: string, candidate: string): number | null {
  let queryIndex = 0;
  let candidateIndex = 0;
  let gaps = 0;

  while (queryIndex < query.length && candidateIndex < candidate.length) {
    if (query[queryIndex] === candidate[candidateIndex]) {
      queryIndex += 1;
    } else {
      gaps += 1;
    }
    candidateIndex += 1;
  }

  if (queryIndex !== query.length) return null;

  gaps += candidate.length - candidateIndex;
  return gaps;
}

function getStrongTokenMatchRank(
  queryToken: string,
  candidateToken: string,
): number | null {
  if (candidateToken === queryToken) {
    return STRONG_STRATEGY_PRIORITY.exact;
  }

  if (candidateToken.startsWith(queryToken)) {
    return STRONG_STRATEGY_PRIORITY.prefix;
  }

  if (candidateToken.includes(queryToken)) {
    return STRONG_STRATEGY_PRIORITY.substring;
  }

  return null;
}

function getFuzzyTokenScore(
  queryToken: string,
  candidateToken: string,
): number | null {
  if (queryToken.length < 3 || candidateToken.length < 3) {
    return null;
  }

  const maxDistance = queryToken.length <= 4 ? 1 : 2;
  const distance = boundedLevenshtein(queryToken, candidateToken, maxDistance);
  if (distance !== null) {
    return distance * 10 + Math.abs(candidateToken.length - queryToken.length);
  }

  const gaps = isSubsequence(queryToken, candidateToken);
  if (gaps !== null) {
    return 40 + gaps + Math.abs(candidateToken.length - queryToken.length);
  }

  return null;
}

function compareTokenMatches(
  query: PreparedSearchQuery,
  left: TokenMatch,
  right: TokenMatch,
): number {
  const strategyOrder = compareNumbers(left.strategyRank, right.strategyRank);
  if (strategyOrder !== 0) return strategyOrder;

  const fuzzyOrder = compareNumbers(left.fuzzyScore, right.fuzzyScore);
  if (fuzzyOrder !== 0) return fuzzyOrder;

  const kindOrder = compareNumbers(
    TERM_KIND_PRIORITY[left.term.kind],
    TERM_KIND_PRIORITY[right.term.kind],
  );
  if (kindOrder !== 0) return kindOrder;

  const compactOrder = compareNumbers(
    left.term.isCompactVariant ? 1 : 0,
    right.term.isCompactVariant ? 1 : 0,
  );
  if (compactOrder !== 0) return compactOrder;

  if (query.tokens.length === 1) {
    const leftFamilyPenalty =
      left.strategyRank === STRONG_STRATEGY_PRIORITY.exact &&
      left.term.tokens.length > 1 &&
      left.matchedTokenIndex === 0
        ? 1
        : 0;
    const rightFamilyPenalty =
      right.strategyRank === STRONG_STRATEGY_PRIORITY.exact &&
      right.term.tokens.length > 1 &&
      right.matchedTokenIndex === 0
        ? 1
        : 0;

    const familyOrder = compareNumbers(leftFamilyPenalty, rightFamilyPenalty);
    if (familyOrder !== 0) return familyOrder;
  }

  if (left.term.tokens.length !== right.term.tokens.length) {
    return left.term.tokens.length - right.term.tokens.length;
  }

  if (left.term.normalized.length !== right.term.normalized.length) {
    return left.term.normalized.length - right.term.normalized.length;
  }

  return left.term.normalized.localeCompare(right.term.normalized);
}

function getPrimaryTermRank(
  query: PreparedSearchQuery,
  primaryTerm: PreparedSearchTerm,
): [number, number, number, number] {
  let matchedCount = 0;
  let worstStrategy = 3;
  let familyPenalty = 0;

  for (const token of query.tokens) {
    let bestRank: number | null = null;
    let bestIndex = Number.POSITIVE_INFINITY;

    for (let index = 0; index < primaryTerm.tokens.length; index += 1) {
      const candidateRank = getStrongTokenMatchRank(token, primaryTerm.tokens[index]);
      if (candidateRank === null) continue;

      if (
        bestRank === null ||
        candidateRank < bestRank ||
        (candidateRank === bestRank && index < bestIndex)
      ) {
        bestRank = candidateRank;
        bestIndex = index;
      }
    }

    if (bestRank === null) continue;

    matchedCount += 1;
    worstStrategy = Math.max(worstStrategy, bestRank);

    if (
      (query.tokens.length === 1 || matchedCount < query.tokens.length) &&
      bestRank === STRONG_STRATEGY_PRIORITY.exact &&
      primaryTerm.tokens.length > 1 &&
      bestIndex === 0
    ) {
      familyPenalty += 1;
    }
  }

  return [
    query.tokens.length - matchedCount,
    worstStrategy,
    familyPenalty,
    primaryTerm.tokens.length,
  ];
}

function countSameTermCoverage(tokenMatches: TokenMatch[]): number {
  const coverageByTerm = new Map<string, number>();

  for (const tokenMatch of tokenMatches) {
    const termKey = `${tokenMatch.term.kind}:${tokenMatch.term.normalized}`;
    coverageByTerm.set(termKey, (coverageByTerm.get(termKey) ?? 0) + 1);
  }

  let bestCoverage = 0;
  for (const coverage of coverageByTerm.values()) {
    bestCoverage = Math.max(bestCoverage, coverage);
  }

  return bestCoverage;
}

function getBestTokenMatch(
  entry: PreparedSearchEntry<unknown>,
  query: PreparedSearchQuery,
  queryToken: string,
  allowFuzzy: boolean,
): TokenMatch | null {
  let bestMatch: TokenMatch | null = null;

  for (const term of entry.terms) {
    for (let index = 0; index < term.tokens.length; index += 1) {
      const candidateToken = term.tokens[index];
      const strongRank = getStrongTokenMatchRank(queryToken, candidateToken);

      if (strongRank !== null) {
        const candidateMatch: TokenMatch = {
          term,
          strategyRank: strongRank,
          fuzzyScore: 0,
          matchedTokenIndex: index,
        };

        if (
          bestMatch === null ||
          compareTokenMatches(query, candidateMatch, bestMatch) < 0
        ) {
          bestMatch = candidateMatch;
        }
        continue;
      }

      if (!allowFuzzy) continue;

      const fuzzyScore = getFuzzyTokenScore(queryToken, candidateToken);
      if (fuzzyScore === null) continue;

      const candidateMatch: TokenMatch = {
        term,
        strategyRank: 3,
        fuzzyScore,
        matchedTokenIndex: index,
      };

      if (
        bestMatch === null ||
        compareTokenMatches(query, candidateMatch, bestMatch) < 0
      ) {
        bestMatch = candidateMatch;
      }
    }
  }

  return bestMatch;
}

function getExactPhraseMatch(
  entry: PreparedSearchEntry<unknown>,
  query: PreparedSearchQuery,
): PreparedSearchTerm | null {
  let bestMatch: PreparedSearchTerm | null = null;

  for (const term of entry.terms) {
    if (term.normalized !== query.normalized) continue;

    if (
      bestMatch === null ||
      TERM_KIND_PRIORITY[term.kind] < TERM_KIND_PRIORITY[bestMatch.kind] ||
      (TERM_KIND_PRIORITY[term.kind] === TERM_KIND_PRIORITY[bestMatch.kind] &&
        term.tokens.length < bestMatch.tokens.length)
    ) {
      bestMatch = term;
    }
  }

  return bestMatch;
}

function getEntryMatch(
  entry: PreparedSearchEntry<unknown>,
  query: PreparedSearchQuery,
): EntryMatch | null {
  const exactPhraseMatch = getExactPhraseMatch(entry, query);
  const strongTokenMatches = query.tokens
    .map((token) => getBestTokenMatch(entry, query, token, false))
    .filter((tokenMatch): tokenMatch is TokenMatch => tokenMatch !== null);

  if (exactPhraseMatch !== null || strongTokenMatches.length === query.tokens.length) {
    const bestMatch =
      exactPhraseMatch !== null
        ? {
            term: exactPhraseMatch,
            strategyRank: STRONG_STRATEGY_PRIORITY.exact,
            fuzzyScore: 0,
            matchedTokenIndex: 0,
          }
        : [...strongTokenMatches].sort((left, right) =>
            compareTokenMatches(query, left, right),
          )[0];

    const tokenMatches =
      exactPhraseMatch !== null && strongTokenMatches.length === 0
        ? [bestMatch]
        : strongTokenMatches;

    return {
      phase: "strong",
      exactPhrase: exactPhraseMatch !== null,
      worstStrategyRank:
        exactPhraseMatch !== null
          ? STRONG_STRATEGY_PRIORITY.exact
          : Math.max(...strongTokenMatches.map((match) => match.strategyRank)),
      totalStrategyRank: strongTokenMatches.reduce(
        (sum, match) => sum + match.strategyRank,
        0,
      ),
      bestSameTermCoverage: countSameTermCoverage(tokenMatches),
      bestMatch,
      tokenMatches,
    };
  }

  const fuzzyTokenMatches = query.tokens
    .map((token) => getBestTokenMatch(entry, query, token, true))
    .filter((tokenMatch): tokenMatch is TokenMatch => tokenMatch !== null);

  if (fuzzyTokenMatches.length !== query.tokens.length) {
    return null;
  }

  const fuzzyCount = fuzzyTokenMatches.filter(
    (match) => match.strategyRank === 3,
  ).length;
  if (fuzzyCount === 0) {
    return null;
  }

  return {
    phase: "fuzzy",
    fuzzyCount,
    totalFuzzyScore: fuzzyTokenMatches.reduce(
      (sum, match) => sum + match.fuzzyScore,
      0,
    ),
    totalStrategyRank: fuzzyTokenMatches.reduce(
      (sum, match) => sum + match.strategyRank,
      0,
    ),
    bestSameTermCoverage: countSameTermCoverage(fuzzyTokenMatches),
    bestMatch: [...fuzzyTokenMatches].sort((left, right) =>
      compareTokenMatches(query, left, right),
    )[0],
    tokenMatches: fuzzyTokenMatches,
  };
}

function compareStrongEntryMatches(
  query: PreparedSearchQuery,
  leftEntry: PreparedSearchEntry<unknown>,
  leftMatch: StrongEntryMatch,
  rightEntry: PreparedSearchEntry<unknown>,
  rightMatch: StrongEntryMatch,
): number {
  const exactOrder = compareNumbers(
    leftMatch.exactPhrase ? 0 : 1,
    rightMatch.exactPhrase ? 0 : 1,
  );
  if (exactOrder !== 0) return exactOrder;

  const worstStrategyOrder = compareNumbers(
    leftMatch.worstStrategyRank,
    rightMatch.worstStrategyRank,
  );
  if (worstStrategyOrder !== 0) return worstStrategyOrder;

  const bestCoverageOrder = compareNumbers(
    rightMatch.bestSameTermCoverage,
    leftMatch.bestSameTermCoverage,
  );
  if (bestCoverageOrder !== 0) return bestCoverageOrder;

  const primaryRankOrder = compareTuple(
    getPrimaryTermRank(query, leftEntry.primaryTerm),
    getPrimaryTermRank(query, rightEntry.primaryTerm),
  );
  if (primaryRankOrder !== 0) return primaryRankOrder;

  const kindOrder = compareNumbers(
    TERM_KIND_PRIORITY[leftMatch.bestMatch.term.kind],
    TERM_KIND_PRIORITY[rightMatch.bestMatch.term.kind],
  );
  if (kindOrder !== 0) return kindOrder;

  const compactOrder = compareNumbers(
    leftMatch.bestMatch.term.isCompactVariant ? 1 : 0,
    rightMatch.bestMatch.term.isCompactVariant ? 1 : 0,
  );
  if (compactOrder !== 0) return compactOrder;

  const totalStrategyOrder = compareNumbers(
    leftMatch.totalStrategyRank,
    rightMatch.totalStrategyRank,
  );
  if (totalStrategyOrder !== 0) return totalStrategyOrder;

  if (leftEntry.primaryTerm.tokens.length !== rightEntry.primaryTerm.tokens.length) {
    return leftEntry.primaryTerm.tokens.length - rightEntry.primaryTerm.tokens.length;
  }

  if (
    leftEntry.primaryTerm.normalized.length !==
    rightEntry.primaryTerm.normalized.length
  ) {
    return (
      leftEntry.primaryTerm.normalized.length -
      rightEntry.primaryTerm.normalized.length
    );
  }

  return leftEntry.sortText.localeCompare(rightEntry.sortText);
}

function compareFuzzyEntryMatches(
  query: PreparedSearchQuery,
  leftEntry: PreparedSearchEntry<unknown>,
  leftMatch: FuzzyEntryMatch,
  rightEntry: PreparedSearchEntry<unknown>,
  rightMatch: FuzzyEntryMatch,
): number {
  const fuzzyCountOrder = compareNumbers(leftMatch.fuzzyCount, rightMatch.fuzzyCount);
  if (fuzzyCountOrder !== 0) return fuzzyCountOrder;

  const fuzzyScoreOrder = compareNumbers(
    leftMatch.totalFuzzyScore,
    rightMatch.totalFuzzyScore,
  );
  if (fuzzyScoreOrder !== 0) return fuzzyScoreOrder;

  const bestCoverageOrder = compareNumbers(
    rightMatch.bestSameTermCoverage,
    leftMatch.bestSameTermCoverage,
  );
  if (bestCoverageOrder !== 0) return bestCoverageOrder;

  const kindOrder = compareNumbers(
    TERM_KIND_PRIORITY[leftMatch.bestMatch.term.kind],
    TERM_KIND_PRIORITY[rightMatch.bestMatch.term.kind],
  );
  if (kindOrder !== 0) return kindOrder;

  const compactOrder = compareNumbers(
    leftMatch.bestMatch.term.isCompactVariant ? 1 : 0,
    rightMatch.bestMatch.term.isCompactVariant ? 1 : 0,
  );
  if (compactOrder !== 0) return compactOrder;

  const totalStrategyOrder = compareNumbers(
    leftMatch.totalStrategyRank,
    rightMatch.totalStrategyRank,
  );
  if (totalStrategyOrder !== 0) return totalStrategyOrder;

  const primaryRankOrder = compareTuple(
    getPrimaryTermRank(query, leftEntry.primaryTerm),
    getPrimaryTermRank(query, rightEntry.primaryTerm),
  );
  if (primaryRankOrder !== 0) return primaryRankOrder;

  if (leftMatch.bestMatch.term.tokens.length !== rightMatch.bestMatch.term.tokens.length) {
    return leftMatch.bestMatch.term.tokens.length - rightMatch.bestMatch.term.tokens.length;
  }

  if (
    leftMatch.bestMatch.term.normalized.length !==
    rightMatch.bestMatch.term.normalized.length
  ) {
    return (
      leftMatch.bestMatch.term.normalized.length -
      rightMatch.bestMatch.term.normalized.length
    );
  }

  return leftEntry.sortText.localeCompare(rightEntry.sortText);
}

function compareTuple(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const nextOrder = compareNumbers(left[index] ?? 0, right[index] ?? 0);
    if (nextOrder !== 0) return nextOrder;
  }

  return 0;
}

export function buildCatalogSearchIndex<T>(
  items: CatalogSearchItemInput<T>[],
): CatalogSearchIndex<T> {
  return items
    .map((item) => buildEntry(item))
    .filter((entry): entry is PreparedSearchEntry<T> => entry !== null);
}

export function searchCatalog<T>(
  index: CatalogSearchIndex<T>,
  queryValue: string,
  limit?: number,
): CatalogSearchResult<T>[] {
  const query = prepareQuery(queryValue);
  if (!query) return [];

  const strongMatches: Array<{
    entry: PreparedSearchEntry<T>;
    match: StrongEntryMatch;
  }> = [];
  const fuzzyMatches: Array<{
    entry: PreparedSearchEntry<T>;
    match: FuzzyEntryMatch;
  }> = [];

  for (const entry of index) {
    const nextMatch = getEntryMatch(entry, query);
    if (!nextMatch) continue;

    if (nextMatch.phase === "strong") {
      strongMatches.push({ entry, match: nextMatch });
      continue;
    }

    fuzzyMatches.push({ entry, match: nextMatch });
  }

  strongMatches.sort((left, right) =>
    compareStrongEntryMatches(query, left.entry, left.match, right.entry, right.match),
  );
  fuzzyMatches.sort((left, right) =>
    compareFuzzyEntryMatches(query, left.entry, left.match, right.entry, right.match),
  );

  const matches = [...strongMatches, ...fuzzyMatches].map(({ entry, match }) => ({
    item: entry.item,
    match: {
      text: match.bestMatch.term.text,
      kind: match.bestMatch.term.kind,
      strategy:
        match.bestMatch.strategyRank === STRONG_STRATEGY_PRIORITY.exact
          ? "exact"
          : match.bestMatch.strategyRank === STRONG_STRATEGY_PRIORITY.prefix
            ? "prefix"
            : match.bestMatch.strategyRank === STRONG_STRATEGY_PRIORITY.substring
              ? "substring"
              : "fuzzy",
      isFuzzy: match.phase === "fuzzy",
    } satisfies CatalogSearchMatch,
  }));

  return typeof limit === "number" ? matches.slice(0, limit) : matches;
}
