import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmojiSuggestionList } from "./EmojiSuggestionList";

describe("EmojiSuggestionList", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("shows the primary shortcode before other metadata when displaying a matched alias", () => {
    render(
      <EmojiSuggestionList
        items={[
          {
            id: "book",
            emoji: "📖",
            shortcode: "open-book",
            primaryShortcode: "open_book",
            aliases: ["open_book", "book"],
            keywords: ["book", "read", "library"],
          },
        ]}
        command={vi.fn()}
      />,
    );

    expect(screen.getByText(":open-book:")).toBeInTheDocument();
    expect(screen.getByText("open_book · book · read · library")).toBeInTheDocument();
  });
});
