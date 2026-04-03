import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PreviewApp } from "./PreviewApp";

const fileServiceMocks = vi.hoisted(() => ({
  readFileDirect: vi.fn(),
  saveFileDirect: vi.fn(),
}));

vi.mock("../../services/files", () => ({
  readFileDirect: fileServiceMocks.readFileDirect,
  saveFileDirect: fileServiceMocks.saveFileDirect,
  importFileToFolder: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => vi.fn()),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    close: vi.fn(),
  })),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("./DetachedEditorWindow", () => ({
  DetachedEditorWindow: ({
    children,
  }: {
    children: (args: {
      focusMode: boolean;
      isPrint: boolean;
      onEditorReady?: () => void;
    }) => ReactNode;
  }) => <>{children({ focusMode: false, isPrint: false })}</>,
}));

vi.mock("../editor/Editor", () => ({
  Editor: ({
    previewMode,
  }: {
    previewMode: {
      content: string | null;
      title: string;
      save: (content: string) => Promise<void>;
    };
  }) => (
    <div>
      <div>{previewMode.title}</div>
      <div>{previewMode.content}</div>
      <button onClick={() => void previewMode.save("# Updated")}>save</button>
    </div>
  ),
}));

describe("PreviewApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileServiceMocks.readFileDirect.mockResolvedValue({
      path: "/tmp/note.md",
      title: "Note",
      content: "# Original",
      modified: 1,
    });
    fileServiceMocks.saveFileDirect.mockResolvedValue({
      path: "/tmp/note.md",
      title: "Note",
      content: "# Updated",
      modified: 2,
    });
  });

  it("updates the preview baseline content after a save", async () => {
    const user = userEvent.setup();

    render(<PreviewApp filePath="/tmp/note.md" />);

    expect(await screen.findByText("# Original")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(screen.getByText("# Updated")).toBeInTheDocument();
    });
    expect(fileServiceMocks.saveFileDirect).toHaveBeenCalledWith(
      "/tmp/note.md",
      "# Updated",
    );
  });
});
