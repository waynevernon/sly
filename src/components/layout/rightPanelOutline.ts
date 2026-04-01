import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { emojifyShortcodes, getEmojiForShortcode } from "../../lib/emoji";

export interface OutlineItem {
  id: string;
  pos: number;
  level: number;
  text: string;
}

function getOutlineText(node: ProseMirrorNode): string {
  let text = "";

  node.descendants((child) => {
    if (child.type.name === "emoji") {
      const shortcode = String(child.attrs.shortcode ?? "");
      text += getEmojiForShortcode(shortcode) ?? `:${shortcode}:`;
      return false;
    }

    if (child.isText && child.text) {
      text += child.text;
    }

    return true;
  });

  return emojifyShortcodes(text).trim();
}

export function extractOutlineItems(doc: ProseMirrorNode): OutlineItem[] {
  const items: OutlineItem[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const level = Number(node.attrs.level ?? 0);
    const text = getOutlineText(node);
    if (level < 1 || level > 6 || !text) {
      return true;
    }

    items.push({
      id: String(pos),
      pos,
      level,
      text,
    });

    return true;
  });

  return items;
}

export function findActiveOutlineFromSelection(
  items: OutlineItem[],
  selectionFrom: number,
): OutlineItem | null {
  if (items.length === 0) return null;

  let active = items[0];
  for (const item of items) {
    if (item.pos > selectionFrom) break;
    active = item;
  }

  return active;
}

export function findActiveOutlineFromHeadingTops(
  headings: Array<{ item: OutlineItem; top: number }>,
  thresholdTop: number,
): OutlineItem | null {
  if (headings.length === 0) return null;

  let active: OutlineItem | null = null;
  for (const heading of headings) {
    if (heading.top <= thresholdTop) {
      active = heading.item;
    } else {
      break;
    }
  }

  return active ?? headings[0].item;
}
