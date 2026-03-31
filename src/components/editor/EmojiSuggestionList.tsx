import { forwardRef } from "react";
import type { EmojiItem } from "../../lib/emoji";
import {
  SuggestionList,
  type SuggestionListRef,
} from "./SuggestionList";

export type EmojiSuggestionListRef = SuggestionListRef;

interface EmojiSuggestionListProps {
  items: EmojiItem[];
  command: (item: EmojiItem) => void;
}

export const EmojiSuggestionList = forwardRef<
  EmojiSuggestionListRef,
  EmojiSuggestionListProps
>(({ items, command }, ref) => (
  <SuggestionList
    ref={ref}
    items={items}
    command={command}
    itemKey={(item) => item.id}
    width="w-80"
    emptyText="No matching emoji"
    renderItem={(item) => {
      const metadata = [];

      if (item.shortcode !== item.primaryShortcode) {
        metadata.push(item.primaryShortcode);
      }

      if (
        item.matchedText &&
        item.matchedKind &&
        item.matchedText !== item.shortcode &&
        item.matchedText !== item.primaryShortcode
      ) {
        const matchLabel =
          item.matchedStrategy === "fuzzy"
            ? `fuzzy: ${item.matchedText}`
            : `${item.matchedKind}: ${item.matchedText}`;

        metadata.push(matchLabel);
      }

      for (const keyword of item.keywords) {
        if (
          keyword === item.shortcode ||
          keyword === item.primaryShortcode ||
          keyword === item.matchedText
        ) {
          continue;
        }
        metadata.push(keyword);
      }

      return (
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 text-xl leading-none">{item.emoji}</div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm leading-snug font-medium truncate">
              :{item.shortcode}:
            </span>
            {metadata.length > 0 && (
              <span className="text-xs text-text-muted truncate mt-0.5">
                {metadata.slice(0, 4).join(" · ")}
              </span>
            )}
          </div>
        </div>
      );
    }}
  />
));
EmojiSuggestionList.displayName = "EmojiSuggestionList";
