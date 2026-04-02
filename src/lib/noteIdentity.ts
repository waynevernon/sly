export function sanitizeNoteFilename(title: string): string {
  const sanitized = Array.from(title)
    .filter((char) => char !== "\u00A0" && char !== "\uFEFF")
    .map((char) =>
      ["/", "\\", ":", "*", "?", "\"", "<", ">", "|"].includes(char)
        ? "-"
        : char,
    )
    .join("")
    .trim();

  return isEffectivelyEmpty(sanitized) ? "Untitled" : sanitized;
}

export function stripMarkdownFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return content;
  }

  const rest = trimmed.slice(3);
  const end = rest.indexOf("\n---");
  if (end === -1) {
    return content;
  }

  const afterClose = rest.slice(end + 4);
  return afterClose.startsWith("\r\n")
    ? afterClose.slice(2)
    : afterClose.startsWith("\n")
      ? afterClose.slice(1)
      : afterClose;
}

export function deriveNoteTitleFromMarkdown(content: string): string {
  const body = stripMarkdownFrontmatter(content);

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      const heading = trimmed.slice(2).trim();
      if (!isEffectivelyEmpty(heading)) {
        return heading;
      }
    }

    if (!isEffectivelyEmpty(trimmed)) {
      return Array.from(trimmed).slice(0, 50).join("");
    }
  }

  return "Untitled";
}

export function getNoteLeaf(noteId: string): string {
  const segments = noteId.split("/");
  return segments[segments.length - 1] ?? noteId;
}

export function isDefaultPlaceholderNoteId(noteId: string): boolean {
  return /^Untitled(?:-\d+)?$/.test(getNoteLeaf(noteId));
}

export function isDefaultPlaceholderTitle(title: string): boolean {
  return /^Untitled(?: \d+)?$/.test(title.trim());
}

function isEffectivelyEmpty(value: string): boolean {
  return Array.from(value).every(
    (char) => /\s/.test(char) || char === "\u00A0" || char === "\uFEFF",
  );
}
