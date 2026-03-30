import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmojiCatalogItems, searchEmojiShortcodes } from "../../lib/emoji";
import { TooltipProvider } from "../ui";
import { FolderIconPickerModal } from "./FolderIconPickerModal";

describe("FolderIconPickerModal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("keeps icon picks local until apply", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <TooltipProvider>
        <FolderIconPickerModal
          open
          value={null}
          title="Customize Folder"
          onOpenChange={vi.fn()}
          onApply={onApply}
        />
      </TooltipProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("Search Lucide icons..."), {
      target: { value: "folder-open-dot" },
    });
    await user.keyboard("{Enter}");

    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith({
      icon: { kind: "lucide", name: "folder-open-dot" },
    });
  });

  it("persists the query across source switches and applies emoji styles", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const [firstResult] = searchEmojiShortcodes("open-book", 1);
    expect(firstResult).toBeTruthy();

    render(
      <TooltipProvider>
        <FolderIconPickerModal
          open
          value={null}
          title="Customize Folder"
          onOpenChange={vi.fn()}
          onApply={onApply}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Emoji" }));
    fireEvent.change(
      screen.getByPlaceholderText("Search emoji names or aliases..."),
      {
        target: { value: "open-book" },
      },
    );

    await user.click(screen.getByRole("button", { name: "Icons" }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("open-book")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Emoji" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Use blue folder color" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith({
      icon: { kind: "emoji", shortcode: firstResult.shortcode },
      colorId: "blue",
    });
  });

  it("uses the deduped emoji search results in the picker", async () => {
    const user = userEvent.setup();
    const bookResults = searchEmojiShortcodes("book");

    render(
      <TooltipProvider>
        <FolderIconPickerModal
          open
          value={null}
          title="Customize Folder"
          onOpenChange={vi.fn()}
          onApply={vi.fn()}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Emoji" }));
    fireEvent.change(
      screen.getByPlaceholderText("Search emoji names or aliases..."),
      {
        target: { value: "book" },
      },
    );

    await waitFor(() => {
      expect(
        screen.getByText(`${bookResults.length.toLocaleString()} emoji`),
      ).toBeInTheDocument();
    });
  });

  it("shows the emoji catalog without requiring a search query", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const [firstEmoji] = getEmojiCatalogItems();
    expect(firstEmoji).toBeTruthy();

    render(
      <TooltipProvider>
        <FolderIconPickerModal
          open
          value={null}
          title="Customize Folder"
          onOpenChange={vi.fn()}
          onApply={onApply}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Emoji" }));

    expect(
      screen.getByText(
        `${getEmojiCatalogItems().length.toLocaleString()} emoji`,
      ),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith({
      icon: { kind: "emoji", shortcode: firstEmoji.shortcode },
    });
  });

  it("resets the draft back to the default folder style", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <TooltipProvider>
        <FolderIconPickerModal
          open
          value={{
            icon: { kind: "emoji", shortcode: "book" },
            colorId: "amber",
          }}
          title="Customize Folder"
          onOpenChange={vi.fn()}
          onApply={onApply}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith(null);
  });
});
