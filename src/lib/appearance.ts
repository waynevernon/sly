import type {
  AppearanceSettings,
  FontChoice,
  FontPresetId,
  NoteTypographySettings,
  ThemeColors,
  ThemeMode,
  ThemePresetId,
} from "../types/note";

export interface FontPreset {
  id: FontPresetId;
  label: string;
  stack: string;
}

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  mode: Exclude<ThemeMode, "system">;
  tokens: ThemeColors;
}

export const DEFAULT_NOTE_TYPOGRAPHY: NoteTypographySettings = {
  baseFontSize: 15,
  boldWeight: 600,
  lineHeight: 1.6,
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  mode: "system",
  lightPresetId: "github-light-default",
  darkPresetId: "github-dark-default",
  uiFont: { kind: "preset", value: "system-sans" },
  noteFont: { kind: "preset", value: "system-sans" },
  codeFont: { kind: "preset", value: "system-mono" },
  noteTypography: DEFAULT_NOTE_TYPOGRAPHY,
  textDirection: "auto",
  editorWidth: "normal",
  interfaceZoom: 1,
};

export const FONT_PRESETS: Record<FontPresetId, FontPreset> = {
  "system-sans": {
    id: "system-sans",
    label: "System Sans",
    stack:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  "system-serif": {
    id: "system-serif",
    label: "System Serif",
    stack: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  "system-mono": {
    id: "system-mono",
    label: "System Mono",
    stack:
      'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, "Courier New", monospace',
  },
  inter: {
    id: "inter",
    label: "Inter",
    stack:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  "atkinson-hyperlegible": {
    id: "atkinson-hyperlegible",
    label: "Atkinson Hyperlegible",
    stack:
      '"Atkinson Hyperlegible", "Atkinson Hyperlegible Next", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  },
  charter: {
    id: "charter",
    label: "Charter",
    stack: '"Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  },
  "iowan-old-style": {
    id: "iowan-old-style",
    label: "Iowan Old Style",
    stack: '"Iowan Old Style", Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif',
  },
  "jetbrains-mono": {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    stack:
      '"JetBrains Mono", "SF Mono", SFMono-Regular, Menlo, Monaco, "Courier New", monospace',
  },
  "cascadia-code": {
    id: "cascadia-code",
    label: "Cascadia Code",
    stack:
      '"Cascadia Code", "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace',
  },
  "ibm-plex-mono": {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    stack:
      '"IBM Plex Mono", "SF Mono", SFMono-Regular, Menlo, Monaco, "Courier New", monospace',
  },
  iosevka: {
    id: "iosevka",
    label: "Iosevka",
    stack:
      '"Iosevka", "Iosevka Term", "SF Mono", SFMono-Regular, Menlo, Monaco, monospace',
  },
  "source-code-pro": {
    id: "source-code-pro",
    label: "Source Code Pro",
    stack:
      '"Source Code Pro", "SF Mono", SFMono-Regular, Menlo, Monaco, "Courier New", monospace',
  },
};

export const UI_FONT_PRESET_IDS: FontPresetId[] = [
  "system-sans",
  "inter",
  "atkinson-hyperlegible",
  "system-serif",
  "charter",
  "iowan-old-style",
];

export const NOTE_FONT_PRESET_IDS: FontPresetId[] = [
  "system-sans",
  "inter",
  "atkinson-hyperlegible",
  "system-serif",
  "charter",
  "iowan-old-style",
  "system-mono",
  "jetbrains-mono",
];

export const CODE_FONT_PRESET_IDS: FontPresetId[] = [
  "system-mono",
  "jetbrains-mono",
  "cascadia-code",
  "ibm-plex-mono",
  "iosevka",
  "source-code-pro",
];

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  "github-light-default": {
    id: "github-light-default",
    label: "GitHub Light Default",
    mode: "light",
    tokens: {
      bg: "#ffffff",
      bgSecondary: "#f6f8fa",
      bgMuted: "rgba(31, 35, 40, 0.06)",
      bgEmphasis: "rgba(31, 35, 40, 0.1)",
      text: "#1f2328",
      textMuted: "#636c76",
      textInverse: "#ffffff",
      border: "rgba(31, 35, 40, 0.12)",
      borderSolid: "#d0d7de",
      accent: "#0969da",
      selection: "rgba(9, 105, 218, 0.2)",
      code: "#cf222e",
      syntaxKeyword: "#cf222e",
      syntaxString: "#0a3069",
      syntaxNumber: "#0550ae",
      syntaxComment: "#6e7781",
      syntaxFunction: "#8250df",
      syntaxVariable: "#953800",
      syntaxType: "#116329",
      syntaxOperator: "#cf222e",
      syntaxAttr: "#0550ae",
    },
  },
  "ayu-light": {
    id: "ayu-light",
    label: "Ayu Light",
    mode: "light",
    tokens: {
      bg: "#fafafa",
      bgSecondary: "#f2f2f2",
      bgMuted: "rgba(90, 95, 103, 0.08)",
      bgEmphasis: "rgba(90, 95, 103, 0.12)",
      text: "#5c6166",
      textMuted: "#787b80",
      textInverse: "#ffffff",
      border: "rgba(92, 97, 102, 0.15)",
      borderSolid: "#d8dae1",
      accent: "#ff9940",
      selection: "rgba(255, 153, 64, 0.2)",
      code: "#f07171",
      syntaxKeyword: "#fa8d3e",
      syntaxString: "#86b300",
      syntaxNumber: "#a37acc",
      syntaxComment: "#abb0b6",
      syntaxFunction: "#f2ae49",
      syntaxVariable: "#55b4d4",
      syntaxType: "#399ee6",
      syntaxOperator: "#ed9366",
      syntaxAttr: "#55b4d4",
    },
  },
  "light-owl": {
    id: "light-owl",
    label: "Light Owl",
    mode: "light",
    tokens: {
      bg: "#fbfbfb",
      bgSecondary: "#f1f3f5",
      bgMuted: "rgba(64, 88, 119, 0.08)",
      bgEmphasis: "rgba(64, 88, 119, 0.12)",
      text: "#403f53",
      textMuted: "#6c7486",
      textInverse: "#ffffff",
      border: "rgba(64, 88, 119, 0.16)",
      borderSolid: "#d7dde5",
      accent: "#2aa298",
      selection: "rgba(0, 128, 255, 0.18)",
      code: "#d3423e",
      syntaxKeyword: "#d3423e",
      syntaxString: "#08916a",
      syntaxNumber: "#aa0982",
      syntaxComment: "#989fb1",
      syntaxFunction: "#0c969b",
      syntaxVariable: "#994cc3",
      syntaxType: "#4876d6",
      syntaxOperator: "#c24038",
      syntaxAttr: "#2f7ab8",
    },
  },
  "tokyo-night-light": {
    id: "tokyo-night-light",
    label: "Tokyo Night Light",
    mode: "light",
    tokens: {
      bg: "#d5d6db",
      bgSecondary: "#cbccd1",
      bgMuted: "rgba(52, 59, 88, 0.08)",
      bgEmphasis: "rgba(52, 59, 88, 0.12)",
      text: "#343b58",
      textMuted: "#565a6e",
      textInverse: "#ffffff",
      border: "rgba(52, 59, 88, 0.16)",
      borderSolid: "#b7b9c2",
      accent: "#34548a",
      selection: "rgba(52, 84, 138, 0.2)",
      code: "#8c4351",
      syntaxKeyword: "#9854f1",
      syntaxString: "#485e30",
      syntaxNumber: "#8f5e15",
      syntaxComment: "#848cb5",
      syntaxFunction: "#34548a",
      syntaxVariable: "#5a4a78",
      syntaxType: "#0f4b6e",
      syntaxOperator: "#8c4351",
      syntaxAttr: "#166775",
    },
  },
  "catppuccin-latte": {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    mode: "light",
    tokens: {
      bg: "#eff1f5",
      bgSecondary: "#e6e9ef",
      bgMuted: "rgba(92, 95, 119, 0.08)",
      bgEmphasis: "rgba(92, 95, 119, 0.12)",
      text: "#4c4f69",
      textMuted: "#6c6f85",
      textInverse: "#eff1f5",
      border: "rgba(92, 95, 119, 0.14)",
      borderSolid: "#ccd0da",
      accent: "#8839ef",
      selection: "rgba(136, 57, 239, 0.18)",
      code: "#d20f39",
      syntaxKeyword: "#8839ef",
      syntaxString: "#40a02b",
      syntaxNumber: "#fe640b",
      syntaxComment: "#8c8fa1",
      syntaxFunction: "#1e66f5",
      syntaxVariable: "#df8e1d",
      syntaxType: "#179299",
      syntaxOperator: "#d20f39",
      syntaxAttr: "#209fb5",
    },
  },
  "github-dark-default": {
    id: "github-dark-default",
    label: "GitHub Dark Default",
    mode: "dark",
    tokens: {
      bg: "#0d1117",
      bgSecondary: "#161b22",
      bgMuted: "rgba(240, 246, 252, 0.06)",
      bgEmphasis: "rgba(240, 246, 252, 0.1)",
      text: "#e6edf3",
      textMuted: "#8d96a0",
      textInverse: "#0d1117",
      border: "rgba(240, 246, 252, 0.1)",
      borderSolid: "#30363d",
      accent: "#2f81f7",
      selection: "rgba(56, 139, 253, 0.28)",
      code: "#ff7b72",
      syntaxKeyword: "#ff7b72",
      syntaxString: "#a5d6ff",
      syntaxNumber: "#79c0ff",
      syntaxComment: "#8b949e",
      syntaxFunction: "#d2a8ff",
      syntaxVariable: "#ffa657",
      syntaxType: "#7ee787",
      syntaxOperator: "#ff7b72",
      syntaxAttr: "#79c0ff",
    },
  },
  "github-dark-dimmed": {
    id: "github-dark-dimmed",
    label: "GitHub Dark Dimmed",
    mode: "dark",
    tokens: {
      bg: "#22272e",
      bgSecondary: "#2d333b",
      bgMuted: "rgba(173, 186, 199, 0.08)",
      bgEmphasis: "rgba(173, 186, 199, 0.12)",
      text: "#adbac7",
      textMuted: "#768390",
      textInverse: "#1c2128",
      border: "rgba(173, 186, 199, 0.12)",
      borderSolid: "#444c56",
      accent: "#539bf5",
      selection: "rgba(83, 155, 245, 0.22)",
      code: "#f47067",
      syntaxKeyword: "#f47067",
      syntaxString: "#96d0ff",
      syntaxNumber: "#6cb6ff",
      syntaxComment: "#768390",
      syntaxFunction: "#dcbdfb",
      syntaxVariable: "#f69d50",
      syntaxType: "#8ddb8c",
      syntaxOperator: "#f47067",
      syntaxAttr: "#6cb6ff",
    },
  },
  "one-dark-pro": {
    id: "one-dark-pro",
    label: "One Dark Pro",
    mode: "dark",
    tokens: {
      bg: "#282c34",
      bgSecondary: "#21252b",
      bgMuted: "rgba(171, 178, 191, 0.08)",
      bgEmphasis: "rgba(171, 178, 191, 0.12)",
      text: "#abb2bf",
      textMuted: "#7f848e",
      textInverse: "#1e2227",
      border: "rgba(171, 178, 191, 0.1)",
      borderSolid: "#3e4451",
      accent: "#61afef",
      selection: "rgba(97, 175, 239, 0.22)",
      code: "#e06c75",
      syntaxKeyword: "#c678dd",
      syntaxString: "#98c379",
      syntaxNumber: "#d19a66",
      syntaxComment: "#5c6370",
      syntaxFunction: "#61afef",
      syntaxVariable: "#e06c75",
      syntaxType: "#e5c07b",
      syntaxOperator: "#56b6c2",
      syntaxAttr: "#d19a66",
    },
  },
  dracula: {
    id: "dracula",
    label: "Dracula",
    mode: "dark",
    tokens: {
      bg: "#282a36",
      bgSecondary: "#21222c",
      bgMuted: "rgba(248, 248, 242, 0.08)",
      bgEmphasis: "rgba(248, 248, 242, 0.12)",
      text: "#f8f8f2",
      textMuted: "#b2b6d1",
      textInverse: "#191a21",
      border: "rgba(248, 248, 242, 0.1)",
      borderSolid: "#44475a",
      accent: "#bd93f9",
      selection: "rgba(189, 147, 249, 0.2)",
      code: "#ff79c6",
      syntaxKeyword: "#ff79c6",
      syntaxString: "#f1fa8c",
      syntaxNumber: "#bd93f9",
      syntaxComment: "#6272a4",
      syntaxFunction: "#50fa7b",
      syntaxVariable: "#ffb86c",
      syntaxType: "#8be9fd",
      syntaxOperator: "#ff79c6",
      syntaxAttr: "#8be9fd",
    },
  },
  "night-owl": {
    id: "night-owl",
    label: "Night Owl",
    mode: "dark",
    tokens: {
      bg: "#011627",
      bgSecondary: "#00111f",
      bgMuted: "rgba(130, 170, 255, 0.08)",
      bgEmphasis: "rgba(130, 170, 255, 0.12)",
      text: "#d6deeb",
      textMuted: "#7e97b6",
      textInverse: "#00111f",
      border: "rgba(126, 151, 182, 0.16)",
      borderSolid: "#1d3b53",
      accent: "#82aaff",
      selection: "rgba(127, 219, 202, 0.18)",
      code: "#ff5874",
      syntaxKeyword: "#c792ea",
      syntaxString: "#ecc48d",
      syntaxNumber: "#f78c6c",
      syntaxComment: "#637777",
      syntaxFunction: "#82aaff",
      syntaxVariable: "#addb67",
      syntaxType: "#7fdbca",
      syntaxOperator: "#c792ea",
      syntaxAttr: "#7fdbca",
    },
  },
  "tokyo-night": {
    id: "tokyo-night",
    label: "Tokyo Night",
    mode: "dark",
    tokens: {
      bg: "#1a1b26",
      bgSecondary: "#16161e",
      bgMuted: "rgba(192, 202, 245, 0.08)",
      bgEmphasis: "rgba(192, 202, 245, 0.12)",
      text: "#c0caf5",
      textMuted: "#7a84c2",
      textInverse: "#16161e",
      border: "rgba(122, 132, 194, 0.16)",
      borderSolid: "#414868",
      accent: "#7aa2f7",
      selection: "rgba(122, 162, 247, 0.18)",
      code: "#f7768e",
      syntaxKeyword: "#bb9af7",
      syntaxString: "#9ece6a",
      syntaxNumber: "#ff9e64",
      syntaxComment: "#565f89",
      syntaxFunction: "#7aa2f7",
      syntaxVariable: "#e0af68",
      syntaxType: "#2ac3de",
      syntaxOperator: "#89ddff",
      syntaxAttr: "#73daca",
    },
  },
  "catppuccin-mocha": {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    mode: "dark",
    tokens: {
      bg: "#1e1e2e",
      bgSecondary: "#181825",
      bgMuted: "rgba(205, 214, 244, 0.08)",
      bgEmphasis: "rgba(205, 214, 244, 0.12)",
      text: "#cdd6f4",
      textMuted: "#a6adc8",
      textInverse: "#11111b",
      border: "rgba(166, 173, 200, 0.14)",
      borderSolid: "#313244",
      accent: "#cba6f7",
      selection: "rgba(203, 166, 247, 0.18)",
      code: "#f38ba8",
      syntaxKeyword: "#cba6f7",
      syntaxString: "#a6e3a1",
      syntaxNumber: "#fab387",
      syntaxComment: "#6c7086",
      syntaxFunction: "#89b4fa",
      syntaxVariable: "#f9e2af",
      syntaxType: "#94e2d5",
      syntaxOperator: "#f38ba8",
      syntaxAttr: "#74c7ec",
    },
  },
  "ayu-dark": {
    id: "ayu-dark",
    label: "Ayu Dark",
    mode: "dark",
    tokens: {
      bg: "#0f1419",
      bgSecondary: "#131a21",
      bgMuted: "rgba(184, 194, 203, 0.08)",
      bgEmphasis: "rgba(184, 194, 203, 0.12)",
      text: "#b3b1ad",
      textMuted: "#7f8c98",
      textInverse: "#0b0e14",
      border: "rgba(127, 140, 152, 0.16)",
      borderSolid: "#253340",
      accent: "#39bae6",
      selection: "rgba(57, 186, 230, 0.18)",
      code: "#f07178",
      syntaxKeyword: "#ff8f40",
      syntaxString: "#aad94c",
      syntaxNumber: "#d2a6ff",
      syntaxComment: "#5c6773",
      syntaxFunction: "#ffb454",
      syntaxVariable: "#59c2ff",
      syntaxType: "#39bae6",
      syntaxOperator: "#ff7733",
      syntaxAttr: "#95e6cb",
    },
  },
};

export const LIGHT_THEME_PRESETS = [
  THEME_PRESETS["github-light-default"],
  THEME_PRESETS["ayu-light"],
  THEME_PRESETS["light-owl"],
  THEME_PRESETS["tokyo-night-light"],
  THEME_PRESETS["catppuccin-latte"],
];

export const DARK_THEME_PRESETS = [
  THEME_PRESETS["github-dark-default"],
  THEME_PRESETS["github-dark-dimmed"],
  THEME_PRESETS["one-dark-pro"],
  THEME_PRESETS.dracula,
  THEME_PRESETS["night-owl"],
  THEME_PRESETS["tokyo-night"],
  THEME_PRESETS["catppuccin-mocha"],
  THEME_PRESETS["ayu-dark"],
];

const THEME_PRESET_IDS = new Set<ThemePresetId>(
  Object.keys(THEME_PRESETS) as ThemePresetId[],
);
const FONT_PRESET_IDS = new Set<FontPresetId>(Object.keys(FONT_PRESETS) as FontPresetId[]);

export function isThemePresetId(value: string): value is ThemePresetId {
  return THEME_PRESET_IDS.has(value as ThemePresetId);
}

export function isFontPresetId(value: string): value is FontPresetId {
  return FONT_PRESET_IDS.has(value as FontPresetId);
}

export function normalizeFontChoice(
  choice: FontChoice | null | undefined,
  fallbackPreset: FontPresetId,
): FontChoice {
  if (!choice) {
    return { kind: "preset", value: fallbackPreset };
  }

  if (choice.kind === "custom") {
    return { kind: "custom", value: choice.value ?? "" };
  }

  if (isFontPresetId(choice.value)) {
    return { kind: "preset", value: choice.value };
  }

  if (choice.value?.trim()) {
    return { kind: "custom", value: choice.value.trim() };
  }

  return { kind: "preset", value: fallbackPreset };
}

export function resolveFontFamily(
  choice: FontChoice | null | undefined,
  fallbackPreset: FontPresetId,
): string {
  const normalized = normalizeFontChoice(choice, fallbackPreset);
  if (normalized.kind === "custom") {
    return normalized.value.trim() || FONT_PRESETS[fallbackPreset].stack;
  }
  return FONT_PRESETS[normalized.value as FontPresetId]?.stack ?? FONT_PRESETS[fallbackPreset].stack;
}

export function mergeThemeColors(
  base: ThemeColors,
  overrides?: ThemeColors,
): ThemeColors {
  if (!overrides) return base;
  return { ...base, ...overrides };
}

export function resolveThemeTokens(
  appearance: Pick<
    AppearanceSettings,
    "lightPresetId" | "darkPresetId" | "customLightColors" | "customDarkColors"
  >,
  mode: Exclude<ThemeMode, "system">,
): ThemeColors {
  const presetId =
    mode === "light" ? appearance.lightPresetId : appearance.darkPresetId;
  const preset = THEME_PRESETS[presetId];
  const overrides =
    mode === "light"
      ? appearance.customLightColors
      : appearance.customDarkColors;

  return mergeThemeColors(preset.tokens, overrides);
}

export function themeColorsToCSSVariables(
  colors: ThemeColors,
): Record<string, string> {
  return Object.entries({
    "--color-bg": colors.bg,
    "--color-bg-secondary": colors.bgSecondary,
    "--color-bg-muted": colors.bgMuted,
    "--color-bg-emphasis": colors.bgEmphasis,
    "--color-text": colors.text,
    "--color-text-muted": colors.textMuted,
    "--color-text-inverse": colors.textInverse,
    "--color-border": colors.border,
    "--color-border-solid": colors.borderSolid,
    "--color-accent": colors.accent,
    "--color-selection": colors.selection,
    "--color-code": colors.code,
    "--color-syntax-keyword": colors.syntaxKeyword,
    "--color-syntax-string": colors.syntaxString,
    "--color-syntax-number": colors.syntaxNumber,
    "--color-syntax-comment": colors.syntaxComment,
    "--color-syntax-function": colors.syntaxFunction,
    "--color-syntax-variable": colors.syntaxVariable,
    "--color-syntax-type": colors.syntaxType,
    "--color-syntax-operator": colors.syntaxOperator,
    "--color-syntax-attr": colors.syntaxAttr,
  }).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === "string" && value.length > 0) {
      acc[key] = value;
    }
    return acc;
  }, {});
}
