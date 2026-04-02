import { describe, expect, it } from "vitest";
import { shouldShowPendingSelectionSpinner } from "./editorState";

describe("shouldShowPendingSelectionSpinner", () => {
  it("returns false when no note is selected", () => {
    expect(shouldShowPendingSelectionSpinner(null, [])).toBe(false);
  });

  it("returns true while the selected note still exists", () => {
    expect(
      shouldShowPendingSelectionSpinner("alpha", [
        {
          id: "alpha",
          title: "Alpha",
          preview: "",
          modified: 1,
          created: 1,
        },
      ]),
    ).toBe(true);
  });

  it("returns false for stale selections that no longer exist", () => {
    expect(
      shouldShowPendingSelectionSpinner("missing", [
        {
          id: "alpha",
          title: "Alpha",
          preview: "",
          modified: 1,
          created: 1,
        },
      ]),
    ).toBe(false);
  });

  it("preserves the loading spinner when note metadata is unavailable", () => {
    expect(shouldShowPendingSelectionSpinner("alpha", undefined)).toBe(true);
  });
});
