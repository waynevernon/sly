interface MarkdownPasteCandidate {
  html: string;
  text: string;
}

const MULTILINE_BULLET_LIST = /^(?:\s*[-*+]\s.+\r?\n){1,}\s*[-*+]\s.+$/m;
const MULTILINE_ORDERED_LIST = /^(?:\s*\d+\.\s.+\r?\n){1,}\s*\d+\.\s.+$/m;
const BLOCK_MARKDOWN_PATTERNS = [
  /^#{1,6}\s/m,
  /^>\s/m,
  /^```/m,
  /^\$\$/m,
  /^\|.+\|\s*$/m,
  /^(?:-{3,}|\*{3,}|_{3,})\s*$/m,
  /^---\r?\n[\s\S]*\r?\n---(?:\r?\n|$)/,
];

export function shouldParseMarkdownPaste({
  html,
  text,
}: MarkdownPasteCandidate): boolean {
  if (html.trim().length > 0) {
    return false;
  }

  const trimmed = text.trim();
  if (!trimmed || !trimmed.includes("\n")) {
    return false;
  }

  if (
    MULTILINE_BULLET_LIST.test(trimmed) ||
    MULTILINE_ORDERED_LIST.test(trimmed)
  ) {
    return true;
  }

  return BLOCK_MARKDOWN_PATTERNS.some((pattern) => pattern.test(trimmed));
}
