import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { cn } from "../../lib/utils";

interface DetachedEditorWindowProps {
  presentation: "interactive" | "print";
  onReload?: () => void | Promise<void>;
  children: (props: {
    focusMode: boolean;
    isPrint: boolean;
    onEditorReady: (editor: TiptapEditor | null) => void;
  }) => ReactNode;
}

export function DetachedEditorWindow({
  presentation,
  onReload,
  children,
}: DetachedEditorWindowProps) {
  const [focusMode, setFocusMode] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const isPrint = presentation === "print";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;

      if (!isPrint && modKey && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        setFocusMode((prev) => !prev);
        return;
      }

      if (!isPrint && modKey && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-source-mode"));
        return;
      }

      if (!isPrint && modKey && e.key === "r") {
        e.preventDefault();
        void onReload?.();
        return;
      }

      if (!isPrint && e.key === "Escape" && focusMode) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }

      if (!isPrint && e.key === "Tab") {
        const active = document.activeElement;
        const editorEl = document.querySelector(".ProseMirror");
        if (editorEl && active && editorEl.contains(active)) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusMode, isPrint, onReload]);

  useEffect(() => {
    if (!isPrint || !editorReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.print();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [editorReady, isPrint]);

  useEffect(() => {
    if (!isPrint) {
      return;
    }

    const handleAfterPrint = () => {
      void getCurrentWindow().close().catch((error) => {
        console.error("Failed to close print window:", error);
      });
    };

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [isPrint]);

  return (
    <div
      className={cn(
        "h-screen flex flex-col bg-bg text-text",
        isPrint && "print-note-shell min-h-screen h-auto",
      )}
    >
      {children({
        focusMode: isPrint ? true : focusMode,
        isPrint,
        onEditorReady: (editor) => setEditorReady(editor !== null),
      })}
    </div>
  );
}
