import { useState, useCallback, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { Editor, type PreviewModeData } from "../editor/Editor";
import * as filesService from "../../services/files";
import * as notesService from "../../services/notes";
import { DetachedEditorWindow } from "./DetachedEditorWindow";

interface PreviewAppProps {
  filePath: string;
  presentation?: "interactive" | "print";
}

export function PreviewApp({
  filePath,
  presentation = "interactive",
}: PreviewAppProps) {
  const [content, setContent] = useState<string | null>(null);
  const [notesFolder, setNotesFolder] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [modified, setModified] = useState(0);
  const [hasExternalChanges, setHasExternalChanges] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const recentlySavedRef = useRef(false);

  // Load file on mount
  useEffect(() => {
    Promise.all([
      filesService.readFileDirect(filePath),
      notesService.getNotesFolder().catch(() => null),
    ])
      .then(([result, activeNotesFolder]) => {
        setContent(result.content);
        setTitle(result.title);
        setModified(result.modified);
        setNotesFolder(activeNotesFolder);
      })
      .catch((error) => {
        console.error("Failed to load file:", error);
        toast.error(`Failed to load file: ${error}`);
      });
  }, [filePath]);

  // Listen for window focus to detect external changes
  useEffect(() => {
    const handleFocus = async () => {
      if (recentlySavedRef.current) {
        recentlySavedRef.current = false;
        return;
      }
      try {
        const result = await filesService.readFileDirect(filePath);
        if (result.modified !== modified && content !== null) {
          setHasExternalChanges(true);
        }
      } catch {
        // File may have been deleted
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [filePath, modified, content]);

  const save = useCallback(
    async (newContent: string) => {
      try {
        const result = await filesService.saveFileDirect(filePath, newContent);
        recentlySavedRef.current = true;
        setContent(result.content);
        setModified(result.modified);
        setTitle(result.title);
        setHasExternalChanges(false);
      } catch (error) {
        console.error("Failed to save file:", error);
        toast.error(`Failed to save: ${error}`);
      }
    },
    [filePath],
  );

  const reload = useCallback(async () => {
    try {
      const result = await filesService.readFileDirect(filePath);
      setContent(result.content);
      setTitle(result.title);
      setModified(result.modified);
      setHasExternalChanges(false);
      setReloadVersion((v) => v + 1);
    } catch (error) {
      console.error("Failed to reload file:", error);
      toast.error(`Failed to reload: ${error}`);
    }
  }, [filePath]);

  // Listen for preview-file-change events
  useEffect(() => {
    const unlisten = listen<string>("preview-file-change", () => {
      setHasExternalChanges(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSaveToFolder = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await filesService.importFileToFolder(filePath);
      // Backend emits select-note + focuses main window; close this preview
      await getCurrentWindow().close();
    } catch (error) {
      console.error("Failed to save to folder:", error);
      toast.error(`Failed to save to folder: ${error}`);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [filePath]);

  const previewData: PreviewModeData = {
    content,
    title,
    filePath,
    notesFolder,
    modified,
    hasExternalChanges,
    reloadVersion,
    save,
    reload,
  };

  return (
    <DetachedEditorWindow
      presentation={presentation}
      onReload={reload}
    >
      {({ focusMode, isPrint, onEditorReady }) => (
        <Editor
          focusMode={focusMode}
          previewMode={previewData}
          printMode={isPrint}
          onEditorReady={onEditorReady}
          onSaveToFolder={!isPrint ? handleSaveToFolder : undefined}
          saveToFolderDisabled={!isPrint ? isSaving : undefined}
        />
      )}
    </DetachedEditorWindow>
  );
}
