import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { toast } from "sonner";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { markNoteOpenTiming } from "../../lib/noteOpenTiming";
import {
  deriveNoteTitleFromMarkdown,
  isDefaultPlaceholderNoteId,
  isDefaultPlaceholderTitle,
} from "../../lib/noteIdentity";
import {
  toDisplayDocumentAssetPaths,
  toStoredDocumentAssetPaths,
} from "../../lib/assetPaths";

interface DocumentNote {
  id: string;
  title: string;
  content: string;
  modified: number;
}

interface UseEditorDocumentLifecycleOptions {
  consumePendingNewNote?: (id: string) => boolean;
  currentNote: DocumentNote | null;
  currentNoteIdRef: MutableRefObject<string | null>;
  editorReady: boolean;
  editorRef: MutableRefObject<TiptapEditor | null>;
  focusAndSelectTitle: (editor: TiptapEditor) => boolean;
  onRegisterFlushPendingSave?: (
    flushPendingSave: (() => Promise<void>) | null,
  ) => void;
  onSourceModeChange?: (sourceMode: boolean) => void;
  printMode: boolean;
  reloadVersion: number;
  renameNote?: (noteId: string, newName: string) => Promise<{ id: string }>;
  saveNote: (content: string, noteId?: string) => Promise<void>;
  notesFolder: string | null;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  sourceTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
}

function isDuplicateDraftTitle(title: string): boolean {
  return title.trimEnd().endsWith(" (Copy)");
}

