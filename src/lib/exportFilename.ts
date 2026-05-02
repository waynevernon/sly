export function sanitizeMarkdownExportFilename(name: string): string {
  const sanitized = Array.from(name)
    .filter((char) => char !== "\u00A0" && char !== "\uFEFF")
    .map((char) =>
      ["/", "\\", "?", "%", "*", ":", "|", "\"", "<", ">"].includes(char)
        ? "-"
        : char,
    )
    .join("")
    .trim();

  return sanitized || "note";
}
