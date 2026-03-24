import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { emojifyShortcodes } from "./emoji";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Clean title - remove markdown syntax and invisible characters
 */
export function cleanTitle(title: string | undefined): string {
  if (!title) return "Untitled";
  const cleaned = title
    // Remove heading markers (##, ###, etc.)
    .replace(/^#+\s+/, "")
    // Remove bold (**text** or __text__)
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    // Remove italic (*text* or _text_)
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Remove strikethrough (~~text~~)
    .replace(/~~(.*?)~~/g, "$1")
    // Remove inline code (`code`)
    .replace(/`([^`]+)`/g, "$1")
    // Remove images ![alt](url) - must come before links to avoid leaving "!"
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove links [text](url) - keep only text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove non-breaking spaces and other invisible characters
    .replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .trim();
  return cleaned ? emojifyShortcodes(cleaned) : "Untitled";
}

export function cleanPreviewText(text: string | undefined): string {
  if (!text) return "";
  return emojifyShortcodes(
    text
      .replace(/&nbsp;/g, " ")
      .replace(/\u00A0/g, " ")
      .replace(/\u200B/g, "")
      .trim(),
  );
}

export function getDisplayInitial(text: string | undefined): string {
  const title = cleanTitle(text);
  const [firstCharacter = ""] = Array.from(title);

  if (/^[a-z]$/i.test(firstCharacter)) {
    return firstCharacter.toUpperCase();
  }

  return firstCharacter;
}
