import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { searchHighlightPluginKey } from "./useSlyEditor";

interface UseEditorSearchOptions {
  currentNoteId: string | null;
  editor: TiptapEditor | null;
}

export function useEditorSearch({
  currentNoteId,
  editor,
}: UseEditorSearchOptions) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<
    Array<{ from: number; to: number }>
  >([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const findMatches = useCallback(
    (query: string, editorInstance: TiptapEditor | null) => {
      if (!editorInstance || !query.trim()) return [];

      const doc = editorInstance.state.doc;
      const lowerQuery = query.toLowerCase();
      const matches: Array<{ from: number; to: number }> = [];

      doc.descendants((node, nodePos) => {
        if (node.isText && node.text) {
          const lowerText = node.text.toLowerCase();

          let searchPos = 0;
          while (searchPos < lowerText.length && matches.length < 500) {
            const index = lowerText.indexOf(lowerQuery, searchPos);
            if (index === -1) break;

            const matchFrom = nodePos + index;
            const matchTo = matchFrom + query.length;

            if (matchTo <= doc.content.size) {
              matches.push({ from: matchFrom, to: matchTo });
            }

            searchPos = index + 1;
          }
        }
      });

      return matches;
    },
    [],
  );

  const updateSearchDecorations = useCallback(
    (
      matches: Array<{ from: number; to: number }>,
      currentIndex: number,
      editorInstance: TiptapEditor | null,
    ) => {
      if (!editorInstance) return;

      try {
        const { state } = editorInstance;
        const decorations: Decoration[] = [];

        matches.forEach((match, index) => {
          const isActive = index === currentIndex;
          decorations.push(
            Decoration.inline(match.from, match.to, {
              class: isActive
                ? "bg-yellow-300/50 dark:bg-yellow-400/40"
                : "bg-yellow-300/25 dark:bg-yellow-400/20",
            }),
          );
        });

        const decorationSet = DecorationSet.create(state.doc, decorations);
        const tr = state.tr.setMeta(searchHighlightPluginKey, {
          decorationSet,
        });

        editorInstance.view.dispatch(tr);

        if (matches[currentIndex]) {
          const match = matches[currentIndex];
          const { node } = editorInstance.view.domAtPos(match.from);
          const element =
            node.nodeType === Node.ELEMENT_NODE
              ? (node as HTMLElement)
              : node.parentElement;

          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      } catch (error) {
        console.error("Failed to update search decorations:", error);
      }
    },
    [],
  );

  const openEditorSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    updateSearchDecorations(searchMatches, nextIndex, editor);
  }, [currentMatchIndex, editor, searchMatches, updateSearchDecorations]);

  const goToPreviousMatch = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;
    const prevIndex =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    updateSearchDecorations(searchMatches, prevIndex, editor);
  }, [currentMatchIndex, editor, searchMatches, updateSearchDecorations]);

  const clearSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchMatches([]);
    setCurrentMatchIndex(0);
    if (editor) {
      updateSearchDecorations([], 0, editor);
      editor.commands.focus();
    }
  }, [editor, updateSearchDecorations]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      if (editor) {
        updateSearchDecorations([], 0, editor);
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!editor) return;
      const matches = findMatches(searchQuery, editor);
      setSearchMatches(matches);
      setCurrentMatchIndex(0);
      updateSearchDecorations(matches, 0, editor);
    }, 150);

    return () => clearTimeout(timer);
  }, [editor, findMatches, searchQuery, updateSearchDecorations]);

  useEffect(() => {
    if (currentNoteId) {
      setSearchOpen(false);
      setSearchQuery("");
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      if (editor) {
        updateSearchDecorations([], 0, editor);
      }
    }
  }, [currentNoteId, editor, updateSearchDecorations]);

  return {
    clearSearch,
    currentMatchIndex,
    goToNextMatch,
    goToPreviousMatch,
    handleSearchChange,
    openEditorSearch,
    searchInputRef,
    searchMatches,
    searchOpen,
    searchQuery,
  };
}
