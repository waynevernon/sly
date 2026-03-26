export interface NoteMetadata {
  id: string;
  title: string;
  preview: string;
  modified: number;
  created: number;
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
  | "github-light-colorblind"
  | "github-light-high-contrast"
  | "ayu-light"
  | "nord-light"
  | "solarized-light"
  | "gruvbox-light"
  | "gruvbox-material-light"
  | "light-owl"
  | "one-light"
  | "papercolor-light"
  | "material-lighter"
  | "rose-pine-dawn"
  | "everforest-light"
  | "tokyo-night-light"
  | "catppuccin-latte"
  | "github-dark-default"
  | "github-dark-dimmed"
  | "github-dark-high-contrast"
  | "one-dark-pro"
  | "dracula"
  | "night-owl"
  | "tokyo-night"
  | "tokyo-night-storm"
  | "tokyo-night-moon"
  | "catppuccin-mocha"
  | "catppuccin-frappe"
  | "catppuccin-macchiato"
  | "ayu-dark"
  | "ayu-mirage"
  | "material-palenight"
  | "material-darker"
  | "material-ocean"
  | "nord"
  | "solarized-dark"
  | "gruvbox-dark"
  | "monokai";

export type FontPresetId =
  | "system-sans"
  | "system-serif"
  | "system-mono"
  | "reading-serif"
  | "developer-mono";

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
export type NoteSortMode =
  | "modifiedDesc"
  | "modifiedAsc"
  | "createdDesc"
  | "createdAsc"
  | "titleAsc"
  | "titleDesc";
export type FolderSortMode = "manual" | "nameAsc" | "nameDesc";
export type FolderManualOrder = Record<string, string[]>;

export const DEFAULT_NOTE_SORT_MODE: NoteSortMode = "modifiedDesc";
export const DEFAULT_FOLDER_SORT_MODE: FolderSortMode = "nameAsc";

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
  foldersPaneWidth?: number;
  notesPaneWidth?: number;
  customLightColors?: ThemeColors;
  customDarkColors?: ThemeColors;
  confirmDeletions?: boolean;
}

// Per-folder settings (stored in .sly/settings.json)
export interface Settings {
  gitEnabled?: boolean;
  pinnedNoteIds?: string[];
  defaultNoteName?: string;
  ollamaModel?: string;
  folderIcons?: Record<string, string>;
  collapsedFolders?: string[];
  noteSortMode?: NoteSortMode;
  folderSortMode?: FolderSortMode;
  folderManualOrder?: FolderManualOrder;
}

export interface SettingsPatch {
  gitEnabled?: boolean | null;
  pinnedNoteIds?: string[] | null;
  defaultNoteName?: string | null;
  ollamaModel?: string | null;
  folderIcons?: Record<string, string> | null;
  collapsedFolders?: string[] | null;
  noteSortMode?: NoteSortMode;
  folderSortMode?: FolderSortMode;
  folderManualOrder?: FolderManualOrder | null;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: NoteMetadata[];
}
