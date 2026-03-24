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
    itemKey={(item) => item.shortcode}
    width="w-80"
    emptyText="No matching emoji"
    renderItem={(item) => (
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 text-xl leading-none">{item.emoji}</div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm leading-snug font-medium truncate">
            :{item.shortcode}:
          </span>
          {item.keywords.length > 0 && (
            <span className="text-xs text-text-muted truncate mt-0.5">
              {item.keywords.slice(0, 4).join(" · ")}
            </span>
          )}
        </div>
      </div>
    )}
  />
));
EmojiSuggestionList.displayName = "EmojiSuggestionList";
