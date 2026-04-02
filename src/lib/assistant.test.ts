import { describe, expect, it } from "vitest";
import {
  applyLineReplacement,
  buildAssistantDocumentContext,
  getAutoAssistantScope,
  hashText,
  isProposalRangeWithinScope,
} from "./assistant";

function makeDoc(
  entries: Array<{
    pos: number;
    level?: number;
    text?: string;
    type?: string;
  }>,
  selectionTextByRange: Record<string, string> = {},
) {
  return {
    descendants: (
      callback: (
        node: {
          type: { name: string };
          attrs: { level?: number };
          textContent: string;
        },
        pos: number,
      ) => boolean | void,
    ) => {
      for (const entry of entries) {
        callback(
          {
            type: { name: entry.type ?? "heading" },
            attrs: { level: entry.level },
            textContent: entry.text ?? "",
            descendants: (
              childCallback: (child: {
                type: { name: string };
                attrs: { shortcode?: string };
                isText?: boolean;
                text?: string;
              }) => boolean | void,
            ) => {
              if (entry.text) {
                childCallback({
                  type: { name: "text" },
                  attrs: {},
                  isText: true,
                  text: entry.text,
                });
              }
            },
          } as never,
          entry.pos,
        );
      }
    },
    textBetween: (from: number, to: number) => selectionTextByRange[`${from}:${to}`] ?? "",
  } as never;
}

describe("assistant helpers", () => {
  it("builds whole-note numbered context", () => {
    const context = buildAssistantDocumentContext(
      "# Title\n\nBody",
      null,
      "note",
    );

    expect(context.scopeLabel).toBe("Whole note");
    expect(context.lineLabel).toBe("Lines 1-3");
    expect(context.numberedContent).toContain("1 | # Title");
    expect(context.numberedContent).toContain("3 | Body");
  });

  it("scopes the current section from heading order", () => {
    const editor = {
      state: {
        doc: makeDoc([
          { pos: 0, level: 1, text: "Title" },
          { pos: 20, level: 2, text: "Intro" },
          { pos: 40, type: "paragraph", text: "Body" },
          { pos: 60, level: 2, text: "Next" },
        ]),
        selection: { from: 30, to: 30, empty: true },
      },
    } as never;

    const context = buildAssistantDocumentContext(
      "# Title\n\n## Intro\nIntro body\n\n## Next\nNext body",
      editor,
      "section",
    );

    expect(context.effectiveScope).toBe("section");
    expect(context.scopeLabel).toBe("Section: Intro");
    expect(context.startLine).toBe(3);
    expect(context.endLine).toBe(5);
    expect(context.numberedContent).toContain("3 | ## Intro");
    expect(context.numberedContent).toContain("4 | Intro body");
  });

  it("uses a unique selection line range when available", () => {
    const editor = {
      state: {
        doc: makeDoc(
          [
            { pos: 0, level: 1, text: "Title" },
            { pos: 20, level: 2, text: "Intro" },
          ],
          { "4:14": "Specific sentence" },
        ),
        selection: { from: 4, to: 14, empty: false },
      },
    } as never;

    const context = buildAssistantDocumentContext(
      "# Title\n\n## Intro\nSpecific sentence\n\nAnother line",
      editor,
      "selection",
    );

    expect(context.effectiveScope).toBe("selection");
    expect(context.startLine).toBe(4);
    expect(context.endLine).toBe(4);
    expect(context.notice).toBeUndefined();
  });

  it("prefers the current section when the same text exists elsewhere", () => {
    const editor = {
      state: {
        doc: makeDoc(
          [
            { pos: 0, level: 1, text: "Title" },
            { pos: 20, level: 2, text: "Intro" },
            { pos: 60, level: 2, text: "Next" },
          ],
          { "30:40": "Repeated line" },
        ),
        selection: { from: 30, to: 40, empty: false },
      },
    } as never;

    const context = buildAssistantDocumentContext(
      "# Title\n\n## Intro\nRepeated line\n\n## Next\nRepeated line",
      editor,
      "selection",
    );

    expect(context.effectiveScope).toBe("selection");
    expect(context.startLine).toBe(4);
    expect(context.endLine).toBe(4);
    expect(context.notice).toBeUndefined();
  });

  it("falls back from ambiguous selection to the current section", () => {
    const editor = {
      state: {
        doc: makeDoc(
          [
            { pos: 0, level: 1, text: "Title" },
            { pos: 20, level: 2, text: "Intro" },
          ],
          { "30:40": "Repeated line" },
        ),
        selection: { from: 30, to: 40, empty: false },
      },
    } as never;

    const context = buildAssistantDocumentContext(
      "# Title\n\n## Intro\nRepeated line\n\nRepeated line",
      editor,
      "selection",
    );

    expect(context.effectiveScope).toBe("section");
    expect(context.scopeLabel).toBe("Section: Intro");
    expect(context.notice).toContain("Selection could not be mapped");
  });

  it("applies line replacements against the full markdown snapshot", () => {
    expect(
      applyLineReplacement("a\nb\nc\nd", 2, 3, "x\ny"),
    ).toBe("a\nx\ny\nd");
  });

  it("derives selection as the auto scope when a meaningful selection exists", () => {
    const editor = {
      state: {
        doc: makeDoc([], { "4:14": "Specific sentence" }),
        selection: { from: 4, to: 14, empty: false },
      },
    } as never;

    expect(getAutoAssistantScope(editor)).toBe("selection");
  });

  it("derives note as the auto scope when there is no meaningful selection", () => {
    const editor = {
      state: {
        doc: makeDoc([]),
        selection: { from: 4, to: 4, empty: true },
      },
    } as never;

    expect(getAutoAssistantScope(editor)).toBe("note");
  });

  it("validates proposal ranges against the original scoped excerpt", () => {
    expect(isProposalRangeWithinScope(4, 6, 4, 6)).toBe(true);
    expect(isProposalRangeWithinScope(3, 6, 4, 6)).toBe(false);
    expect(isProposalRangeWithinScope(4, 7, 4, 6)).toBe(false);
  });

  it("hashes text deterministically", () => {
    expect(hashText("alpha")).toBe(hashText("alpha"));
    expect(hashText("alpha")).not.toBe(hashText("beta"));
  });
});
