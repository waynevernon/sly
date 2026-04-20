import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorFilenameField } from "./EditorFilenameField";
import { TooltipProvider } from "../ui";

function renderFilenameField(
  noteId: string,
  documentTitle: string,
  onRename = vi.fn(),
) {
  return render(
    <TooltipProvider>
      <EditorFilenameField
        noteId={noteId}
        documentTitle={documentTitle}
        onRename={onRename}
      />
    </TooltipProvider>,
  );
}

describe("EditorFilenameField", () => {
  it("opens inline editing and renames on Enter", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);

    renderFilenameField("folder/Alpha", "Alpha", onRename);

    await user.click(
      screen.getByRole("button", { name: "Edit filename Alpha.md" }),
    );
    const input = screen.getByRole("textbox", { name: "Edit filename" });
    expect(screen.getByText(".md")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "Renamed{Enter}");

    expect(onRename).toHaveBeenCalledWith("Renamed");
  });

  it("cancels editing on Escape", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);

    renderFilenameField("folder/Alpha", "Alpha", onRename);

    await user.click(
      screen.getByRole("button", { name: "Edit filename Alpha.md" }),
    );
    const input = screen.getByRole("textbox", { name: "Edit filename" });
    await user.type(input, "{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Edit filename Alpha.md" }),
    ).toBeInTheDocument();
  });

  it("offers a sync action when the first line and filename differ", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn().mockResolvedValue(undefined);

    renderFilenameField("folder/Alpha", "Project kickoff", onRename);

    await user.click(
      screen.getByRole("button", { name: "Use first line as filename" }),
    );

    expect(onRename).toHaveBeenCalledWith("Project kickoff");
  });

  it("hides the sync action when the sanitized first line already matches the filename", () => {
    renderFilenameField("folder/Project--kickoff", "Project:/kickoff");

    expect(
      screen.queryByRole("button", { name: "Use first line as filename" }),
    ).not.toBeInTheDocument();
  });
});
