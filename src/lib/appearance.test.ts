import { describe, expect, it } from "vitest";
import {
  CODE_FONT_PRESET_IDS,
  DEFAULT_APPEARANCE_SETTINGS,
  FONT_PRESETS,
  getFontPresetOptionLabel,
  NOTE_FONT_PRESET_IDS,
  UI_FONT_PRESET_IDS,
} from "./appearance";

describe("appearance font presets", () => {
  it("uses the bundled fonts as the default appearance baseline", () => {
    expect(DEFAULT_APPEARANCE_SETTINGS.uiFont).toEqual({
      kind: "preset",
      value: "inter",
    });
    expect(DEFAULT_APPEARANCE_SETTINGS.noteFont).toEqual({
      kind: "preset",
      value: "atkinson-hyperlegible-next",
    });
    expect(DEFAULT_APPEARANCE_SETTINGS.codeFont).toEqual({
      kind: "preset",
      value: "jetbrains-mono",
    });
    expect(DEFAULT_APPEARANCE_SETTINGS.noteTypography.baseFontSize).toBe(16);
    expect(DEFAULT_APPEARANCE_SETTINGS.noteTypography.lineHeight).toBe(1.5);
  });

  it("keeps the bundled fonts at the top of each picker in role-specific order", () => {
    expect(UI_FONT_PRESET_IDS.slice(0, 3)).toEqual([
      "inter",
      "atkinson-hyperlegible-next",
      "jetbrains-mono",
    ]);
    expect(NOTE_FONT_PRESET_IDS.slice(0, 3)).toEqual([
      "atkinson-hyperlegible-next",
      "inter",
      "jetbrains-mono",
    ]);
    expect(CODE_FONT_PRESET_IDS.slice(0, 3)).toEqual([
      "jetbrains-mono",
      "inter",
      "atkinson-hyperlegible-next",
    ]);
  });

  it("renders system presets with system-prefixed labels", () => {
    expect(FONT_PRESETS["system-sans"].label).toBe("System Sans");
    expect(FONT_PRESETS["system-serif"].label).toBe("System Serif");
    expect(FONT_PRESETS["system-mono"].label).toBe("System Mono");
  });

  it("marks only the configured default option with the default suffix", () => {
    expect(getFontPresetOptionLabel("inter", "inter")).toBe("Inter (Default)");
    expect(
      getFontPresetOptionLabel(
        "atkinson-hyperlegible-next",
        "atkinson-hyperlegible-next",
      ),
    ).toBe("Atkinson Hyperlegible Next (Default)");
    expect(getFontPresetOptionLabel("jetbrains-mono", "jetbrains-mono")).toBe(
      "JetBrains Mono (Default)",
    );
    expect(getFontPresetOptionLabel("system-sans", "inter")).toBe("System Sans");
  });
});
