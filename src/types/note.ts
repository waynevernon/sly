export interface NoteMetadata {
  id: string;
  title: string;
  preview: string;
  modified: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  path: string;
  modified: number;
}

export type ThemeMode = "light" | "dark" | "system";
export type ThemePresetId =
  | "github-light-default"
  | "ayu-light"
  | "light-owl"
  | "tokyo-night-light"
  | "catppuccin-latte"
  | "github-dark-default"
  | "github-dark-dimmed"
  | "one-dark-pro"
  | "dracula"
  | "night-owl"
  | "tokyo-night"
  | "catppuccin-mocha"
  | "ayu-dark";

export type FontPresetId =
  | "system-sans"
  | "system-serif"
  | "system-mono"
  | "inter"
  | "atkinson-hyperlegible"
  | "charter"
  | "iowan-old-style"
  | "jetbrains-mono"
  | "cascadia-code"
  | "ibm-plex-mono"
  | "iosevka"
  | "source-code-pro";

export interface FontChoice {
  kind: "preset" | "custom";
  value: string;
}

export interface ThemeColors {
  bg?: string;
  bgSecondary?: string;
  bgMuted?: string;
  bgEmphasis?: string;
  text?: string;
  textMuted?: string;
  textInverse?: string;
  border?: string;
  borderSolid?: string;
  accent?: string;
  selection?: string;
  code?: string;
  syntaxKeyword?: string;
  syntaxString?: string;
  syntaxNumber?: string;
  syntaxComment?: string;
  syntaxFunction?: string;
  syntaxVariable?: string;
  syntaxType?: string;
  syntaxOperator?: string;
  syntaxAttr?: string;
}

export type TextDirection = "auto" | "ltr" | "rtl";
export type EditorWidth = "narrow" | "normal" | "wide" | "full" | "custom";
export type PaneMode = 1 | 2 | 3;

export interface NoteTypographySettings {
  baseFontSize: number;
  boldWeight: number;
  lineHeight: number;
}

export interface AppearanceSettings {
  mode: ThemeMode;
  lightPresetId: ThemePresetId;
  darkPresetId: ThemePresetId;
  uiFont: FontChoice;
  noteFont: FontChoice;
  codeFont: FontChoice;
  noteTypography: NoteTypographySettings;
  textDirection: TextDirection;
  editorWidth: EditorWidth;
  customEditorWidthPx?: number;
  interfaceZoom: number;
  paneMode: PaneMode;
  customLightColors?: ThemeColors;
  customDarkColors?: ThemeColors;
}

// Per-folder settings (stored in .scratch/settings.json)
export interface Settings {
  gitEnabled?: boolean;
  pinnedNoteIds?: string[];
  defaultNoteName?: string;
  ollamaModel?: string;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: NoteMetadata[];
}
