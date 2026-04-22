import { describe, expect, it } from "vitest";
import { isAddLinkShortcut } from "./shortcutUtils";

describe("isAddLinkShortcut", () => {
  it("matches plain Cmd/Ctrl+K", () => {
    expect(
      isAddLinkShortcut({
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        key: "k",
      }),
    ).toBe(true);
  });

  it("does not match Cmd/Ctrl+Shift+K", () => {
    expect(
      isAddLinkShortcut({
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        key: "K",
      }),
    ).toBe(false);
  });

  it("does not match when Alt is also held", () => {
    expect(
      isAddLinkShortcut({
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        key: "k",
      }),
    ).toBe(false);
  });
});
