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
        sourceEditorRef: { current: null },
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
          sourceEditorRef: { current: null },
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

  it("focuses the first body line for a newly created daily note", () => {
    const setTextSelection = vi.fn(() => chain);
    const insertContentAt = vi.fn(() => chain);
    const focus = vi.fn(() => chain);
    const run = vi.fn(() => true);
    const chain = {
      focus,
      insertContentAt,
      setTextSelection,
      run,
    };
    const editor = {
      state: {
        doc: {
          content: { size: 9 },
          descendants: vi.fn((callback) => {
            callback(
              {
                type: { name: "heading" },
                attrs: { level: 1 },
                nodeSize: 7,
              },
              0,
            );
          }),
        },
      },
      storage: {
        markdown: {
          manager: {
            serialize: vi.fn(() => "# May 4, 2026\n\n"),
            parse: vi.fn((value: string) => value),
          },
        },
      },
      getJSON: vi.fn(() => ({})),
      getText: vi.fn(() => "# May 4, 2026\n\n"),
      chain: vi.fn(() => chain),
      commands: {
        setContent: vi.fn(),
        blur: vi.fn(),
        focus: vi.fn(),
        selectAll: vi.fn(),
      },
    } as unknown as TiptapEditor;

    const focusAndSelectTitle = vi.fn(() => true);

    renderHook(() =>
      useEditorDocumentLifecycle({
        consumePendingDailyNoteBodyFocus: vi.fn(() => true),
        consumePendingNewNote: vi.fn(() => false),
        currentNote: {
          id: "Daily/2026-05-04",
          title: "May 4, 2026",
          content: "# May 4, 2026\n\n",
          modified: 1,
        },
        currentNoteIdRef: { current: "Daily/2026-05-04" },
        editorReady: true,
        editorRef: { current: editor },
        focusAndSelectTitle,
        printMode: false,
        reloadVersion: 0,
        saveNote: vi.fn().mockResolvedValue(undefined),
        notesFolder: null,
        scrollContainerRef: { current: null },
        sourceEditorRef: { current: null },
      }),
    );

    expect(focusAndSelectTitle).not.toHaveBeenCalled();
    expect(insertContentAt).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(setTextSelection).toHaveBeenCalledWith(8);
    expect(run).toHaveBeenCalled();
  });

  it("flushes pending source-mode saves before returning", async () => {
    const saveNote = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useEditorDocumentLifecycle({
        currentNote: {
          id: "alpha",
          title: "Alpha",
          content: "# Alpha\n",
          modified: 1,
        },
        currentNoteIdRef: { current: "alpha" },
        editorReady: false,
        editorRef: { current: null },
        focusAndSelectTitle: vi.fn(() => false),
        printMode: false,
        reloadVersion: 0,
        saveNote,
        notesFolder: null,
        scrollContainerRef: { current: null },
        sourceEditorRef: { current: null },
      }),
    );

    act(() => {
      result.current.handleSourceChange("# Renamed\nBody");
    });

    await act(async () => {
      await result.current.flushPendingSave();
    });

    expect(saveNote).toHaveBeenCalledWith("# Renamed\nBody", "alpha");
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
