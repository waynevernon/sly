import { describe, expect, it } from "vitest";
import {
  extractOutlineItems,
  findActiveOutlineFromHeadingTops,
  findActiveOutlineFromSelection,
} from "./rightPanelOutline";

function makeDoc(
  entries: Array<{
    pos: number;
    level?: number;
    text?: string;
    type?: string;
    children?: Array<{ type?: string; text?: string; shortcode?: string }>;
  }>,
) {
  return {
    descendants: (
      callback: (
        node: {
          type: { name: string };
          attrs: { level?: number; shortcode?: string };
          textContent: string;
          isText?: boolean;
          text?: string;
          descendants: (
            childCallback: (child: {
              type: { name: string };
              attrs: { shortcode?: string };
              isText?: boolean;
              text?: string;
            }) => boolean | void,
          ) => void;
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
            descendants: (childCallback) => {
              const children =
                entry.children ??
                (entry.text
                  ? [{ type: "text", text: entry.text }]
                  : []);

              for (const child of children) {
                childCallback({
                  type: { name: child.type ?? "text" },
                  attrs: { shortcode: child.shortcode },
                  isText: (child.type ?? "text") === "text",
                  text: child.text,
                });
              }
            },
          },
          entry.pos,
        );
      }
    },
  } as never;
}

describe("rightPanelOutline", () => {
  it("extracts only non-empty H1-H6 headings", () => {
    const items = extractOutlineItems(
      makeDoc([
        {
          pos: 0,
          level: 1,
          children: [
            { text: "Title " },
            { type: "emoji", shortcode: "rocket" },
          ],
        },
        { pos: 8, level: 2, text: "Section" },
        { pos: 20, level: 3, text: "Subsection" },
        { pos: 36, level: 6, text: "Deep" },
        { pos: 44, level: 2, text: "   " },
        { pos: 50, type: "paragraph", text: "Body" },
      ]),
    );

    expect(items).toEqual([
      { id: "0", pos: 0, level: 1, text: "Title 🚀" },
      { id: "8", pos: 8, level: 2, text: "Section" },
      { id: "20", pos: 20, level: 3, text: "Subsection" },
      { id: "36", pos: 36, level: 6, text: "Deep" },
    ]);
  });

  it("renders literal shortcode text as emoji in outline labels", () => {
    const items = extractOutlineItems(
      makeDoc([{ pos: 0, level: 2, text: "Ship it :rocket:" }]),
    );

    expect(items).toEqual([
      { id: "0", pos: 0, level: 2, text: "Ship it 🚀" },
    ]);
  });

  it("finds the active outline item from selection", () => {
    const items = [
      { id: "0", pos: 0, level: 1, text: "Title" },
      { id: "8", pos: 8, level: 2, text: "Section" },
      { id: "20", pos: 20, level: 3, text: "Subsection" },
      { id: "36", pos: 36, level: 4, text: "Detail" },
    ];

    expect(findActiveOutlineFromSelection(items, 5)?.id).toBe("0");
    expect(findActiveOutlineFromSelection(items, 22)?.id).toBe("20");
  });

  it("finds the active outline item from heading tops", () => {
    const items = [
      { id: "0", pos: 0, level: 1, text: "Title" },
      { id: "8", pos: 8, level: 2, text: "Section" },
      { id: "20", pos: 20, level: 3, text: "Subsection" },
      { id: "36", pos: 36, level: 4, text: "Detail" },
    ];

    expect(
      findActiveOutlineFromHeadingTops(
        [
          { item: items[0], top: -180 },
          { item: items[1], top: -120 },
          { item: items[2], top: 40 },
          { item: items[3], top: 180 },
        ],
        72,
      )?.id,
    ).toBe("20");

    expect(
      findActiveOutlineFromHeadingTops(
        [
          { item: items[0], top: 100 },
          { item: items[1], top: 220 },
        ],
        72,
      )?.id,
    ).toBe("0");
  });
});
