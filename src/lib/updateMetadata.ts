const URL_PATTERN = /https?:\/\/[^\s]+/gi;

const DEFAULT_UPDATE_BODY = "A new version is ready to install.";
const RELEASE_NOTES_BODY = "See what's new in this release.";

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

export interface UpdateToastContent {
  body: string;
  releaseNotesUrl: string | null;
}

export function getUpdateToastContent(
  rawJson: Record<string, unknown>,
  fallbackBody?: string,
): UpdateToastContent {
  const notes = getNotesText(rawJson, fallbackBody);
  const matches = notes.match(URL_PATTERN) ?? [];

  for (const candidate of matches) {
    const releaseNotesUrl = normalizeUrlCandidate(candidate);
    if (releaseNotesUrl) {
      return {
        body: RELEASE_NOTES_BODY,
        releaseNotesUrl,
      };
    }
  }

  if (notes.length > 0) {
    return {
      body: notes,
      releaseNotesUrl: null,
    };
  }

  return {
    body: DEFAULT_UPDATE_BODY,
    releaseNotesUrl: null,
  };
}
