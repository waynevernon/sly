import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor as TiptapEditor } from "@tiptap/react";
import {
  blockIndexToPos,
  getMarkdownBlockOffsets,
  useEditorDocumentLifecycle,
} from "./useEditorDocumentLifecycle";

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
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("does not reload or blur the editor during an in-flight provisional rename", async () => {
    let resolveRename: ((value: { id: string }) => void) | null = null;
    const renamePromise = new Promise<{ id: string }>((resolve) => {
      resolveRename = resolve;
    });

    const editor = {
      storage: {
        markdown: {
          manager: {
            serialize: vi.fn(() => "# Renamed\nBody"),
            parse: vi.fn((value: string) => value),
          },
        },
      },
      getJSON: vi.fn(() => ({})),
      getText: vi.fn(() => "# Renamed\nBody"),
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
    const renameNote = vi.fn(() => renamePromise);
    const focusAndSelectTitle = vi.fn(() => true);

    const { result, rerender } = renderHook(
      ({
        currentNote,
      }: {
        currentNote: {
          id: string;
          title: string;
          content: string;
          modified: number;
        };
      }) =>
        useEditorDocumentLifecycle({
          consumePendingNewNote: vi.fn(() => true),
          currentNote,
          currentNoteIdRef,
          editorReady: true,
          editorRef,
          focusAndSelectTitle,
          printMode: false,
          reloadVersion: 0,
          renameNote,
          saveNote,
          notesFolder: null,
          scrollContainerRef: { current: null },
          sourceTextareaRef: { current: null },
        }),
      {
        initialProps: {
          currentNote: {
            id: "Untitled",
            title: "Untitled",
            content: "# Untitled\n\n",
            modified: 1,
          },
        },
      },
    );

    expect((editor.commands.setContent as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((editor.commands.blur as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(result.current.provisionalFilenameNoteIdRef.current).toBe("Untitled");

    let renameTask: Promise<void> | null = null;
    await act(async () => {
      renameTask = result.current.finalizeProvisionalFilename();
    });

    rerender({
      currentNote: {
        id: "Renamed",
        title: "Renamed",
        content: "# Renamed\n\n",
        modified: 2,
      },
    });

    expect((editor.commands.setContent as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((editor.commands.blur as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(currentNoteIdRef.current).toBe("Renamed");

    await act(async () => {
      resolveRename?.({ id: "Renamed" });
      await renameTask;
    });
  });

  it("tracks headings and fenced code blocks when mapping markdown blocks", () => {
    const markdown = "Intro\n# Heading\n\n```ts\nconst answer = 42;\n```\n\nTail\n";

    expect(getMarkdownBlockOffsets(markdown)).toEqual([
      0,
      markdown.indexOf("# Heading"),
      markdown.indexOf("```ts"),
      markdown.indexOf("Tail"),
    ]);
  });

  it("clamps block lookups when converting block indexes back to ProseMirror positions", () => {
    const nodeSizes = [4, 6, 8];
    const doc = {
      childCount: nodeSizes.length,
      child: (index: number) => ({ nodeSize: nodeSizes[index] }),
    };

    expect(blockIndexToPos(doc, -1)).toBe(1);
    expect(blockIndexToPos(doc, 0)).toBe(1);
    expect(blockIndexToPos(doc, 1)).toBe(5);
    expect(blockIndexToPos(doc, 2)).toBe(11);
    expect(blockIndexToPos(doc, 99)).toBe(11);
  });
});
