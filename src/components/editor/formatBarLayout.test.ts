import { describe, expect, it } from "vitest";
import { computeFormatBarLayout } from "./formatBarLayout";

describe("computeFormatBarLayout", () => {
  it("keeps everything visible when the measured slots fit", () => {
    const result = computeFormatBarLayout({
      slots: [{ key: "bold" }, { key: "italic" }, { key: "sep" }],
      slotWidths: {
        bold: 28,
        italic: 28,
        sep: 17,
      },
      availableWidth: 81,
      overflowTriggerWidth: 28,
      gap: 4,
    });

    expect(result).toEqual({ allFit: true, splitAt: 3 });
  });

  it("reserves room for the overflow trigger and its preceding gap", () => {
    const result = computeFormatBarLayout({
      slots: [{ key: "bold" }, { key: "italic" }, { key: "strike" }],
      slotWidths: {
        bold: 28,
        italic: 28,
        strike: 28,
      },
      availableWidth: 88,
      overflowTriggerWidth: 28,
      gap: 4,
    });

    expect(result).toEqual({ allFit: false, splitAt: 1 });
  });

  it("can collapse entirely into the overflow menu when space is too tight", () => {
    const result = computeFormatBarLayout({
      slots: [{ key: "bold" }, { key: "italic" }],
      slotWidths: {
        bold: 28,
        italic: 28,
      },
      availableWidth: 24,
      overflowTriggerWidth: 28,
      gap: 4,
    });

    expect(result).toEqual({ allFit: false, splitAt: 0 });
  });
});
