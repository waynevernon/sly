import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  searchEmojiShortcodes,
  type EmojiItem,
} from "../../lib/emoji";
import {
  EmojiSuggestionList,
  type EmojiSuggestionListRef,
} from "./EmojiSuggestionList";

const emojiSuggestionPluginKey = new PluginKey("emojiSuggestion");
const VALID_TRIGGER_PREFIXES = new Set(["", " ", "\n", "\t", "(", "[", "{"]);

export const EmojiSuggestion = Extension.create({
  name: "emojiSuggestion",

  addProseMirrorPlugins() {
    return [
      Suggestion<EmojiItem>({
        editor: this.editor,
        char: ":",
        pluginKey: emojiSuggestionPluginKey,
        allowSpaces: false,
        allowedPrefixes: null,
        startOfLine: false,

        allow: ({ editor, state, range }) => {
          const text = state.doc.textBetween(range.from, range.to, "", "");
          const query = text.startsWith(":") ? text.slice(1) : text;
          const prefix = state.doc.textBetween(
            Math.max(0, range.from - 1),
            range.from,
            "",
            "",
          );

          return (
            query.length > 0 &&
            VALID_TRIGGER_PREFIXES.has(prefix) &&
            !editor.isActive("codeBlock") &&
            !editor.isActive("frontmatter") &&
            !editor.isActive("code")
          );
        },

        items: ({ query }) => searchEmojiShortcodes(query, 10),

        command: ({ editor, range, props: item }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "emoji",
              attrs: { shortcode: item.shortcode },
            })
            .run();
        },

        render: () => {
          let component: ReactRenderer<EmojiSuggestionListRef> | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(EmojiSuggestionList, {
                props: {
                  items: props.items,
                  command: props.command,
                },
                editor: props.editor,
              });

              popup = tippy(document.body, {
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                offset: [0, 4],
                popperOptions: {
                  modifiers: [
                    {
                      name: "flip",
                      options: { fallbackPlacements: ["top-start"] },
                    },
                  ],
                },
              });
            },

            onUpdate: (props) => {
              component?.updateProps({
                items: props.items,
                command: props.command,
              });

              popup?.setProps({
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
              });
            },

            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                popup?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              popup?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
