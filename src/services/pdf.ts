import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { sanitizeMarkdownExportFilename } from "../lib/exportFilename";

/**
 * Opens a dedicated print window for the current note.
 * Users can save as PDF or print to a physical printer.
 *
 * @param notePath - Absolute path to the note on disk
 */
export async function downloadPdf(notePath: string): Promise<void> {
  if (!notePath) throw new Error("Note path not available");
  await invoke("open_print_preview", { path: notePath });
}

/**
 * Downloads the markdown content as a .md file.
 *
 * @param markdown - The markdown content to save
 * @param noteTitle - The note title for the default filename
 * @returns Promise<boolean> - Returns true if file was saved successfully, false if user cancelled
 */
export async function downloadMarkdown(
  markdown: string,
  noteTitle: string
): Promise<boolean> {
  const sanitizedTitle = sanitizeMarkdownExportFilename(noteTitle);

  // Show native save dialog
  const filePath = await save({
    defaultPath: `${sanitizedTitle}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!filePath) return false; // User cancelled

  // Convert string to bytes and write file using Tauri command
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(markdown);
  await invoke("write_markdown_export", {
    path: filePath,
    contents: Array.from(uint8Array)
  });

  return true;
}
