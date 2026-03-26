import { describe, expect, it } from "vitest";
import { normalizeFontChoice, resolveFontFamily } from "./appearance";

describe("appearance font presets", () => {
  it("maps legacy preset ids to the current cross-platform presets", () => {
    expect(
      normalizeFontChoice(
        { kind: "preset", value: "inter" },
        "system-sans",
      ),
    ).toEqual({ kind: "preset", value: "system-sans" });

    expect(
      normalizeFontChoice(
        { kind: "preset", value: "charter" },
        "system-sans",
      ),
    ).toEqual({ kind: "preset", value: "reading-serif" });

    expect(
      normalizeFontChoice(
        { kind: "preset", value: "jetbrains-mono" },
        "system-mono",
      ),
    ).toEqual({ kind: "preset", value: "developer-mono" });
  });

  it("resolves the aliased preset stack instead of treating legacy ids as custom text", () => {
    expect(
      resolveFontFamily({ kind: "preset", value: "jetbrains-mono" }, "system-mono"),
    ).toContain("Consolas");
  });
});
