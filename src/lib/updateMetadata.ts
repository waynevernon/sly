const URL_PATTERN = /https?:\/\/[^\s]+/gi;

const DEFAULT_UPDATE_BODY = "A new version is ready to install.";
const RELEASE_NOTES_BODY = "See what's new in this release.";
const RELEASE_TAG_BASE_URL =
  "https://github.com/waynevernon/sly/releases/tag/";

function normalizeUrlCandidate(candidate: string): string | null {
  let normalized = candidate.trim();

  while (normalized.length > 0 && /[),.;!?]$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }

  try {
    const url = new URL(normalized);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function getNotesText(
  rawJson: Record<string, unknown>,
  fallbackBody?: string,
): string {
  if (typeof rawJson.notes === "string") {
    return rawJson.notes.trim();
  }

  return typeof fallbackBody === "string" ? fallbackBody.trim() : "";
}

function normalizeNotesBody(candidate: string): string {
  return candidate
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/[ \t]{2,}/g, " "))
    .filter((line) => line.length > 0)
    .join("\n");
}

function extractUrlFromNotes(notes: string): {
  body: string;
  releaseNotesUrl: string | null;
} {
  const matches = notes.match(URL_PATTERN) ?? [];

  for (const candidate of matches) {
    const releaseNotesUrl = normalizeUrlCandidate(candidate);
    if (!releaseNotesUrl) continue;

    const body = normalizeNotesBody(notes.replace(candidate, ""));
    return {
      body,
      releaseNotesUrl,
    };
  }

  return {
    body: normalizeNotesBody(notes),
    releaseNotesUrl: null,
  };
}

function getCustomReleaseNotesUrl(rawJson: Record<string, unknown>): string | null {
  if (typeof rawJson.releaseNotesUrl !== "string") {
    return null;
  }

  return normalizeUrlCandidate(rawJson.releaseNotesUrl);
}

function deriveReleaseNotesUrl(version: string): string | null {
  const normalizedVersion = version.trim();
  if (normalizedVersion.length === 0) {
    return null;
  }

  const tag = normalizedVersion.startsWith("v")
    ? normalizedVersion
    : `v${normalizedVersion}`;

  return `${RELEASE_TAG_BASE_URL}${tag}`;
}

export interface UpdateToastContent {
  body: string;
  releaseNotesUrl: string | null;
}

export function getUpdateToastContent(
  rawJson: Record<string, unknown>,
  version: string,
  fallbackBody?: string,
): UpdateToastContent {
  const notes = getNotesText(rawJson, fallbackBody);
  const customReleaseNotesUrl = getCustomReleaseNotesUrl(rawJson);
  const {
    body: extractedBody,
    releaseNotesUrl: parsedReleaseNotesUrl,
  } = extractUrlFromNotes(notes);
  const releaseNotesUrl =
    customReleaseNotesUrl ??
    parsedReleaseNotesUrl ??
    deriveReleaseNotesUrl(version);

  if (extractedBody.length > 0) {
    return {
      body: extractedBody,
      releaseNotesUrl,
    };
  }

  if (releaseNotesUrl && notes.length > 0) {
    return {
      body: RELEASE_NOTES_BODY,
      releaseNotesUrl,
    };
  }

  return {
    body: DEFAULT_UPDATE_BODY,
    releaseNotesUrl,
  };
}
