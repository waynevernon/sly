import { describe, expect, it } from "vitest";
import { shouldParseMarkdownPaste } from "./markdownPaste";

describe("shouldParseMarkdownPaste", () => {
  it("ignores markdown-looking text when rich html is present", () => {
    expect(
      shouldParseMarkdownPaste({
        html: "<ul><li>Copied item</li></ul>",
        text: "- Copied item",
      }),
    ).toBe(false);
  });

  it("does not auto-parse a single bullet line", () => {
    expect(
      shouldParseMarkdownPaste({
        html: "",
        text: "- Copied item",
      }),
    ).toBe(false);
  });

  it("parses multiline bullet lists from plain text", () => {
    expect(
      shouldParseMarkdownPaste({
        html: "",
        text: "- First\n- Second",
      }),
    ).toBe(true);
  });

  it("parses fenced code blocks from plain text", () => {
    expect(
      shouldParseMarkdownPaste({
        html: "",
        text: "```ts\nconst answer = 42\n```",
      }),
    ).toBe(true);
  });

  it("ignores normal multiline plain text", () => {
    expect(
      shouldParseMarkdownPaste({
        html: "",
        text: "First line\nSecond line",
      }),
    ).toBe(false);
  });
});
