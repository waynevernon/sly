import { emojifyShortcodes } from "./emoji";

export function plainTextFromMarkdown(markdown: string): string {
  let inCodeBlock = false;
  const lines = markdown.split(/\r?\n/);
  const plainLines = lines.map((line) => {
    let text = line;

    if (/^\s*(```|~~~)/.test(text)) {
      inCodeBlock = !inCodeBlock;
      return "";
    }

    if (inCodeBlock) {
      return text;
    }

    const inlineCodePlaceholders = new Map<string, string>();
    let placeholderIndex = 0;

    text = text.replace(/`([^`]+)`/g, (_, code: string) => {
      const placeholder = `@@SCRATCHINLINECODE${placeholderIndex}@@`;
      inlineCodePlaceholders.set(placeholder, code);
      placeholderIndex += 1;
      return placeholder;
    });

    text = text.replace(/^\s{0,3}#{1,6}\s+/, "");
    text = text.replace(/^\s{0,3}>\s?/, "");
    text = text.replace(/^\s*([-*+]\s+|\d+\.\s+)/, "");
    text = text.replace(/^\s*([*-]){3,}\s*$/, "");

    text = text.replace(/!\[(.*?)\]\([^)]*\)/g, "$1");
    text = text.replace(/\[(.+?)\]\([^)]*\)/g, "$1");
    text = text.replace(/\*\*(.+?)\*\*/g, "$1");
    text = text.replace(/(?<!\w)__(.+?)__(?!\w)/g, "$1");
    text = text.replace(/\*(.+?)\*/g, "$1");
    text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1");
    text = text.replace(/~~(.+?)~~/g, "$1");

    text = emojifyShortcodes(text);

    for (const [placeholder, code] of inlineCodePlaceholders) {
      text = text.split(placeholder).join(code);
    }

    return text;
  });

  return plainLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
