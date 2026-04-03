import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEditor, ReactNodeViewRenderer, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DecorationSet, type EditorView } from "@tiptap/pm/view";
import { lowlight } from "./lowlight";
import { CodeBlockView } from "./CodeBlockView";
import { AdjacentListNormalizer } from "./AdjacentListNormalizer";
import { Frontmatter } from "./Frontmatter";
import { Emoji } from "./Emoji";
import { EmojiSuggestion } from "./EmojiSuggestion";
import { SlashCommand } from "./SlashCommand";
import { Wikilink } from "./Wikilink";
import { WikilinkSuggestion } from "./WikilinkSuggestion";
import { SlyBlockMath } from "./MathExtensions";

export const searchHighlightPluginKey = new PluginKey("searchHighlight");
export const persistedSelectionHighlightPluginKey = new PluginKey(
  "persistedSelectionHighlight",
);

export type SlyEditorPasteHandler = (
  view: EditorView,
  event: ClipboardEvent,
) => boolean;

interface SearchHighlightOptions {
  matches: Array<{ from: number; to: number }>;
  currentIndex: number;
}

const SearchHighlight = Extension.create<SearchHighlightOptions>({
  name: "searchHighlight",

  addOptions() {
    return {
      matches: [],
      currentIndex: 0,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, oldSet) => {
            const set = oldSet.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(searchHighlightPluginKey);
            if (meta !== undefined) {
              return meta.decorationSet;
            }

            return set;
          },
        },
        props: {
          decorations: (state) => {
            return searchHighlightPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

const PersistedSelectionHighlight = Extension.create({
  name: "persistedSelectionHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: persistedSelectionHighlightPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, oldSet) => {
            const set = oldSet.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(persistedSelectionHighlightPluginKey);
            if (meta !== undefined) {
              return meta.decorationSet;
            }

            return set;
          },
        },
        props: {
          decorations: (state) =>
            persistedSelectionHighlightPluginKey.getState(state),
        },
      }),
    ];
  },
});

export interface UseSlyEditorOptions {
  editorRef: MutableRefObject<TiptapEditor | null>;
  handleEditBlockMath: (pos: number) => void;
  handlePaste: SlyEditorPasteHandler;
  isLoadingRef: MutableRefObject<boolean>;
  katexMacros: Record<string, string>;
  onCreate?: (editor: TiptapEditor) => void;
  provisionalFilenameNoteIdRef: MutableRefObject<string | null>;
  scheduleSave: () => void;
  selectionIsInsideH1: (editor: TiptapEditor) => boolean;
  setSelectionKey: Dispatch<SetStateAction<number>>;
  textDirection: "auto" | "ltr" | "rtl";
  finalizeProvisionalFilename: () => Promise<void>;
}

export function useSlyEditor({
  editorRef,
  handleEditBlockMath,
  handlePaste,
  isLoadingRef,
  katexMacros,
  onCreate,
  provisionalFilenameNoteIdRef,
  scheduleSave,
  selectionIsInsideH1,
  setSelectionKey,
  textDirection,
  finalizeProvisionalFilename,
}: UseSlyEditorOptions) {
  return useEditor({
    textDirection,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: false,
        link: false,
      }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({
        lowlight,
        defaultLanguage: null,
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "underline cursor-pointer",
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TableKit.configure({
        table: {
          resizable: false,
          HTMLAttributes: {
            class: "not-prose",
          },
        },
      }),
      Frontmatter,
      Emoji,
      AdjacentListNormalizer,
      Markdown.configure({}),
      PersistedSelectionHighlight,
      SearchHighlight.configure({
        matches: [],
        currentIndex: 0,
      }),
      EmojiSuggestion,
      SlashCommand,
      Wikilink,
      WikilinkSuggestion,
      SlyBlockMath.configure({
        katexOptions: {
          throwOnError: false,
          displayMode: true,
          macros: katexMacros,
        },
        onClick: (_node, pos) => {
          handleEditBlockMath(pos);
        },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-lg dark:prose-invert max-w-3xl mx-auto focus:outline-none min-h-full px-6 pt-8 pb-24",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Tab") {
          return false;
        }
        return false;
      },
      handlePaste,
    },
    onCreate: ({ editor: editorInstance }) => {
      editorRef.current = editorInstance;
      onCreate?.(editorInstance);
    },
    onUpdate: () => {
      if (isLoadingRef.current) return;
      scheduleSave();
    },
    onSelectionUpdate: () => {
      setSelectionKey((k) => k + 1);
      if (
        provisionalFilenameNoteIdRef.current &&
        editorRef.current &&
        !selectionIsInsideH1(editorRef.current)
      ) {
        void finalizeProvisionalFilename();
      }
    },
    onBlur: () => {
      if (provisionalFilenameNoteIdRef.current) {
        void finalizeProvisionalFilename();
      }
    },
    immediatelyRender: false,
  });
}
