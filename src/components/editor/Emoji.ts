import {
  InputRule,
  Node,
  type JSONContent,
  type MarkdownToken,
} from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import {
  getEmojiForShortcode,
  isEmojiShortcode,
  normalizeEmojiShortcode,
} from "../../lib/emoji";

const EMOJI_MARKDOWN_REGEX = /^:([+\-\w]+):/;
const EMOJI_INPUT_RULE_REGEX = /(^|[\s(\[{])(:[+\-\w]+:)$/;

export const Emoji = Node.create({
  name: "emoji",

  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      shortcode: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-emoji-shortcode"),
        renderHTML: (attributes) => ({
          "data-emoji-shortcode": attributes.shortcode,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-emoji-shortcode]" }];
  },

  renderHTML({ node }) {
    const shortcode = node.attrs.shortcode ?? "";
    const emoji = getEmojiForShortcode(shortcode) ?? `:${shortcode}:`;

    return [
      "span",
      {
        "data-emoji-shortcode": shortcode,
        title: `:${shortcode}:`,
      },
      emoji,
    ];
  },

  renderText({ node }) {
    const shortcode = node.attrs.shortcode ?? "";
    return getEmojiForShortcode(shortcode) ?? `:${shortcode}:`;
  },

  markdownTokenName: "emoji",

  markdownTokenizer: {
    name: "emoji",
    level: "inline" as const,
    start: ":",
    tokenize(src: string, _tokens: MarkdownToken[]) {
      const match = src.match(EMOJI_MARKDOWN_REGEX);
      if (!match) return undefined;

      const shortcode = normalizeEmojiShortcode(match[1]);
      if (!isEmojiShortcode(shortcode)) return undefined;

      return {
        type: "emoji",
        raw: match[0],
        text: shortcode,
      };
    },
  },

  parseMarkdown(token: MarkdownToken, helpers) {
    const shortcode = normalizeEmojiShortcode(token.text ?? token.raw ?? "");
    return helpers.createNode("emoji", { shortcode });
  },

  renderMarkdown(node: JSONContent) {
    const shortcode = node.attrs?.shortcode ?? "";
    return `:${shortcode}:`;
  },

  addInputRules() {
    return [
      new InputRule({
        find: EMOJI_INPUT_RULE_REGEX,
        handler: ({ state, range, match }) => {
          const prefix = match[1] ?? "";
          const shortcode = normalizeEmojiShortcode(match[2] ?? "");

          if (!isEmojiShortcode(shortcode)) return;

          const nodes = [];

          if (prefix) {
            nodes.push(state.schema.text(prefix));
          }

          nodes.push(this.type.create({ shortcode }));
          state.tr.replaceWith(range.from, range.to, Fragment.fromArray(nodes));
        },
      }),
    ];
  },
});
