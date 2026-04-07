import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { useEditorDocumentLifecycle } from "./useEditorDocumentLifecycle";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("../../lib/noteOpenTiming", () => ({
  markNoteOpenTiming: vi.fn(),
}));

describe("useEditorDocumentLifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("uses the renamed note id for source-mode saves before the next render", async () => {
    let markdown = "# Renamed\n";
    const editor = {
      storage: {
        markdown: {
          manager: {
            serialize: vi.fn(() => markdown),
            parse: vi.fn((value: string) => value),
          },
        },
      },
      getJSON: vi.fn(() => ({})),
      getText: vi.fn(() => markdown),
      commands: {
        setContent: vi.fn(),
        blur: vi.fn(),
        focus: vi.fn(),
        selectAll: vi.fn(),
      },
    } as unknown as TiptapEditor;

    const currentNoteIdRef = { current: "Untitled" };
    const editorRef = { current: editor };
    const saveNote = vi.fn().mockResolvedValue(undefined);
    const renameNote = vi.fn().mockResolvedValue({ id: "Renamed" });

    const { result } = renderHook(() =>
      useEditorDocumentLifecycle({
        currentNote: {
          id: "Untitled",
          title: "Untitled",
          content: "# Untitled\n",
          modified: 1,
        },
        currentNoteIdRef,
        editorReady: false,
        editorRef,
        focusAndSelectTitle: vi.fn(() => false),
        printMode: false,
        reloadVersion: 0,
        renameNote,
        saveNote,
        notesFolder: null,
        scrollContainerRef: { current: null },
        sourceTextareaRef: { current: null },
      }),
    );

    result.current.provisionalFilenameNoteIdRef.current = "Untitled";

    await act(async () => {
      await result.current.finalizeProvisionalFilename();
    });

    expect(currentNoteIdRef.current).toBe("Renamed");

    markdown = "# Renamed\nBody";

    await act(async () => {
      result.current.handleSourceChange("# Renamed\nBody");
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(saveNote).toHaveBeenCalledWith("# Renamed\nBody", "Renamed");
  });
});
