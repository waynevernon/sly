import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import * as notesService from "../../services/notes";
import { Button, Input } from "../ui";
import { FolderIcon, FoldersIcon, ChevronRightIcon } from "../icons";


export function GeneralSettingsSection() {
  const { notesFolder, setNotesFolder } = useNotes();
  const { confirmDeletions, setConfirmDeletions } = useTheme();
  const [noteTemplate, setNoteTemplate] = useState<string>("Untitled");
  const [previewNoteName, setPreviewNoteName] = useState<string>("Untitled");

  // Load template from settings on mount
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const settings = await notesService.getSettings();
        const template = settings.defaultNoteName || "Untitled";
        setNoteTemplate(template);

        // Update preview
        const preview = await notesService.previewNoteName(template);
        setPreviewNoteName(preview);
      } catch (error) {
        console.error("Failed to load template:", error);
      }
    };
    loadTemplate();
  }, []);

  // Update preview when template changes (debounced)
  useEffect(() => {
    const updatePreview = async () => {
      try {
        const preview = await notesService.previewNoteName(noteTemplate);
        setPreviewNoteName(preview);
      } catch (error) {
        setPreviewNoteName("Invalid template");
      }
    };

    const timer = setTimeout(updatePreview, 300);
    return () => clearTimeout(timer);
  }, [noteTemplate]);

  const handleSaveTemplate = async () => {
    try {
      await notesService.patchSettings({
        defaultNoteName: noteTemplate || null,
      });
      toast.success("Default name saved");
    } catch (error) {
      console.error("Failed to save default name:", error);
      toast.error("Failed to save default name");
    }
  };

  const handleChangeFolder = async () => {
    try {
      const selected = await invoke<string | null>("open_folder_dialog", {
        defaultPath: notesFolder || null,
      });

      if (selected) {
        await setNotesFolder(selected);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
      toast.error("Failed to select folder");
    }
  };

  const handleOpenFolder = async () => {
    if (!notesFolder) return;
    try {
      await invoke("open_in_file_manager", { path: notesFolder });
    } catch (err) {
      console.error("Failed to open folder:", err);
      toast.error("Failed to open folder");
    }
  };

  // Format path for display - truncate middle if too long
  const formatPath = (path: string | null): string => {
    if (!path) return "Not set";
    const maxLength = 50;
    if (path.length <= maxLength) return path;

    // Show start and end of path
    const start = path.slice(0, 20);
    const end = path.slice(-25);
    return `${start}...${end}`;
  };

  return (
    <div className="space-y-10 pt-8 pb-10">
      {/* Folder Location */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium mb-0.5">Folder Location</h2>
        <p className="text-sm text-text-muted mb-4">
          Your notes are stored as markdown files in this folder
        </p>
        <div className="ui-settings-panel flex items-center gap-2.5 p-3 mb-2.5">
          <div className="p-2 rounded-[var(--ui-radius-md)] bg-bg-muted">
            <FolderIcon className="w-4.5 h-4.5 stroke-[1.5] text-text-muted" />
          </div>
          <p
            className="text-sm text-text-muted truncate"
            title={notesFolder || undefined}
          >
            {formatPath(notesFolder)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            onClick={handleChangeFolder}
            variant="outline"
            size="md"
            className="gap-1.25"
          >
            <FoldersIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            Change Folder
          </Button>
          {notesFolder && (
            <Button
              onClick={handleOpenFolder}
              variant="ghost"
              size="md"
              className="gap-1.25 text-text"
            >
              Open Folder
            </Button>
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="ui-settings-separator" />

      {/* New Note Template */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium mb-0.5">Default Note Name</h2>
        <p className="text-sm text-text-muted mb-4">
          Customize the default name when creating a new note
        </p>

        <div className="space-y-2">
          <div>
            <Input
              type="text"
              value={noteTemplate}
              onChange={(e) => setNoteTemplate(e.target.value)}
              onBlur={handleSaveTemplate}
              placeholder="Untitled"
            />
          </div>
          <div className="ui-settings-panel text-2xs text-text-muted font-mono px-3 py-2 mb-4">
            Preview: {previewNoteName}
          </div>

          {/* Template Tags Reference */}
          <details className="text-sm">
            <summary className="cursor-pointer text-text-muted hover:text-text select-none flex items-center gap-1 font-medium">
              <ChevronRightIcon className="w-3.5 h-3.5 stroke-2 transition-transform [[open]>&]:rotate-90" />
              Add template tags to your name
            </summary>
            <div className="mt-2 space-y-1.5 pl-2 text-text-muted">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                <code>{"{timestamp}"}</code>
                <span>1739586000</span>
                <code>{"{date}"}</code>
                <span>2026-02-15</span>
                <code>{"{time}"}</code>
                <span>14-30-45</span>
                <code>{"{year}"}</code>
                <span>2026</span>
                <code>{"{month}"}</code>
                <span>02</span>
                <code>{"{day}"}</code>
                <span>15</span>
                <code>{"{counter}"}</code>
                <span>1, 2, 3...</span>
              </div>
              <p className="text-xs mt-2 pt-2 border-t border-border">
                Examples: <code>Note-{"{year}-{month}-{day}"}</code>
              </p>
            </div>
          </details>
        </div>
      </section>

      <div className="ui-settings-separator" />

      {/* Deletion Behavior */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-6">
          <div className="flex flex-col gap-0.75">
            <h2 className="text-xl font-medium">Deletion</h2>
            <p className="text-sm text-text-muted max-w-lg">
              Show a confirmation dialog before permanently deleting notes or
              folders
            </p>
          </div>
          <div className="ui-settings-toggle-group">
            <Button
              onClick={() => setConfirmDeletions(false)}
              variant={!confirmDeletions ? "primary" : "ghost"}
              size="xs"
            >
              Off
            </Button>
            <Button
              onClick={() => setConfirmDeletions(true)}
              variant={confirmDeletions ? "primary" : "ghost"}
              size="xs"
            >
              On
            </Button>
          </div>
        </div>
      </section>

    </div>
  );
}
