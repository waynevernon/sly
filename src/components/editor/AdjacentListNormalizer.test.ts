import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { afterEach, describe, expect, it } from "vitest";
import {
  AdjacentListNormalizer,
  joinAdjacentListsAroundSeparator,
} from "./AdjacentListNormalizer";

describe("AdjacentListNormalizer", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function createEditor(content: object) {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        StarterKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        AdjacentListNormalizer,
        Markdown.configure({}),
      ],
      content,
    });

    return editor;
  }

  function setSelectionInFirstEmptyParagraph(targetEditor: Editor) {
    let targetPos: number | null = null;

    targetEditor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && node.content.size === 0) {
        targetPos = pos + 1;
        return false;
      }

      return true;
    });

    if (targetPos === null) {
      throw new Error("Expected an empty paragraph in the test document.");
    }

    targetEditor.commands.setTextSelection(targetPos);
  }

  it("merges split bullet lists on Backspace and keeps the caret near the join", () => {
    const targetEditor = createEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
      ],
    });

    setSelectionInFirstEmptyParagraph(targetEditor);

    expect(joinAdjacentListsAroundSeparator(targetEditor, "backward")).toBe(
      true,
    );
    expect(targetEditor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
      ],
    });
    expect(targetEditor.state.selection.$anchor.parent.textContent).toBe("first");
    expect(targetEditor.state.selection.$anchor.parentOffset).toBe(5);
  });

  it("merges split bullet lists on Delete and keeps the caret at the next item", () => {
    const targetEditor = createEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
      ],
    });

    setSelectionInFirstEmptyParagraph(targetEditor);

    expect(joinAdjacentListsAroundSeparator(targetEditor, "forward")).toBe(true);
    expect(targetEditor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
      ],
    });
    expect(targetEditor.state.selection.$anchor.parent.textContent).toBe("second");
    expect(targetEditor.state.selection.$anchor.parentOffset).toBe(0);
  });

  it("merges split nested bullet lists inside a parent list item", () => {
    const targetEditor = createEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "parent" }],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "child a" }],
                        },
                      ],
                    },
                  ],
                },
                { type: "paragraph" },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "child b" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setSelectionInFirstEmptyParagraph(targetEditor);

    expect(targetEditor.commands.keyboardShortcut("Backspace")).toBe(true);
    expect(targetEditor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "parent" }],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "child a" }],
                        },
                      ],
                    },
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "child b" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
      ],
    });
  });

  it("leaves Enter behavior unchanged for an empty middle bullet", () => {
    const targetEditor = createEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph" }],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
      ],
    });

    setSelectionInFirstEmptyParagraph(targetEditor);

    expect(targetEditor.commands.keyboardShortcut("Enter")).toBe(true);
    expect(targetEditor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
      ],
    });
    expect(targetEditor.state.selection.$anchor.parent.type.name).toBe(
      "paragraph",
    );
    expect(targetEditor.state.selection.$anchor.parentOffset).toBe(0);
  });

  it("removes the parsed blank separator inside the previous list item on Backspace", () => {
    const targetEditor = createEditor({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
                { type: "paragraph" },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
      ],
    });

    setSelectionInFirstEmptyParagraph(targetEditor);

    expect(targetEditor.commands.keyboardShortcut("Backspace")).toBe(true);
    expect(targetEditor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
      ],
    });
  });
});
