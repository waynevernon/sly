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

export interface NoteMoveResult {
  from: string;
  to: string;
}

export type ThemeMode = "light" | "dark" | "system";
export type ThemePresetId =
  | "sly-light"
  | "sly-dark"
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
  | "gruvbox-material-dark"
  | "monokai"
  | "monokai-pro"
  | "rose-pine"
  | "rose-pine-moon"
  | "everforest-dark"
  | "kanagawa"
  | "vscode-dark-modern"
  | "vesper"
  | "poimandres"
  | "bear-light"
  | "bear-dark"
  | "things-light"
  | "things-dark"
  | "obsidian-light"
  | "obsidian-dark"
  | "claude-light"
  | "claude-dark"
  | "evernote-light"
  | "evernote-dark"
  | "apple-notes-light"
  | "apple-notes-dark";

export type FontPresetId =
  | "inter"
  | "atkinson-hyperlegible-next"
  | "jetbrains-mono"
  | "system-sans"
  | "system-serif"
  | "system-mono";

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
export type RightPanelTab = "outline" | "assistant";
export type NoteListDateMode = "modified" | "created" | "off";
export type NoteListPreviewLines = 1 | 2 | 3;
export type NoteSortMode =
  | "modifiedDesc"
  | "modifiedAsc"
  | "createdDesc"
  | "createdAsc"
  | "titleAsc"
  | "titleDesc";
export type FolderSortMode = "nameAsc" | "nameDesc";
export type FolderColorId =
  | "slate"
  | "blue"
  | "teal"
  | "green"
  | "olive"
  | "amber"
  | "orange"
  | "red"
  | "plum";
export type FolderIconSpec =
  | { kind: "lucide"; name: string }
  | { kind: "emoji"; shortcode: string };
export type TaskQuickAddShortcut = string;
export interface FolderAppearance {
  icon?: FolderIconSpec;
  colorId?: FolderColorId;
}
export type NoteScope =
  | { type: "all" }
  | { type: "pinned" }
  | { type: "recent" }
  | { type: "folder"; path: string };

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
  customEditorWidthPx?: number | null;
  interfaceZoom: number;
  paneMode: PaneMode;
  foldersPaneWidth: number;
  notesPaneWidth: number;
  rightPanelVisible: boolean;
  rightPanelWidth: number;
  rightPanelTab: RightPanelTab;
  customLightColors?: ThemeColors | null;
  customDarkColors?: ThemeColors | null;
  confirmDeletions: boolean;
  sourceModeWordWrap: boolean;
}

// Per-folder settings (stored in .sly/settings.json)
export interface Settings {
  schemaVersion: number;
  gitEnabled?: boolean | null;
  pinnedNoteIds?: string[] | null;
  recentNoteIds?: string[] | null;
  showPinnedNotes?: boolean | null;
  showRecentNotes?: boolean | null;
  showNoteCounts: boolean;
  showNotesFromSubfolders: boolean;
  defaultNoteName?: string | null;
  ollamaModel?: string | null;
  folderIcons?: Record<string, FolderAppearance> | null;
  collapsedFolders?: string[] | null;
  noteListDateMode: NoteListDateMode;
  showNoteListFilename: boolean;
  showNoteListFolderPath: boolean;
  showNoteListPreview: boolean;
  noteListPreviewLines: NoteListPreviewLines;
  noteSortMode: NoteSortMode;
  folderNoteSortModes?: Record<string, NoteSortMode> | null;
  folderSortMode: FolderSortMode;
  tasksEnabled?: boolean | null;
  taskQuickAddShortcut?: TaskQuickAddShortcut | null;
}

export interface SettingsPatch {
  gitEnabled?: boolean | null;
  pinnedNoteIds?: string[] | null;
  recentNoteIds?: string[] | null;
  showPinnedNotes?: boolean | null;
  showRecentNotes?: boolean | null;
  showNoteCounts?: boolean | null;
  showNotesFromSubfolders?: boolean | null;
  defaultNoteName?: string | null;
  ollamaModel?: string | null;
  folderIcons?: Record<string, FolderAppearance> | null;
  collapsedFolders?: string[] | null;
  noteListDateMode?: NoteListDateMode;
  showNoteListFilename?: boolean | null;
  showNoteListFolderPath?: boolean | null;
  showNoteListPreview?: boolean | null;
  noteListPreviewLines?: NoteListPreviewLines;
  noteSortMode?: NoteSortMode;
  folderNoteSortModes?: Record<string, NoteSortMode> | null;
  folderSortMode?: FolderSortMode;
  tasksEnabled?: boolean | null;
  taskQuickAddShortcut?: TaskQuickAddShortcut | null;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: NoteMetadata[];
}