export function useEditorDocumentLifecycle({
  consumePendingNewNote,
  currentNote,
  currentNoteIdRef,
  editorReady,
  editorRef,
  focusAndSelectTitle,
  onRegisterFlushPendingSave,
  onSourceModeChange,
  printMode,
  reloadVersion,
  renameNote,
  saveNote,
  notesFolder,
  scrollContainerRef,
  sourceTextareaRef,
}: UseEditorDocumentLifecycleOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const effectiveSourceMode = printMode ? false : sourceMode;
  const [sourceContent, setSourceContent] = useState("");
  const sourceTimeoutRef = useRef<number | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const isLoadingRef = useRef(false);
  const needsSaveRef = useRef(false);
  const provisionalFilenameNoteIdRef = useRef<string | null>(null);
  const committingFilenameNoteIdRef = useRef<string | null>(null);
  const loadedNoteIdRef = useRef<string | null>(null);
  const loadedModifiedRef = useRef<number | null>(null);
  const lastSaveRef = useRef<{ noteId: string; content: string } | null>(null);
  const lastReloadVersionRef = useRef(0);

  const getMarkdown = useCallback((editorInstance: TiptapEditor | null) => {
    if (!editorInstance) return "";
    const manager = editorInstance.storage.markdown?.manager;
    if (manager) {
      const storedDocument = toStoredDocumentAssetPaths(
        editorInstance.getJSON(),
        notesFolder,
      );
      let markdown = manager.serialize(storedDocument);
      markdown = markdown.replace(/&nbsp;|&#160;/g, " ");
      return markdown;
    }

    return editorInstance.getText();
  }, [notesFolder]);

  const parseEditorContent = useCallback(
    (editorInstance: TiptapEditor, markdown: string) => {
      const manager = editorInstance.storage.markdown?.manager;
      if (manager) {
        const parsed = manager.parse(markdown);
        return toDisplayDocumentAssetPaths(parsed, notesFolder);
      }

      return markdown;
    },
    [notesFolder],
  );

  const syncSourceTextareaHeight = useCallback(() => {
    const textarea = sourceTextareaRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!textarea || !scrollContainer) return;

    textarea.style.height = "0px";
    const nextHeight = Math.max(
      textarea.scrollHeight,
      scrollContainer.clientHeight,
    );
    textarea.style.height = `${nextHeight}px`;
  }, [scrollContainerRef, sourceTextareaRef]);

  const saveImmediately = useCallback(
    async (noteId: string, content: string) => {
      setIsSaving(true);
      try {
        lastSaveRef.current = { noteId, content };
        await saveNote(content, noteId);
      } finally {
        setIsSaving(false);
      }
    },
    [saveNote],
  );

  const flushPendingSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (needsSaveRef.current && editorRef.current && loadedNoteIdRef.current) {
      needsSaveRef.current = false;
      const markdown = getMarkdown(editorRef.current);
      await saveImmediately(loadedNoteIdRef.current, markdown);
    }
  }, [editorRef, getMarkdown, saveImmediately]);

  const finalizeProvisionalFilename = useCallback(async () => {
    const noteId = provisionalFilenameNoteIdRef.current;
    const currentEditor = editorRef.current;
    if (
      !noteId ||
      !currentEditor ||
      !renameNote ||
      currentNoteIdRef.current !== noteId ||
      committingFilenameNoteIdRef.current === noteId
    ) {
      return;
    }

    committingFilenameNoteIdRef.current = noteId;

    try {
      const markdown = getMarkdown(currentEditor);
      const derivedTitle = deriveNoteTitleFromMarkdown(markdown);
      if (!derivedTitle.trim() || isDefaultPlaceholderTitle(derivedTitle)) {
        return;
      }

      await flushPendingSave();
      const renamedNote = await renameNote(noteId, derivedTitle);
      if (renamedNote.id !== noteId) {
        currentNoteIdRef.current = renamedNote.id;
        loadedNoteIdRef.current = renamedNote.id;
        if (lastSaveRef.current?.noteId === noteId) {
          lastSaveRef.current = {
            ...lastSaveRef.current,
            noteId: renamedNote.id,
          };
        }
      }
    } catch (error) {
      console.error("Failed to commit provisional filename:", error);
      toast.error("Failed to rename file");
    } finally {
      if (provisionalFilenameNoteIdRef.current === noteId) {
        provisionalFilenameNoteIdRef.current = null;
      }
      if (committingFilenameNoteIdRef.current === noteId) {
        committingFilenameNoteIdRef.current = null;
      }
    }
  }, [currentNoteIdRef, editorRef, flushPendingSave, getMarkdown, renameNote]);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const savingNoteId = currentNoteIdRef.current ?? currentNote?.id;
    if (!savingNoteId) return;

    needsSaveRef.current = true;

    saveTimeoutRef.current = window.setTimeout(async () => {
      if (currentNoteIdRef.current !== savingNoteId || !needsSaveRef.current) {
        return;
      }

      if (editorRef.current) {
        needsSaveRef.current = false;
        const markdown = getMarkdown(editorRef.current);
        await saveImmediately(savingNoteId, markdown);
      }
    }, 500);
  }, [currentNote?.id, currentNoteIdRef, editorRef, getMarkdown, saveImmediately]);

  const toggleSourceMode = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;

    if (!effectiveSourceMode) {
      setSourceContent(getMarkdown(currentEditor));
      setSourceMode(true);
      return;
    }

    const manager = currentEditor.storage.markdown?.manager;
    if (manager) {
      try {
        const parsed = parseEditorContent(currentEditor, sourceContent);
        currentEditor.commands.setContent(parsed);
      } catch {
        currentEditor.commands.setContent(sourceContent);
      }
    } else {
      currentEditor.commands.setContent(sourceContent);
    }
    setSourceMode(false);
  }, [editorRef, effectiveSourceMode, getMarkdown, parseEditorContent, sourceContent]);

  const handleSourceChange = useCallback(
    (value: string) => {
      setSourceContent(value);
      if (sourceTimeoutRef.current) {
        clearTimeout(sourceTimeoutRef.current);
      }
      sourceTimeoutRef.current = window.setTimeout(async () => {
        const savingNoteId = currentNoteIdRef.current ?? currentNote?.id;
        if (savingNoteId) {
          setIsSaving(true);
          try {
            lastSaveRef.current = { noteId: savingNoteId, content: value };
            await saveNote(value, savingNoteId);
          } catch (error) {
            console.error("Failed to save note:", error);
            toast.error("Failed to save note");
          } finally {
            setIsSaving(false);
          }
        }
      }, 300);
    },
    [currentNote, currentNoteIdRef, saveNote],
  );

  useEffect(() => {
    onRegisterFlushPendingSave?.(flushPendingSave);
    return () => {
      onRegisterFlushPendingSave?.(null);
    };
  }, [flushPendingSave, onRegisterFlushPendingSave]);

  useEffect(() => {
    onSourceModeChange?.(effectiveSourceMode);
  }, [effectiveSourceMode, onSourceModeChange]);

  useEffect(() => {
    if (!sourceMode) return;

    syncSourceTextareaHeight();
    sourceTextareaRef.current?.focus();

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const resizeObserver = new ResizeObserver(() => {
      syncSourceTextareaHeight();
    });

    resizeObserver.observe(scrollContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollContainerRef, sourceMode, sourceTextareaRef, syncSourceTextareaHeight]);

  useEffect(() => {
    if (!sourceMode) return;
    syncSourceTextareaHeight();
  }, [sourceContent, sourceMode, syncSourceTextareaHeight]);

  useEffect(() => {
    if (!editorReady || !currentNote) {
      return;
    }

    const currentEditor = editorRef.current;
    if (!currentEditor) {
      return;
    }

    const isSameNote = currentNote.id === loadedNoteIdRef.current;

    if (!isSameNote) {
      const lastSave = lastSaveRef.current;
      if (
        lastSave?.noteId === loadedNoteIdRef.current &&
        lastSave?.content === currentNote.content
      ) {
        loadedNoteIdRef.current = currentNote.id;
        loadedModifiedRef.current = currentNote.modified;
        lastSaveRef.current = null;
        if (needsSaveRef.current) {
          void flushPendingSave();
        }
        return;
      }
    }

    if (!isSameNote && needsSaveRef.current) {
      void flushPendingSave();
    }

    if (!isSameNote) {
      setSourceMode(false);
      if (sourceTimeoutRef.current) {
        clearTimeout(sourceTimeoutRef.current);
        sourceTimeoutRef.current = null;
      }
    }

    const isManualReload = reloadVersion !== lastReloadVersionRef.current;

    if (isSameNote) {
      if (isManualReload) {
        lastReloadVersionRef.current = reloadVersion;
        loadedModifiedRef.current = currentNote.modified;
        isLoadingRef.current = true;
        try {
          const parsed = parseEditorContent(currentEditor, currentNote.content);
          currentEditor.commands.setContent(parsed);
        } catch {
          currentEditor.commands.setContent(currentNote.content);
        }
        markNoteOpenTiming(currentNote.id, "editor content set");
        isLoadingRef.current = false;
        return;
      }

      loadedModifiedRef.current = currentNote.modified;
      return;
    }

    const isNewNote = loadedNoteIdRef.current === null;
    const wasEmpty = !isNewNote && currentNote.content.trim() === "";
    const loadingNoteId = currentNote.id;

    loadedNoteIdRef.current = loadingNoteId;
    loadedModifiedRef.current = currentNote.modified;
    isLoadingRef.current = true;

    currentEditor.commands.blur();

    try {
      const parsed = parseEditorContent(currentEditor, currentNote.content);
      currentEditor.commands.setContent(parsed);
    } catch {
      currentEditor.commands.setContent(currentNote.content);
    }
    markNoteOpenTiming(currentNote.id, "editor content set");

    scrollContainerRef.current?.scrollTo(0, 0);

    requestAnimationFrame(() => {
      if (loadedNoteIdRef.current !== loadingNoteId) {
        return;
      }

      scrollContainerRef.current?.scrollTo(0, 0);
      markNoteOpenTiming(loadingNoteId, "editor paint");

      isLoadingRef.current = false;

      if (consumePendingNewNote?.(loadingNoteId)) {
        provisionalFilenameNoteIdRef.current =
          isDefaultPlaceholderNoteId(loadingNoteId) ||
          isDuplicateDraftTitle(currentNote.title)
            ? loadingNoteId
            : null;
        if (!focusAndSelectTitle(currentEditor)) {
          currentEditor.commands.focus("start");
        }
        return;
      }

      provisionalFilenameNoteIdRef.current = null;

      if ((isNewNote || wasEmpty) && currentNote.content.trim() === "") {
        const noteListFocused =
          document.activeElement?.closest("[data-note-list]");
        if (!noteListFocused) {
          currentEditor.commands.focus("start");
          currentEditor.commands.selectAll();
        }
      }
    });
  }, [
    consumePendingNewNote,
    currentNote,
    editorReady,
    editorRef,
    flushPendingSave,
    focusAndSelectTitle,
    parseEditorContent,
    reloadVersion,
    scrollContainerRef,
  ]);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [scrollContainerRef]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (sourceTimeoutRef.current) {
        clearTimeout(sourceTimeoutRef.current);
      }
      if (needsSaveRef.current) {
        void flushPendingSave();
      }
    };
  }, [flushPendingSave]);

  return {
    effectiveSourceMode,
    finalizeProvisionalFilename,
    flushPendingSave,
    getMarkdown,
    handleSourceChange,
    isLoadingRef,
    isSaving,
    provisionalFilenameNoteIdRef,
    scheduleSave,
    sourceContent,
    toggleSourceMode,
  };
}
