use anyhow::Result;
use base64::Engine;
use notify::{
    event::{CreateKind, ModifyKind, RemoveKind},
    Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy};
use tauri::menu::{
    Menu, MenuBuilder, MenuEvent, MenuItemBuilder, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
    WINDOW_SUBMENU_ID,
};
use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewUrl};
use tauri_plugin_clipboard_manager::ClipboardExt;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tokio::fs;
use tokio::io::AsyncWriteExt;

mod cli;
mod git;
mod persistence;
mod tasks;

use persistence::app_config::{load_app_config, save_app_config};
use persistence::workspace_settings::{apply_settings_patch, load_settings, save_settings};

const MENU_SETTINGS_ID: &str = "app-settings";
const MENU_VIEW_NOTES_MODE_ID: &str = "view-mode-notes";
const MENU_VIEW_TASKS_MODE_ID: &str = "view-mode-tasks";
const MENU_CYCLE_LEFT_PANES_ID: &str = "view-cycle-left-panes";
const MENU_VIEW_1_PANE_ID: &str = "view-pane-1";
const MENU_VIEW_2_PANE_ID: &str = "view-pane-2";
const MENU_VIEW_3_PANE_ID: &str = "view-pane-3";
const MENU_TOGGLE_OUTLINE_PANEL_ID: &str = "view-toggle-outline-panel";
const MENU_FOCUS_MODE_ID: &str = "view-focus-mode";
const MENU_ABOUT_ID: &str = "app-about";
const MENU_CHECK_FOR_UPDATES_ID: &str = "app-check-for-updates";
const MENU_VIEW_GITHUB_ID: &str = "help-view-github";
const MENU_REPORT_ISSUE_ID: &str = "help-report-issue";
const OPEN_GLOBAL_TASK_CAPTURE_EVENT: &str = "open-global-task-capture";
const TASK_QUICK_ADD_SHORTCUT_ERROR_EVENT: &str = "task-quick-add-shortcut-error";

const REPOSITORY_URL: &str = "https://github.com/waynevernon/sly";
const ISSUES_URL: &str = "https://github.com/waynevernon/sly/issues";

// Note metadata for list display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMetadata {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub modified: i64,
    pub created: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliStatus {
    pub supported: bool,
    pub installed: bool,
    pub path: Option<String>,
}

// Full note content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub path: String,
    pub modified: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NoteMoveResult {
    pub from: String,
    pub to: String,
}

// Theme color customization
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ThemeColors {
    pub bg: Option<String>,
    pub bg_secondary: Option<String>,
    pub bg_muted: Option<String>,
    pub bg_emphasis: Option<String>,
    pub text: Option<String>,
    pub text_muted: Option<String>,
    pub text_inverse: Option<String>,
    pub border: Option<String>,
    pub border_solid: Option<String>,
    pub accent: Option<String>,
    pub selection: Option<String>,
    pub code: Option<String>,
    pub syntax_keyword: Option<String>,
    pub syntax_string: Option<String>,
    pub syntax_number: Option<String>,
    pub syntax_comment: Option<String>,
    pub syntax_function: Option<String>,
    pub syntax_variable: Option<String>,
    pub syntax_type: Option<String>,
    pub syntax_operator: Option<String>,
    pub syntax_attr: Option<String>,
}

fn default_font_choice_kind() -> String {
    "preset".to_string()
}

fn default_theme_mode() -> String {
    "system".to_string()
}

fn default_light_preset_id() -> String {
    "sly-light".to_string()
}

fn default_dark_preset_id() -> String {
    "sly-dark".to_string()
}

fn default_note_list_preview_lines() -> u8 {
    2
}

fn default_folders_pane_width() -> u32 {
    240
}

fn default_notes_pane_width() -> u32 {
    304
}

fn default_right_panel_width() -> u32 {
    260
}

fn default_right_panel_tab() -> String {
    "outline".to_string()
}

fn default_editor_width() -> String {
    "normal".to_string()
}

fn default_interface_zoom() -> f32 {
    1.0
}

fn default_pane_mode() -> i32 {
    3
}

fn default_true() -> bool {
    true
}

pub(crate) fn normalize_task_quick_add_shortcut_value(value: &str) -> Option<String> {
    let trimmed = value.trim();

    if trimmed == "disabled" {
        return Some("disabled".to_string());
    }

    // Migrate old slug-style values to Tauri accelerator format
    match trimmed {
        "control-space" => return Some("Control+Space".to_string()),
        "command-shift-n" => return Some("CommandOrControl+Shift+N".to_string()),
        _ => {}
    }

    if is_valid_accelerator(trimmed) {
        Some(trimmed.to_string())
    } else {
        None
    }
}

const VALID_MODIFIER_NAMES: &[&str] = &[
    "Control",
    "Ctrl",
    "Shift",
    "Alt",
    "Option",
    "Meta",
    "Super",
    "Command",
    "Cmd",
    "CommandOrControl",
    "CmdOrCtrl",
];

const VALID_SPECIAL_KEY_NAMES: &[&str] = &[
    "Space", "Return", "Enter", "Tab", "Escape", "Esc", "Backspace", "Delete", "Left", "Right",
    "Up", "Down", "Home", "End", "PageUp", "PageDown", "F1", "F2", "F3", "F4", "F5", "F6", "F7",
    "F8", "F9", "F10", "F11", "F12",
];

fn is_valid_key_name(key: &str) -> bool {
    if key.len() == 1 {
        let c = key.chars().next().unwrap_or('\0');
        if c.is_ascii_uppercase() || c.is_ascii_digit() {
            return true;
        }
    }
    VALID_SPECIAL_KEY_NAMES.contains(&key)
}

fn is_valid_accelerator(s: &str) -> bool {
    let parts: Vec<&str> = s.split('+').collect();
    if parts.len() < 2 {
        return false;
    }
    let (modifier_parts, key_slice) = parts.split_at(parts.len() - 1);
    let key = key_slice[0];

    if modifier_parts.is_empty() {
        return false;
    }

    for &m in modifier_parts {
        if !VALID_MODIFIER_NAMES.contains(&m) {
            return false;
        }
    }

    // Require at least one strong modifier (not only Shift)
    let has_strong_modifier = modifier_parts.iter().any(|&m| {
        matches!(
            m,
            "Control"
                | "Ctrl"
                | "Alt"
                | "Option"
                | "Meta"
                | "Super"
                | "Command"
                | "Cmd"
                | "CommandOrControl"
                | "CmdOrCtrl"
        )
    });
    if !has_strong_modifier {
        return false;
    }

    is_valid_key_name(key)
}

fn default_note_base_font_size() -> f32 {
    16.0
}

fn default_note_bold_weight() -> i32 {
    600
}

fn default_note_line_height() -> f32 {
    1.5
}

const NOTE_PREVIEW_MAX_CHARS: usize = 180;
const NOTE_PREVIEW_ELLIPSIS: &str = "...";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FontChoice {
    #[serde(default = "default_font_choice_kind")]
    pub kind: String,
    #[serde(default)]
    pub value: String,
}

impl FontChoice {
    fn preset(value: &str) -> Self {
        Self {
            kind: "preset".to_string(),
            value: value.to_string(),
        }
    }
}

impl Default for FontChoice {
    fn default() -> Self {
        Self::preset("inter")
    }
}

fn default_ui_font() -> FontChoice {
    FontChoice::preset("inter")
}

fn default_note_font() -> FontChoice {
    FontChoice::preset("atkinson-hyperlegible-next")
}

fn default_code_font() -> FontChoice {
    FontChoice::preset("jetbrains-mono")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTypographySettings {
    #[serde(default = "default_note_base_font_size")]
    pub base_font_size: f32,
    #[serde(default = "default_note_bold_weight")]
    pub bold_weight: i32,
    #[serde(default = "default_note_line_height")]
    pub line_height: f32,
}

impl Default for NoteTypographySettings {
    fn default() -> Self {
        Self {
            base_font_size: default_note_base_font_size(),
            bold_weight: default_note_bold_weight(),
            line_height: default_note_line_height(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TextDirection {
    #[default]
    Auto,
    Ltr,
    Rtl,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    #[serde(default = "default_theme_mode")]
    pub mode: String,
    #[serde(default = "default_light_preset_id")]
    pub light_preset_id: String,
    #[serde(default = "default_dark_preset_id")]
    pub dark_preset_id: String,
    #[serde(default = "default_ui_font")]
    pub ui_font: FontChoice,
    #[serde(default = "default_note_font")]
    pub note_font: FontChoice,
    #[serde(default = "default_code_font")]
    pub code_font: FontChoice,
    #[serde(default)]
    pub note_typography: NoteTypographySettings,
    #[serde(default)]
    pub text_direction: TextDirection,
    #[serde(default = "default_editor_width")]
    pub editor_width: String,
    #[serde(default)]
    pub custom_editor_width_px: Option<u32>,
    #[serde(default = "default_interface_zoom")]
    pub interface_zoom: f32,
    #[serde(default = "default_pane_mode")]
    pub pane_mode: i32,
    #[serde(default = "default_folders_pane_width")]
    pub folders_pane_width: u32,
    #[serde(default = "default_notes_pane_width")]
    pub notes_pane_width: u32,
    #[serde(default = "default_true")]
    pub right_panel_visible: bool,
    #[serde(default = "default_right_panel_width")]
    pub right_panel_width: u32,
    #[serde(default = "default_right_panel_tab")]
    pub right_panel_tab: String,
    #[serde(default)]
    pub custom_light_colors: Option<ThemeColors>,
    #[serde(default)]
    pub custom_dark_colors: Option<ThemeColors>,
    #[serde(default = "default_true")]
    pub confirm_deletions: bool,
    #[serde(default)]
    pub source_mode_word_wrap: bool,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            mode: default_theme_mode(),
            light_preset_id: default_light_preset_id(),
            dark_preset_id: default_dark_preset_id(),
            ui_font: default_ui_font(),
            note_font: default_note_font(),
            code_font: default_code_font(),
            note_typography: NoteTypographySettings::default(),
            text_direction: TextDirection::Auto,
            editor_width: default_editor_width(),
            custom_editor_width_px: None,
            interface_zoom: default_interface_zoom(),
            pane_mode: default_pane_mode(),
            folders_pane_width: default_folders_pane_width(),
            notes_pane_width: default_notes_pane_width(),
            right_panel_visible: default_true(),
            right_panel_width: default_right_panel_width(),
            right_panel_tab: default_right_panel_tab(),
            custom_light_colors: None,
            custom_dark_colors: None,
            confirm_deletions: true,
            source_mode_word_wrap: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum NoteSortMode {
    #[default]
    ModifiedDesc,
    ModifiedAsc,
    CreatedDesc,
    CreatedAsc,
    TitleAsc,
    TitleDesc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum FolderSortMode {
    #[default]
    NameAsc,
    NameDesc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum NoteListDateMode {
    #[default]
    Modified,
    Created,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FolderColorId {
    Slate,
    Blue,
    Teal,
    Green,
    Olive,
    Amber,
    Orange,
    Red,
    Plum,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FolderIconSpec {
    Lucide { name: String },
    Emoji { shortcode: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FolderAppearance {
    #[serde(default)]
    pub icon: Option<FolderIconSpec>,
    #[serde(default)]
    pub color_id: Option<FolderColorId>,
}

// App config (stored in app data directory)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(
        rename = "schemaVersion",
        default = "persistence::app_config::current_app_config_schema_version"
    )]
    pub schema_version: u32,
    pub notes_folder: Option<String>,
    #[serde(rename = "aiWorkingDirectory")]
    pub ai_working_directory: Option<String>,
    #[serde(default)]
    pub appearance: AppearanceSettings,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: persistence::app_config::current_app_config_schema_version(),
            notes_folder: None,
            ai_working_directory: None,
            appearance: AppearanceSettings::default(),
        }
    }
}

// Per-folder settings (stored in .sly/settings.json within notes folder)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(
        rename = "schemaVersion",
        default = "persistence::workspace_settings::current_settings_schema_version"
    )]
    pub schema_version: u32,
    #[serde(rename = "gitEnabled")]
    pub git_enabled: Option<bool>,
    #[serde(rename = "pinnedNoteIds")]
    pub pinned_note_ids: Option<Vec<String>>,
    #[serde(rename = "recentNoteIds")]
    pub recent_note_ids: Option<Vec<String>>,
    #[serde(rename = "showPinnedNotes")]
    pub show_pinned_notes: Option<bool>,
    #[serde(rename = "showRecentNotes")]
    pub show_recent_notes: Option<bool>,
    #[serde(rename = "showNoteCounts", default = "default_true")]
    pub show_note_counts: bool,
    #[serde(rename = "showNotesFromSubfolders", default)]
    pub show_notes_from_subfolders: bool,
    #[serde(rename = "defaultNoteName")]
    pub default_note_name: Option<String>,
    #[serde(rename = "ollamaModel")]
    pub ollama_model: Option<String>,
    #[serde(rename = "folderIcons", default)]
    pub folder_icons: Option<HashMap<String, FolderAppearance>>,
    #[serde(rename = "collapsedFolders")]
    pub collapsed_folders: Option<Vec<String>>,
    #[serde(rename = "noteListDateMode", default)]
    pub note_list_date_mode: NoteListDateMode,
    #[serde(rename = "showNoteListFilename", default = "default_true")]
    pub show_note_list_filename: bool,
    #[serde(rename = "showNoteListFolderPath", default)]
    pub show_note_list_folder_path: bool,
    #[serde(rename = "showNoteListPreview", default = "default_true")]
    pub show_note_list_preview: bool,
    #[serde(
        rename = "noteListPreviewLines",
        default = "default_note_list_preview_lines"
    )]
    pub note_list_preview_lines: u8,
    #[serde(rename = "noteSortMode", default)]
    pub note_sort_mode: NoteSortMode,
    #[serde(rename = "folderNoteSortModes", default)]
    pub folder_note_sort_modes: Option<HashMap<String, NoteSortMode>>,
    #[serde(rename = "folderSortMode", default)]
    pub folder_sort_mode: FolderSortMode,
    #[serde(
        rename = "tasksEnabled",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub tasks_enabled: Option<bool>,
    #[serde(
        rename = "taskQuickAddShortcut",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub task_quick_add_shortcut: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: persistence::workspace_settings::current_settings_schema_version(),
            git_enabled: None,
            pinned_note_ids: None,
            recent_note_ids: None,
            show_pinned_notes: None,
            show_recent_notes: None,
            show_note_counts: true,
            show_notes_from_subfolders: false,
            default_note_name: None,
            ollama_model: None,
            folder_icons: None,
            collapsed_folders: None,
            note_list_date_mode: NoteListDateMode::default(),
            show_note_list_filename: true,
            show_note_list_folder_path: false,
            show_note_list_preview: true,
            note_list_preview_lines: default_note_list_preview_lines(),
            note_sort_mode: NoteSortMode::default(),
            folder_note_sort_modes: None,
            folder_sort_mode: FolderSortMode::default(),
            tasks_enabled: None,
            task_quick_add_shortcut: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    #[serde(default)]
    pub git_enabled: Option<Option<bool>>,
    #[serde(default)]
    pub pinned_note_ids: Option<Option<Vec<String>>>,
    #[serde(default)]
    pub recent_note_ids: Option<Option<Vec<String>>>,
    #[serde(default)]
    pub show_pinned_notes: Option<Option<bool>>,
    #[serde(default)]
    pub show_recent_notes: Option<Option<bool>>,
    #[serde(default)]
    pub show_note_counts: Option<Option<bool>>,
    #[serde(default)]
    pub show_notes_from_subfolders: Option<Option<bool>>,
    #[serde(default)]
    pub default_note_name: Option<Option<String>>,
    #[serde(default)]
    pub ollama_model: Option<Option<String>>,
    #[serde(default)]
    pub folder_icons: Option<Option<HashMap<String, FolderAppearance>>>,
    #[serde(default)]
    pub collapsed_folders: Option<Option<Vec<String>>>,
    #[serde(default)]
    pub note_list_date_mode: Option<NoteListDateMode>,
    #[serde(default)]
    pub show_note_list_filename: Option<Option<bool>>,
    #[serde(default)]
    pub show_note_list_folder_path: Option<Option<bool>>,
    #[serde(default)]
    pub show_note_list_preview: Option<Option<bool>>,
    #[serde(default)]
    pub note_list_preview_lines: Option<u8>,
    #[serde(default)]
    pub note_sort_mode: Option<NoteSortMode>,
    #[serde(default)]
    pub folder_note_sort_modes: Option<Option<HashMap<String, NoteSortMode>>>,
    #[serde(default)]
    pub folder_sort_mode: Option<FolderSortMode>,
    #[serde(default)]
    pub tasks_enabled: Option<Option<bool>>,
    #[serde(default)]
    pub task_quick_add_shortcut: Option<Option<String>>,
}

// Search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub modified: i64,
    pub score: f32,
}

// AI execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantHistoryEntry {
    pub role: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantTurnRequest {
    pub provider: String,
    pub note_id: String,
    pub note_path: String,
    pub note_title: String,
    pub scope: String,
    pub scope_label: String,
    pub start_line: u32,
    pub end_line: u32,
    pub snapshot_hash: String,
    pub numbered_content: String,
    pub user_prompt: String,
    pub history: Vec<AssistantHistoryEntry>,
    pub ollama_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantProposal {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub start_line: u32,
    pub end_line: u32,
    pub replacement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantTurnResult {
    pub reply_text: String,
    pub proposals: Vec<AssistantProposal>,
    pub warning: Option<String>,
    #[serde(skip_deserializing)]
    pub execution_dir: Option<String>,
}

// File watcher state
pub struct FileWatcherState {
    #[allow(dead_code)]
    watcher: RecommendedWatcher,
    folder: PathBuf,
}

// Tantivy search index state
pub struct SearchIndex {
    index: Index,
    reader: IndexReader,
    writer: Mutex<IndexWriter>,
    #[allow(dead_code)]
    schema: Schema,
    id_field: Field,
    title_field: Field,
    content_field: Field,
    modified_field: Field,
}

impl SearchIndex {
    fn new(index_path: &PathBuf) -> Result<Self> {
        // Build schema
        let mut schema_builder = Schema::builder();
        let id_field = schema_builder.add_text_field("id", STRING | STORED);
        let title_field = schema_builder.add_text_field("title", TEXT | STORED);
        let content_field = schema_builder.add_text_field("content", TEXT | STORED);
        let modified_field = schema_builder.add_i64_field("modified", INDEXED | STORED);
        let schema = schema_builder.build();

        // Create or open index
        std::fs::create_dir_all(index_path)?;
        let index = Index::create_in_dir(index_path, schema.clone())
            .or_else(|_| Index::open_in_dir(index_path))?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        let writer = index.writer(50_000_000)?; // 50MB buffer

        Ok(Self {
            index,
            reader,
            writer: Mutex::new(writer),
            schema,
            id_field,
            title_field,
            content_field,
            modified_field,
        })
    }

    fn index_note(&self, id: &str, title: &str, content: &str, modified: i64) -> Result<()> {
        let mut writer = self.writer.lock().expect("search writer mutex");

        // Delete existing document with this ID
        let id_term = tantivy::Term::from_field_text(self.id_field, id);
        writer.delete_term(id_term);

        // Add new document
        writer.add_document(doc!(
            self.id_field => id,
            self.title_field => title,
            self.content_field => content,
            self.modified_field => modified,
        ))?;

        writer.commit()?;
        Ok(())
    }

    fn delete_note(&self, id: &str) -> Result<()> {
        let mut writer = self.writer.lock().expect("search writer mutex");
        let id_term = tantivy::Term::from_field_text(self.id_field, id);
        writer.delete_term(id_term);
        writer.commit()?;
        Ok(())
    }

    fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let searcher = self.reader.searcher();
        let query_parser =
            QueryParser::for_index(&self.index, vec![self.title_field, self.content_field]);

        // Parse query, fall back to prefix query if parsing fails
        let query = query_parser
            .parse_query(query_str)
            .or_else(|_| query_parser.parse_query(&format!("{}*", query_str)))?;

        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit).order_by_score())?;

        let mut results = Vec::with_capacity(top_docs.len());
        for (score, doc_address) in top_docs {
            let doc: TantivyDocument = searcher.doc(doc_address)?;

            let id = doc
                .get_first(self.id_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let title = doc
                .get_first(self.title_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let content = doc
                .get_first(self.content_field)
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let modified = doc
                .get_first(self.modified_field)
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            let preview = generate_preview(content);

            results.push(SearchResult {
                id,
                title,
                preview,
                modified,
                score,
            });
        }

        Ok(results)
    }

    fn rebuild_index(&self, notes_folder: &PathBuf) -> Result<()> {
        let mut writer = self.writer.lock().expect("search writer mutex");
        writer.delete_all_documents()?;

        if notes_folder.exists() {
            use walkdir::WalkDir;
            for entry in WalkDir::new(notes_folder)
                .max_depth(10)
                .into_iter()
                .filter_entry(is_visible_notes_entry)
                .flatten()
            {
                let file_path = entry.path();
                if !file_path.is_file() {
                    continue;
                }
                if let Some(id) = id_from_abs_path(notes_folder, file_path) {
                    if let Ok(content) = std::fs::read_to_string(file_path) {
                        let modified = entry
                            .metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);

                        let title = extract_title(&content);

                        writer.add_document(doc!(
                            self.id_field => id.as_str(),
                            self.title_field => title,
                            self.content_field => content.as_str(),
                            self.modified_field => modified,
                        ))?;
                    }
                }
            }
        }

        writer.commit()?;
        Ok(())
    }
}

// App state with improved structure
pub struct AppState {
    pub app_config: RwLock<AppConfig>, // notes_folder path (stored in app data)
    pub settings: RwLock<Settings>,    // per-folder settings (stored in .sly/)
    pub notes_cache: RwLock<HashMap<String, NoteMetadata>>,
    pub notes_cache_root: RwLock<Option<String>>,
    pub note_mutation_lock: tokio::sync::Mutex<()>,
    pub file_watcher: Mutex<Option<FileWatcherState>>,
    pub note_windows: Mutex<HashMap<String, String>>,
    pub search_index: Mutex<Option<SearchIndex>>,
    pub debounce_map: Arc<Mutex<HashMap<PathBuf, Instant>>>,
    pub registered_task_quick_add_shortcut: Mutex<Option<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            app_config: RwLock::new(AppConfig::default()),
            settings: RwLock::new(Settings::default()),
            notes_cache: RwLock::new(HashMap::new()),
            notes_cache_root: RwLock::new(None),
            note_mutation_lock: tokio::sync::Mutex::new(()),
            file_watcher: Mutex::new(None),
            note_windows: Mutex::new(HashMap::new()),
            search_index: Mutex::new(None),
            debounce_map: Arc::new(Mutex::new(HashMap::new())),
            registered_task_quick_add_shortcut: Mutex::new(None),
        }
    }
}

// Utility: Sanitize filename from title
fn sanitize_filename(title: &str) -> String {
    let sanitized: String = title
        .chars()
        .filter(|c| *c != '\u{00A0}' && *c != '\u{FEFF}')
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect();

    let trimmed = sanitized.trim();
    if trimmed.is_empty() || is_effectively_empty(trimmed) {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

fn note_id_dir_prefix(id: &str) -> Option<&str> {
    id.rfind('/').map(|pos| &id[..pos])
}

#[cfg(test)]
fn is_default_placeholder_leaf(leaf: &str) -> bool {
    if leaf == "Untitled" {
        return true;
    }

    leaf.strip_prefix("Untitled-")
        .map(|suffix| !suffix.is_empty() && suffix.chars().all(|char| char.is_ascii_digit()))
        .unwrap_or(false)
}

#[cfg(test)]
fn is_default_placeholder_title(title: &str) -> bool {
    let trimmed = title.trim();
    if trimmed == "Untitled" {
        return true;
    }

    trimmed
        .strip_prefix("Untitled ")
        .map(|suffix| !suffix.is_empty() && suffix.chars().all(|char| char.is_ascii_digit()))
        .unwrap_or(false)
}

fn build_note_id_with_leaf(id: &str, leaf: &str) -> String {
    if let Some(prefix) = note_id_dir_prefix(id) {
        format!("{prefix}/{leaf}")
    } else {
        leaf.to_string()
    }
}

#[cfg(test)]
fn unique_note_id_for_leaf(
    notes_root: &Path,
    base_id: &str,
    desired_leaf: &str,
) -> Result<String, String> {
    let dir_prefix = note_id_dir_prefix(base_id);
    let original_id = build_note_id_with_leaf(base_id, desired_leaf);
    let mut candidate_id = original_id.clone();
    let mut counter = 1;

    while candidate_id != base_id
        && abs_path_from_id(notes_root, &candidate_id)
            .map(|path| path.exists())
            .unwrap_or(false)
    {
        let next_leaf = format!("{desired_leaf}-{counter}");
        candidate_id = if let Some(prefix) = dir_prefix {
            format!("{prefix}/{next_leaf}")
        } else {
            next_leaf
        };
        counter += 1;
    }

    Ok(candidate_id)
}

fn normalize_requested_note_leaf(new_name: &str) -> String {
    let trimmed = new_name.trim();
    let without_extension = trimmed
        .strip_suffix(".md")
        .or_else(|| trimmed.strip_suffix(".MD"))
        .unwrap_or(trimmed);
    sanitize_filename(without_extension)
}

async fn write_new_note_file(path: &Path, content: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .await?;

    if let Err(error) = file.write_all(content).await {
        let _ = fs::remove_file(path).await;
        return Err(error);
    }

    if let Err(error) = file.flush().await {
        let _ = fs::remove_file(path).await;
        return Err(error);
    }

    Ok(())
}

async fn create_unique_note_file(
    notes_root: &Path,
    base_id: &str,
    content: &[u8],
) -> Result<(String, PathBuf), String> {
    let mut candidate_id = base_id.to_string();
    let mut counter = 1;

    loop {
        let candidate_path = abs_path_from_id(notes_root, &candidate_id)?;
        match write_new_note_file(&candidate_path, content).await {
            Ok(()) => return Ok((candidate_id, candidate_path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                candidate_id = format!("{base_id}-{counter}");
                counter += 1;
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

async fn move_note_file_without_clobber(source: &Path, dest: &Path) -> std::io::Result<()> {
    let content = fs::read(source).await?;
    write_new_note_file(dest, &content).await?;

    if let Err(error) = fs::remove_file(source).await {
        let _ = fs::remove_file(dest).await;
        return Err(error);
    }

    Ok(())
}

/// Expands template tags in a note name template using local timezone
fn expand_note_name_template(template: &str) -> String {
    use chrono::Local;

    let mut result = template.to_string();

    // Get current time in local timezone
    let now = Local::now();

    // Timestamp tag (Unix timestamp)
    result = result.replace("{timestamp}", &now.timestamp().to_string());

    // Date tags
    result = result.replace("{date}", &now.format("%Y-%m-%d").to_string());
    result = result.replace("{year}", &now.format("%Y").to_string());
    result = result.replace("{month}", &now.format("%m").to_string());
    result = result.replace("{day}", &now.format("%d").to_string());

    // Time tags (use dash instead of colon for filename safety)
    result = result.replace("{time}", &now.format("%H-%M-%S").to_string());

    // Note: {counter} is handled in create_note function

    result
}

/// Extracts a display title from a note ID (filename)
fn extract_title_from_id(id: &str) -> String {
    // Get last path component (filename)
    let filename = id.rsplit('/').next().unwrap_or(id);

    // Convert to display title (replace dashes/underscores with spaces)
    let title = filename.replace(['-', '_'], " ");

    // Title case
    title
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().to_string() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// Utility: Check if a string is effectively empty
fn is_effectively_empty(s: &str) -> bool {
    s.chars()
        .all(|c| c.is_whitespace() || c == '\u{00A0}' || c == '\u{FEFF}')
}

/// Strip YAML frontmatter (leading `---` ... `---` block) from content.
fn strip_frontmatter(content: &str) -> &str {
    let trimmed = content.trim_start();
    if trimmed.starts_with("---") {
        // Find the closing --- (skip the opening line)
        if let Some(rest) = trimmed.strip_prefix("---") {
            if let Some(end) = rest.find("\n---") {
                // Skip past closing --- and the newline after it (handle CRLF)
                let after_close = &rest[end + 4..];
                return after_close
                    .strip_prefix("\r\n")
                    .or_else(|| after_close.strip_prefix('\n'))
                    .unwrap_or(after_close);
            }
        }
    }
    content
}

// Utility: Extract title from markdown content
fn extract_title(content: &str) -> String {
    let body = strip_frontmatter(content);
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(title) = trimmed.strip_prefix("# ") {
            let title = title.trim();
            if !is_effectively_empty(title) {
                return title.to_string();
            }
        }
        if !is_effectively_empty(trimmed) {
            return trimmed.chars().take(50).collect();
        }
    }
    "Untitled".to_string()
}

fn rewrite_content_heading(content: &str, new_title: &str) -> String {
    let new_heading = format!("# {new_title}");
    let frontmatter_end = if content.starts_with("---\n") || content.starts_with("---\r\n") {
        if let Some(rest) = content.strip_prefix("---") {
            if let Some(end) = rest.find("\n---") {
                let after_close = end + 4;
                let after_newline = &rest[after_close..];
                let advance = if after_newline.starts_with("\r\n") {
                    2
                } else if after_newline.starts_with('\n') {
                    1
                } else {
                    0
                };
                Some(3 + after_close + advance)
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    }
    .unwrap_or(0);

    let body = &content[frontmatter_end..];
    let mut body_lines = body.lines();
    if let Some(first_line) = body_lines.next() {
        if first_line.trim().starts_with("# ") {
            let remaining = body_lines.collect::<Vec<_>>().join("\n");
            let prefix = &content[..frontmatter_end];
            return if remaining.is_empty() {
                format!("{prefix}{new_heading}\n")
            } else {
                format!("{prefix}{new_heading}\n{remaining}")
            };
        }
    }

    let prefix = &content[..frontmatter_end];
    let suffix = &content[frontmatter_end..];
    if suffix.is_empty() {
        format!("{prefix}{new_heading}\n\n")
    } else {
        format!("{prefix}{new_heading}\n\n{suffix}")
    }
}

// Utility: Generate preview from content (strip markdown formatting)
fn generate_preview(content: &str) -> String {
    let body = strip_frontmatter(content);
    let preview_limit = NOTE_PREVIEW_MAX_CHARS;
    let preview_limit_without_ellipsis =
        preview_limit.saturating_sub(NOTE_PREVIEW_ELLIPSIS.chars().count());
    let mut preview = String::new();

    // Skip the first line (title), then collect enough body text to fill the UI clamp.
    for line in body.lines().skip(1) {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            let stripped = strip_markdown(trimmed);
            if !stripped.is_empty() {
                let normalized = stripped.split_whitespace().collect::<Vec<_>>().join(" ");
                if normalized.is_empty() {
                    continue;
                }

                let prefix_len = if preview.is_empty() { 0 } else { 1 };
                let next_len = preview.chars().count() + prefix_len + normalized.chars().count();

                if next_len <= preview_limit {
                    if !preview.is_empty() {
                        preview.push(' ');
                    }
                    preview.push_str(&normalized);
                    continue;
                }

                let remaining = preview_limit_without_ellipsis
                    .saturating_sub(preview.chars().count() + prefix_len);

                if !preview.is_empty() {
                    preview.push(' ');
                }

                if remaining > 0 {
                    let chunk: String = normalized.chars().take(remaining).collect();
                    preview.push_str(chunk.trim_end());
                }

                while preview.ends_with(' ') {
                    preview.pop();
                }

                if !preview.is_empty() {
                    preview.push_str(NOTE_PREVIEW_ELLIPSIS);
                }

                return preview;
            }
        }
    }

    preview
}

static IMG_RE: OnceLock<regex::Regex> = OnceLock::new();
static LINK_RE: OnceLock<regex::Regex> = OnceLock::new();
static LIST_RE: OnceLock<regex::Regex> = OnceLock::new();
static ANSI_RE: OnceLock<regex::Regex> = OnceLock::new();

// Strip common markdown formatting from text
fn strip_markdown(text: &str) -> String {
    let mut result = text.to_string();

    // Remove heading markers (##, ###, etc.)
    let trimmed = result.trim_start();
    if trimmed.starts_with('#') {
        result = trimmed.trim_start_matches('#').trim_start().to_string();
    }

    // Remove strikethrough (~~text~~) - before other markers
    while let Some(start) = result.find("~~") {
        if let Some(end) = result[start + 2..].find("~~") {
            let inner = &result[start + 2..start + 2 + end];
            result = format!(
                "{}{}{}",
                &result[..start],
                inner,
                &result[start + 4 + end..]
            );
        } else {
            break;
        }
    }

    // Remove bold (**text** or __text__) - before italic
    while let Some(start) = result.find("**") {
        if let Some(end) = result[start + 2..].find("**") {
            let inner = &result[start + 2..start + 2 + end];
            result = format!(
                "{}{}{}",
                &result[..start],
                inner,
                &result[start + 4 + end..]
            );
        } else {
            break;
        }
    }
    while let Some(start) = result.find("__") {
        if let Some(end) = result[start + 2..].find("__") {
            let inner = &result[start + 2..start + 2 + end];
            result = format!(
                "{}{}{}",
                &result[..start],
                inner,
                &result[start + 4 + end..]
            );
        } else {
            break;
        }
    }

    // Remove inline code (`code`)
    while let Some(start) = result.find('`') {
        if let Some(end) = result[start + 1..].find('`') {
            let inner = &result[start + 1..start + 1 + end];
            result = format!(
                "{}{}{}",
                &result[..start],
                inner,
                &result[start + 2 + end..]
            );
        } else {
            break;
        }
    }

    // Remove images ![alt](url) - must come before links
    let img_re = IMG_RE.get_or_init(|| regex::Regex::new(r"!\[([^\]]*)\]\([^)]+\)").unwrap());
    result = img_re.replace_all(&result, "$1").to_string();

    // Remove links [text](url)
    let link_re = LINK_RE.get_or_init(|| regex::Regex::new(r"\[([^\]]+)\]\([^)]+\)").unwrap());
    result = link_re.replace_all(&result, "$1").to_string();

    // Remove italic (*text* or _text_) - simple approach after bold is removed
    // Match *text* where text doesn't contain *
    while let Some(start) = result.find('*') {
        if let Some(end) = result[start + 1..].find('*') {
            if end > 0 {
                let inner = &result[start + 1..start + 1 + end];
                result = format!(
                    "{}{}{}",
                    &result[..start],
                    inner,
                    &result[start + 2 + end..]
                );
            } else {
                break;
            }
        } else {
            break;
        }
    }
    // Match _text_ where text doesn't contain _
    while let Some(start) = result.find('_') {
        if let Some(end) = result[start + 1..].find('_') {
            if end > 0 {
                let inner = &result[start + 1..start + 1 + end];
                result = format!(
                    "{}{}{}",
                    &result[..start],
                    inner,
                    &result[start + 2 + end..]
                );
            } else {
                break;
            }
        } else {
            break;
        }
    }

    // Remove task list markers
    result = result
        .replace("- [ ] ", "")
        .replace("- [x] ", "")
        .replace("- [X] ", "");

    // Remove list markers at start (-, *, +, 1.)
    let list_re = LIST_RE.get_or_init(|| regex::Regex::new(r"^(\s*[-+*]|\s*\d+\.)\s+").unwrap());
    result = list_re.replace(&result, "").to_string();

    result.trim().to_string()
}

/// Directories to exclude from note discovery and ID resolution.
const EXCLUDED_DIRS: &[&str] = &[".git", ".sly", ".obsidian", ".trash", "assets", ".tasks"];

/// Filter for WalkDir: skips excluded directories.
fn is_visible_notes_entry(entry: &walkdir::DirEntry) -> bool {
    if entry.file_type().is_dir() {
        let name = entry.file_name().to_str().unwrap_or("");
        return !EXCLUDED_DIRS.contains(&name);
    }
    true
}

/// Convert an absolute file path to a note ID (relative path from notes root, no .md extension, POSIX separators).
/// Returns None if the path is outside the root, not a .md file, or in an excluded directory.
fn id_from_abs_path(notes_root: &Path, file_path: &Path) -> Option<String> {
    let rel = file_path.strip_prefix(notes_root).ok()?;

    // Skip files inside excluded directories (.git, .sly, assets, etc.)
    // Only block specific known dirs so that dot-prefixed *files* like ".foo.md" are still visible.
    for component in rel.parent().unwrap_or(Path::new("")).components() {
        if let std::path::Component::Normal(name) = component {
            let name_str = name.to_str()?;
            if EXCLUDED_DIRS.contains(&name_str) {
                return None;
            }
        }
    }

    // Must be a .md file
    if file_path.extension()?.to_str()? != "md" {
        return None;
    }

    // Build ID: relative path without .md suffix, using POSIX separators.
    // Strip .md by converting to string and trimming (avoids with_extension
    // which breaks on stems containing dots like "meeting.2024-01-15.md").
    let rel_str = rel.to_str()?;
    let id = rel_str
        .strip_suffix(".md")?
        .replace(std::path::MAIN_SEPARATOR, "/");

    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

fn is_visible_notes_path(notes_root: &Path, path: &Path) -> bool {
    let rel = match path.strip_prefix(notes_root) {
        Ok(rel) => rel,
        Err(_) => return false,
    };

    if rel.as_os_str().is_empty() {
        return false;
    }

    for component in rel.components() {
        if let std::path::Component::Normal(name) = component {
            let name_str = match name.to_str() {
                Some(value) => value,
                None => return false,
            };
            if EXCLUDED_DIRS.contains(&name_str) {
                return false;
            }
        }
    }

    true
}

fn is_visible_folder_structure_path(
    notes_root: &Path,
    event_kind: &EventKind,
    path: &Path,
) -> bool {
    if !is_visible_notes_path(notes_root, path) {
        return false;
    }

    match event_kind {
        EventKind::Create(CreateKind::Folder) | EventKind::Remove(RemoveKind::Folder) => true,
        EventKind::Create(CreateKind::Any | CreateKind::Other) => path.is_dir(),
        EventKind::Modify(ModifyKind::Name(_)) => {
            path.is_dir() || path.extension().and_then(|ext| ext.to_str()) != Some("md")
        }
        _ => false,
    }
}

fn debounce_path(path: &Path, debounce_map: &Mutex<HashMap<PathBuf, Instant>>) -> bool {
    let mut map = debounce_map.lock().expect("debounce map mutex");
    let now = Instant::now();

    if map.len() > 100 {
        map.retain(|_, last| now.duration_since(*last) < Duration::from_secs(5));
    }

    if let Some(last) = map.get(path) {
        if now.duration_since(*last) < Duration::from_millis(500) {
            return false;
        }
    }

    map.insert(path.to_path_buf(), now);
    true
}

/// Convert a note ID to an absolute file path. Validates against path traversal.
fn abs_path_from_id(notes_root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.contains('\\') {
        return Err("Invalid note ID: backslashes not allowed".to_string());
    }

    let rel = Path::new(id);

    for component in rel.components() {
        match component {
            std::path::Component::ParentDir => {
                return Err("Invalid note ID: parent directory references not allowed".to_string());
            }
            std::path::Component::CurDir => {
                return Err("Invalid note ID: current directory references not allowed".to_string());
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err("Invalid note ID: absolute paths not allowed".to_string());
            }
            _ => {}
        }
    }

    // Append ".md" via OsString to avoid with_extension replacing dots in stems
    // (e.g. "meeting.2024-01-15" would become "meeting.md" with with_extension)
    let joined = notes_root.join(rel);
    let mut file_path_os = joined.into_os_string();
    file_path_os.push(".md");
    let file_path = PathBuf::from(file_path_os);

    if !file_path.starts_with(notes_root) {
        return Err("Invalid note ID: path escapes notes folder".to_string());
    }

    Ok(file_path)
}

fn dedupe_note_ids(ids: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::with_capacity(ids.len());

    for id in ids {
        if seen.insert(id.clone()) {
            deduped.push(id.clone());
        }
    }

    deduped
}

fn leaf_from_note_id(id: &str) -> &str {
    id.rsplit('/').next().unwrap_or(id)
}

fn build_note_move_results(
    ids: &[String],
    target_folder: &str,
) -> Result<Vec<NoteMoveResult>, String> {
    if !target_folder.is_empty() {
        validate_folder_path(target_folder)?;
    }

    let mut final_ids = HashSet::new();
    let mut move_results = Vec::new();

    for id in dedupe_note_ids(ids) {
        let leaf = leaf_from_note_id(&id);
        let next_id = if target_folder.is_empty() {
            leaf.to_string()
        } else {
            format!("{}/{}", target_folder, leaf)
        };

        if !final_ids.insert(next_id.clone()) {
            return Err("A note with that name already exists in the target folder".to_string());
        }

        move_results.push(NoteMoveResult {
            from: id,
            to: next_id,
        });
    }

    Ok(move_results)
}

fn prune_deleted_pinned_note_ids(
    pinned_note_ids: &mut Vec<String>,
    deleted_note_ids: &HashSet<String>,
) -> bool {
    let initial_len = pinned_note_ids.len();
    pinned_note_ids.retain(|id| !deleted_note_ids.contains(id));
    pinned_note_ids.len() != initial_len
}

fn apply_note_move_results_to_pinned_ids(
    pinned_note_ids: &mut [String],
    move_results: &[NoteMoveResult],
) -> bool {
    let move_map: HashMap<&str, &str> = move_results
        .iter()
        .filter(|result| result.from != result.to)
        .map(|result| (result.from.as_str(), result.to.as_str()))
        .collect();

    let mut changed = false;
    for pinned_id in pinned_note_ids.iter_mut() {
        if let Some(next_id) = move_map.get(pinned_id.as_str()) {
            if pinned_id != next_id {
                *pinned_id = (*next_id).to_string();
                changed = true;
            }
        }
    }

    changed
}

fn apply_note_move_results_to_cache(
    notes_cache: &mut HashMap<String, NoteMetadata>,
    move_results: &[NoteMoveResult],
) {
    for result in move_results {
        if result.from == result.to {
            continue;
        }

        if let Some(mut metadata) = notes_cache.remove(&result.from) {
            metadata.id = result.to.clone();
            notes_cache.insert(result.to.clone(), metadata);
        }
    }
}

// Get search index path
fn get_search_index_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data)?;
    Ok(app_data.join("search_index"))
}

fn metadata_time_secs(result: std::io::Result<std::time::SystemTime>) -> Option<i64> {
    result
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
}

fn rewrite_folder_icon_paths(
    folder_icons: &mut HashMap<String, FolderAppearance>,
    old_path: &str,
    new_path: &str,
) {
    let old_prefix = format!("{}/", old_path);
    let new_prefix = format!("{}/", new_path);

    let updates: Vec<(String, String, FolderAppearance)> = folder_icons
        .iter()
        .filter_map(|(path, folder_appearance)| {
            if path == old_path {
                Some((
                    path.clone(),
                    new_path.to_string(),
                    folder_appearance.clone(),
                ))
            } else if path.starts_with(&old_prefix) {
                Some((
                    path.clone(),
                    format!("{}{}", new_prefix, &path[old_prefix.len()..]),
                    folder_appearance.clone(),
                ))
            } else {
                None
            }
        })
        .collect();

    for (old_key, new_key, folder_appearance) in updates {
        folder_icons.remove(&old_key);
        folder_icons.insert(new_key, folder_appearance);
    }
}

fn remove_folder_icon_paths(folder_icons: &mut HashMap<String, FolderAppearance>, path: &str) {
    let prefix = format!("{}/", path);
    folder_icons.retain(|folder_path, _| folder_path != path && !folder_path.starts_with(&prefix));
}

fn rewrite_folder_note_sort_mode_paths(
    folder_note_sort_modes: &mut HashMap<String, NoteSortMode>,
    old_path: &str,
    new_path: &str,
) {
    let old_prefix = format!("{}/", old_path);
    let new_prefix = format!("{}/", new_path);

    let updates: Vec<(String, String, NoteSortMode)> = folder_note_sort_modes
        .iter()
        .filter_map(|(path, note_sort_mode)| {
            if path == old_path {
                Some((path.clone(), new_path.to_string(), *note_sort_mode))
            } else if path.starts_with(&old_prefix) {
                Some((
                    path.clone(),
                    format!("{}{}", new_prefix, &path[old_prefix.len()..]),
                    *note_sort_mode,
                ))
            } else {
                None
            }
        })
        .collect();

    for (old_key, new_key, note_sort_mode) in updates {
        folder_note_sort_modes.remove(&old_key);
        folder_note_sort_modes.insert(new_key, note_sort_mode);
    }
}

fn remove_folder_note_sort_mode_paths(
    folder_note_sort_modes: &mut HashMap<String, NoteSortMode>,
    path: &str,
) {
    let prefix = format!("{}/", path);
    folder_note_sort_modes
        .retain(|folder_path, _| folder_path != path && !folder_path.starts_with(&prefix));
}

fn sanitize_collapsed_folder_paths(collapsed_folders: &mut Vec<String>) {
    let mut seen = HashSet::new();
    collapsed_folders.retain(|path| !path.trim().is_empty() && seen.insert(path.clone()));
}

fn remove_collapsed_folder_paths(collapsed_folders: &mut Vec<String>, path: &str) {
    let prefix = format!("{}/", path);
    collapsed_folders
        .retain(|folder_path| folder_path != path && !folder_path.starts_with(&prefix));
    sanitize_collapsed_folder_paths(collapsed_folders);
}

fn rewrite_collapsed_folder_paths(
    collapsed_folders: &mut Vec<String>,
    old_path: &str,
    new_path: &str,
) {
    let old_prefix = format!("{}/", old_path);

    for folder_path in collapsed_folders.iter_mut() {
        if *folder_path == old_path {
            *folder_path = new_path.to_string();
        } else if folder_path.starts_with(&old_prefix) {
            *folder_path = format!("{}/{}", new_path, &folder_path[old_prefix.len()..]);
        }
    }

    sanitize_collapsed_folder_paths(collapsed_folders);
}

fn rewrite_note_id_prefixes(note_ids: &mut [String], old_path: &str, new_path: &str) -> bool {
    let old_prefix = format!("{}/", old_path);
    let new_prefix = format!("{}/", new_path);
    let mut changed = false;

    for note_id in note_ids.iter_mut() {
        if note_id.starts_with(&old_prefix) {
            *note_id = format!("{}{}", new_prefix, &note_id[old_prefix.len()..]);
            changed = true;
        }
    }

    changed
}

fn remove_note_ids_with_prefix(note_ids: &mut Vec<String>, path: &str) -> bool {
    let prefix = format!("{}/", path);
    let original_len = note_ids.len();
    note_ids.retain(|note_id| !note_id.starts_with(&prefix));
    note_ids.len() != original_len
}

fn note_sort_value_cmp(left: i64, right: i64, descending: bool) -> Ordering {
    if descending {
        right.cmp(&left)
    } else {
        left.cmp(&right)
    }
}

fn compare_note_metadata(
    left: &NoteMetadata,
    right: &NoteMetadata,
    note_sort_mode: NoteSortMode,
) -> Ordering {
    let ordering = match note_sort_mode {
        NoteSortMode::ModifiedDesc => note_sort_value_cmp(left.modified, right.modified, true),
        NoteSortMode::ModifiedAsc => note_sort_value_cmp(left.modified, right.modified, false),
        NoteSortMode::CreatedDesc => note_sort_value_cmp(left.created, right.created, true),
        NoteSortMode::CreatedAsc => note_sort_value_cmp(left.created, right.created, false),
        NoteSortMode::TitleAsc => left
            .title
            .to_lowercase()
            .cmp(&right.title.to_lowercase())
            .then_with(|| left.title.cmp(&right.title)),
        NoteSortMode::TitleDesc => right
            .title
            .to_lowercase()
            .cmp(&left.title.to_lowercase())
            .then_with(|| right.title.cmp(&left.title)),
    };

    ordering
        .then_with(|| right.modified.cmp(&left.modified))
        .then_with(|| left.id.cmp(&right.id))
}

fn resolve_created_timestamp(created: Option<i64>, modified: i64) -> i64 {
    created.unwrap_or(modified)
}

fn build_note_metadata(id: String, content: &str, modified: i64, created: i64) -> NoteMetadata {
    NoteMetadata {
        id,
        title: extract_title(content),
        preview: generate_preview(content),
        modified,
        created,
    }
}

fn refresh_note_metadata_from_path(
    notes_root: &Path,
    file_path: &Path,
    preserved_created: Option<i64>,
) -> Option<NoteMetadata> {
    let id = id_from_abs_path(notes_root, file_path)?;
    let metadata = std::fs::metadata(file_path).ok()?;
    let modified = metadata_time_secs(metadata.modified()).unwrap_or(0);
    let created = resolve_created_timestamp(
        preserved_created.or_else(|| metadata_time_secs(metadata.created())),
        modified,
    );
    let content = std::fs::read_to_string(file_path).ok()?;
    Some(build_note_metadata(id, &content, modified, created))
}

fn rebuild_notes_cache_incrementally(
    notes_root: &Path,
    existing_cache: &HashMap<String, NoteMetadata>,
) -> HashMap<String, NoteMetadata> {
    use walkdir::WalkDir;

    let mut next_cache = HashMap::with_capacity(existing_cache.len());

    for entry in WalkDir::new(notes_root)
        .max_depth(10)
        .into_iter()
        .filter_entry(is_visible_notes_entry)
        .flatten()
    {
        let file_path = entry.path();
        if !file_path.is_file() {
            continue;
        }

        let Some(id) = id_from_abs_path(notes_root, file_path) else {
            continue;
        };

        let metadata = entry.metadata().ok();
        let modified = metadata
            .as_ref()
            .and_then(|metadata| metadata_time_secs(metadata.modified()))
            .unwrap_or(0);
        let created_from_disk = resolve_created_timestamp(
            metadata
                .as_ref()
                .and_then(|metadata| metadata_time_secs(metadata.created())),
            modified,
        );

        if let Some(cached) = existing_cache.get(&id) {
            if cached.modified == modified {
                let mut cached_metadata = cached.clone();
                if cached_metadata.created == 0 {
                    cached_metadata.created = created_from_disk;
                }
                next_cache.insert(id, cached_metadata);
                continue;
            }
        }

        let created = existing_cache
            .get(&id)
            .map(|metadata| metadata.created)
            .filter(|created| *created > 0)
            .unwrap_or(created_from_disk);

        if let Ok(content) = std::fs::read_to_string(file_path) {
            next_cache.insert(
                id.clone(),
                build_note_metadata(id, &content, modified, created),
            );
        }
    }

    next_cache
}

fn sort_notes(
    notes: &mut [NoteMetadata],
    pinned_ids: &HashSet<String>,
    note_sort_mode: NoteSortMode,
) {
    notes.sort_by(|left, right| {
        let left_pinned = pinned_ids.contains(&left.id);
        let right_pinned = pinned_ids.contains(&right.id);

        match (left_pinned, right_pinned) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            _ => compare_note_metadata(left, right, note_sort_mode),
        }
    });
}

// Clean up old entries from debounce map (entries older than 5 seconds)
fn cleanup_debounce_map(map: &Mutex<HashMap<PathBuf, Instant>>) {
    let mut map = map.lock().expect("debounce map mutex");
    let now = Instant::now();
    map.retain(|_, last| now.duration_since(*last) < Duration::from_secs(5));
}

// Normalize notes folder path input from the UI/config.
fn normalize_notes_folder_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Notes folder path is empty".to_string());
    }

    Ok(PathBuf::from(trimmed))
}

/// Shared initialization logic for setting a notes folder.
/// Creates required directories, verifies write access, updates config/settings,
/// adds asset protocol scope, and rebuilds the search index.
fn initialize_notes_folder(
    app: &AppHandle,
    path_buf: &PathBuf,
    state: &AppState,
) -> Result<String, String> {
    let normalized_path = path_buf.to_string_lossy().into_owned();

    // Verify it's a valid directory
    if !path_buf.exists() {
        std::fs::create_dir_all(path_buf).map_err(|e| e.to_string())?;
    }

    // Create assets folder
    let assets = path_buf.join("assets");
    std::fs::create_dir_all(&assets).map_err(|e| e.to_string())?;

    // Create .sly config folder
    let sly_dir = path_buf.join(".sly");
    std::fs::create_dir_all(&sly_dir).map_err(|e| e.to_string())?;

    // Verify write access early to avoid later silent failures
    let write_test_path = sly_dir.join(".write-test");
    std::fs::write(&write_test_path, b"ok")
        .map_err(|e| format!("Notes folder is not writable: {}", e))?;
    let _ = std::fs::remove_file(&write_test_path);

    // Load per-folder settings (starts fresh with defaults if none exist)
    let settings = load_settings(&normalized_path);

    // Update app config with the active notes folder.
    {
        let mut app_config = state.app_config.write().expect("app_config write lock");
        app_config.notes_folder = Some(normalized_path.clone());
        save_app_config(app, &app_config).map_err(|e| e.to_string())?;
    }

    // Update settings in memory
    {
        let mut current_settings = state.settings.write().expect("settings write lock");
        *current_settings = settings;
    }

    // Add notes folder to asset protocol scope so images can be served
    let _ = app.asset_protocol_scope().allow_directory(path_buf, true);

    // Initialize search index
    if let Ok(index_path) = get_search_index_path(app) {
        if let Ok(search_index) = SearchIndex::new(&index_path) {
            let _ = search_index.rebuild_index(path_buf);
            let mut index = state.search_index.lock().expect("search index mutex");
            *index = Some(search_index);
        }
    }

    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        cache.clear();
    }
    {
        let mut cache_root = state
            .notes_cache_root
            .write()
            .expect("cache root write lock");
        *cache_root = None;
    }

    if let Err(error) = sync_task_quick_add_shortcut(app, state) {
        eprintln!("Failed to sync task quick add shortcut: {error}");
        let _ = app.emit_to("main", TASK_QUICK_ADD_SHORTCUT_ERROR_EVENT, error);
    }

    Ok(normalized_path)
}

// TAURI COMMANDS

#[tauri::command]
fn get_notes_folder(state: State<AppState>) -> Option<String> {
    state
        .app_config
        .read()
        .expect("app_config read lock")
        .notes_folder
        .clone()
}

#[tauri::command]
fn set_notes_folder(app: AppHandle, path: String, state: State<AppState>) -> Result<(), String> {
    let path_buf = normalize_notes_folder_path(&path)?;
    initialize_notes_folder(&app, &path_buf, &state)?;
    Ok(())
}

#[tauri::command]
async fn list_notes(state: State<'_, AppState>) -> Result<Vec<NoteMetadata>, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    let path = PathBuf::from(&folder);
    if !path.exists() {
        {
            let mut cache = state.notes_cache.write().expect("cache write lock");
            cache.clear();
        }
        {
            let mut cache_root = state
                .notes_cache_root
                .write()
                .expect("cache root write lock");
            *cache_root = Some(folder);
        }
        return Ok(vec![]);
    }

    let path_clone = path.clone();
    let existing_cache = {
        let cache_root = state
            .notes_cache_root
            .read()
            .expect("cache root read lock")
            .clone();
        if cache_root.as_deref() == Some(folder.as_str()) {
            state.notes_cache.read().expect("cache read lock").clone()
        } else {
            HashMap::new()
        }
    };

    let refreshed_cache = tokio::task::spawn_blocking(move || {
        rebuild_notes_cache_incrementally(&path_clone, &existing_cache)
    })
    .await
    .map_err(|e| e.to_string())?;

    let mut notes: Vec<NoteMetadata> = refreshed_cache.values().cloned().collect();

    // Load note sort settings
    let (pinned_ids, note_sort_mode): (HashSet<String>, NoteSortMode) = {
        let settings = state.settings.read().expect("settings read lock");
        (
            settings
                .pinned_note_ids
                .as_ref()
                .map(|ids| ids.iter().cloned().collect())
                .unwrap_or_default(),
            settings.note_sort_mode,
        )
    };

    // Sort: pinned notes first, then selected mode within pinned/unpinned groups.
    sort_notes(&mut notes, &pinned_ids, note_sort_mode);

    // Update cache efficiently
    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        *cache = refreshed_cache;
    }
    {
        let mut cache_root = state
            .notes_cache_root
            .write()
            .expect("cache root write lock");
        *cache_root = Some(folder);
    }

    Ok(notes)
}

#[tauri::command]
async fn read_note(id: String, state: State<'_, AppState>) -> Result<Note, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    let folder_path = PathBuf::from(&folder);
    let file_path = abs_path_from_id(&folder_path, &id)?;
    if !file_path.exists() {
        return Err("Note not found".to_string());
    }

    let content = fs::read_to_string(&file_path).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::InvalidData {
            "File is not valid UTF-8. Sly only supports UTF-8 encoded notes.".to_string()
        } else {
            e.to_string()
        }
    })?;
    let metadata = fs::metadata(&file_path).await.map_err(|e| e.to_string())?;

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    Ok(Note {
        id,
        title: extract_title(&content),
        content,
        path: file_path.to_string_lossy().into_owned(),
        modified,
    })
}

#[tauri::command]
async fn save_note(
    id: Option<String>,
    content: String,
    state: State<'_, AppState>,
) -> Result<Note, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_path = PathBuf::from(&folder);
    let _mutation_guard = state.note_mutation_lock.lock().await;

    let title = extract_title(&content);
    let has_existing_id = id.is_some();

    let (final_id, file_path) = if let Some(existing_id) = id {
        let existing_path = abs_path_from_id(&folder_path, &existing_id)?;
        if !existing_path.exists() {
            return Err("Note not found".to_string());
        }
        (existing_id, existing_path)
    } else {
        let sanitized_leaf = sanitize_filename(&title);
        create_unique_note_file(&folder_path, &sanitized_leaf, content.as_bytes()).await?
    };

    if has_existing_id {
        // Existing notes keep their current path and are overwritten in place.
        fs::write(&file_path, &content)
            .await
            .map_err(|e| e.to_string())?;
    }

    let metadata = fs::metadata(&file_path).await.map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Update search index (delete old entry if renamed, then add new)
    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.index_note(&final_id, &title, &content, modified);
        }
    }

    Ok(Note {
        id: final_id,
        title,
        content,
        path: file_path.to_string_lossy().into_owned(),
        modified,
    })
}

#[tauri::command]
async fn rename_note(
    id: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<Note, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_path = PathBuf::from(&folder);
    let _mutation_guard = state.note_mutation_lock.lock().await;
    let old_file_path = abs_path_from_id(&folder_path, &id)?;
    if !old_file_path.exists() {
        return Err("Note not found".to_string());
    }

    let content = fs::read_to_string(&old_file_path)
        .await
        .map_err(|e| e.to_string())?;
    let title = extract_title(&content);
    let desired_leaf = normalize_requested_note_leaf(&new_name);
    let desired_id = build_note_id_with_leaf(&id, &desired_leaf);

    let (final_id, file_path) = if desired_id != id {
        let mut candidate_id = desired_id;
        let mut counter = 1;

        let new_file_path = loop {
            let candidate_path = abs_path_from_id(&folder_path, &candidate_id)?;
            match move_note_file_without_clobber(&old_file_path, &candidate_path).await {
                Ok(()) => break candidate_path,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    candidate_id =
                        build_note_id_with_leaf(&id, &format!("{desired_leaf}-{counter}"));
                    counter += 1;
                }
                Err(error) => return Err(error.to_string()),
            }
        };

        {
            let mut cache = state.notes_cache.write().expect("cache write lock");
            cache.remove(&id);
        }

        {
            let index = state.search_index.lock().expect("search index mutex");
            if let Some(ref search_index) = *index {
                let _ = search_index.delete_note(&id);
            }
        }

        {
            let mut note_windows = state.note_windows.lock().expect("note windows mutex");
            if let Some(label) = note_windows.remove(&id) {
                note_windows.insert(candidate_id.clone(), label);
            }
        }

        (candidate_id, new_file_path)
    } else {
        (id.clone(), old_file_path)
    };

    let metadata = fs::metadata(&file_path).await.map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let preview = generate_preview(&content);
    let created = {
        let cache = state.notes_cache.read().expect("cache read lock");
        cache.get(&id).map(|note| note.created).unwrap_or(modified)
    };

    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.index_note(&final_id, &title, &content, modified);
        }
    }

    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        cache.insert(
            final_id.clone(),
            NoteMetadata {
                id: final_id.clone(),
                title: title.clone(),
                preview,
                modified,
                created,
            },
        );
    }

    Ok(Note {
        id: final_id,
        title,
        content,
        path: file_path.to_string_lossy().into_owned(),
        modified,
    })
}

#[tauri::command]
async fn delete_note(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    let folder_path = PathBuf::from(&folder);
    let file_path = abs_path_from_id(&folder_path, &id)?;
    if file_path.exists() {
        fs::remove_file(&file_path)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Update search index
    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.delete_note(&id);
        }
    }

    // Remove from cache
    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        cache.remove(&id);
    }

    Ok(())
}

#[tauri::command]
async fn delete_notes(ids: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    let folder_path = PathBuf::from(&folder);
    let deleted_ids = dedupe_note_ids(&ids);
    if deleted_ids.is_empty() {
        return Ok(());
    }

    for id in &deleted_ids {
        let file_path = abs_path_from_id(&folder_path, id)?;
        if file_path.exists() {
            fs::remove_file(&file_path)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    let deleted_id_set: HashSet<String> = deleted_ids.iter().cloned().collect();

    {
        let mut settings = state.settings.write().expect("settings write lock");
        let mut settings_changed = false;
        if let Some(ref mut pinned_note_ids) = settings.pinned_note_ids {
            settings_changed = prune_deleted_pinned_note_ids(pinned_note_ids, &deleted_id_set);
        }
        if settings_changed {
            let _ = save_settings(&folder, &settings);
        }
    }

    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        for id in &deleted_ids {
            cache.remove(id);
        }
    }

    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.rebuild_index(&folder_path);
        }
    }

    Ok(())
}

#[tauri::command]
async fn create_note(
    target_folder: Option<String>,
    state: State<'_, AppState>,
) -> Result<Note, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_path = PathBuf::from(&folder);
    let _mutation_guard = state.note_mutation_lock.lock().await;

    // Get template from settings (default "Untitled")
    let template = {
        let settings = state.settings.read().expect("settings read lock");
        settings
            .default_note_name
            .clone()
            .unwrap_or_else(|| "Untitled".to_string())
    };

    // Expand template tags
    let expanded = expand_note_name_template(&template);

    // Sanitize filename
    let sanitized = sanitize_filename(&expanded);

    // Prepend folder prefix if specified
    let sanitized = if let Some(ref folder_prefix) = target_folder {
        if folder_prefix.is_empty() {
            sanitized
        } else {
            format!("{}/{}", folder_prefix.trim_end_matches('/'), sanitized)
        }
    } else {
        sanitized
    };

    // Handle {counter} tag
    let has_counter = template.contains("{counter}");
    let base_id = if has_counter {
        sanitized.replace("{counter}", "1")
    } else {
        sanitized.clone()
    };

    let mut final_id = base_id.clone();
    let mut counter = if has_counter { 2 } else { 1 };
    let (final_id, file_path, content, display_title) = loop {
        let display_title = extract_title_from_id(&final_id);
        let content = format!("# {}\n\n", display_title);
        let candidate_path = abs_path_from_id(&folder_path, &final_id)?;

        match write_new_note_file(&candidate_path, content.as_bytes()).await {
            Ok(()) => break (final_id, candidate_path, content, display_title),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if has_counter {
                    final_id = sanitized.replace("{counter}", &counter.to_string());
                } else {
                    final_id = format!("{}-{}", base_id, counter);
                }
                counter += 1;
            }
            Err(error) => return Err(error.to_string()),
        }
    };

    let modified = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Update search index
    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.index_note(&final_id, &display_title, &content, modified);
        }
    }

    Ok(Note {
        id: final_id,
        title: display_title,
        content,
        path: file_path.to_string_lossy().into_owned(),
        modified,
    })
}

#[tauri::command]
async fn duplicate_note(id: String, state: State<'_, AppState>) -> Result<Note, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_path = PathBuf::from(&folder);
    let _mutation_guard = state.note_mutation_lock.lock().await;
    let source_path = abs_path_from_id(&folder_path, &id)?;
    if !source_path.exists() {
        return Err("Note not found".to_string());
    }

    let original_content = fs::read_to_string(&source_path)
        .await
        .map_err(|e| e.to_string())?;
    let source_title = extract_title(&original_content);
    let duplicate_title = format!("{source_title} (Copy)");
    let duplicate_content = rewrite_content_heading(&original_content, &duplicate_title);
    let desired_leaf = sanitize_filename(&duplicate_title);
    let base_id = build_note_id_with_leaf(&id, &desired_leaf);
    let (final_id, file_path) =
        create_unique_note_file(&folder_path, &base_id, duplicate_content.as_bytes()).await?;

    let metadata = fs::metadata(&file_path).await.map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let created = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(modified);

    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ =
                search_index.index_note(&final_id, &duplicate_title, &duplicate_content, modified);
        }
    }

    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        cache.insert(
            final_id.clone(),
            NoteMetadata {
                id: final_id.clone(),
                title: duplicate_title.clone(),
                preview: generate_preview(&duplicate_content),
                modified,
                created,
            },
        );
    }

    Ok(Note {
        id: final_id,
        title: duplicate_title,
        content: duplicate_content,
        path: file_path.to_string_lossy().into_owned(),
        modified,
    })
}

/// Validate a relative folder path against traversal attacks
const RESERVED_FOLDER_NAMES: &[&str] = &[".git", ".sly", ".obsidian", ".trash", "assets"];

fn validate_folder_path(path: &str) -> Result<(), String> {
    if path.contains('\\') {
        return Err("Invalid path: backslashes not allowed".to_string());
    }
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    let rel = Path::new(path);
    for component in rel.components() {
        match component {
            std::path::Component::ParentDir => {
                return Err("Path traversal not allowed".to_string());
            }
            std::path::Component::CurDir => {
                return Err("Invalid path: current directory references not allowed".to_string());
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err("Invalid path: absolute paths not allowed".to_string());
            }
            std::path::Component::Normal(name) => {
                if let Some(name_str) = name.to_str() {
                    if RESERVED_FOLDER_NAMES.contains(&name_str) {
                        return Err(format!("'{}' is a reserved folder name", name_str));
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn list_folders(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_path = PathBuf::from(&folder);

    let fp = folder_path.clone();
    tokio::task::spawn_blocking(move || {
        let mut folders = Vec::new();
        use walkdir::WalkDir;
        for entry in WalkDir::new(&fp)
            .max_depth(10)
            .into_iter()
            .filter_entry(is_visible_notes_entry)
            .flatten()
        {
            if entry.file_type().is_dir() && entry.path() != fp {
                if let Ok(rel) = entry.path().strip_prefix(&fp) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    if !rel_str.is_empty() {
                        folders.push(rel_str);
                    }
                }
            }
        }
        folders.sort();
        folders
    })
    .await
    .map_err(|e| format!("Failed to list folders: {}", e))
}

#[tauri::command]
async fn create_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    validate_folder_path(&path)?;

    let target = PathBuf::from(&folder).join(path.replace('/', std::path::MAIN_SEPARATOR_STR));

    if !target.starts_with(&folder) {
        return Err("Invalid path: escapes notes folder".to_string());
    }

    fs::create_dir_all(&target)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn delete_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    validate_folder_path(&path)?;

    let target = PathBuf::from(&folder).join(path.replace('/', std::path::MAIN_SEPARATOR_STR));

    if !target.starts_with(&folder) {
        return Err("Invalid path: escapes notes folder".to_string());
    }

    if !target.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    // Remove notes from search index
    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let cache = state.notes_cache.read().expect("cache read lock");
            let prefix = format!("{}/", path);
            for note_id in cache.keys() {
                if note_id.starts_with(&prefix) {
                    let _ = search_index.delete_note(note_id);
                }
            }
        }
    }

    // Remove notes from cache
    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        let prefix = format!("{}/", path);
        cache.retain(|id, _| !id.starts_with(&prefix));
    }

    {
        let mut settings = state.settings.write().expect("settings write lock");
        let mut settings_changed = false;
        let mut clear_pinned = false;
        if let Some(ref mut pinned_note_ids) = settings.pinned_note_ids {
            if remove_note_ids_with_prefix(pinned_note_ids, &path) {
                settings_changed = true;
            }
            clear_pinned = pinned_note_ids.is_empty();
        }
        if clear_pinned {
            settings.pinned_note_ids = None;
        }
        let mut clear_recent = false;
        if let Some(ref mut recent_note_ids) = settings.recent_note_ids {
            if remove_note_ids_with_prefix(recent_note_ids, &path) {
                settings_changed = true;
            }
            clear_recent = recent_note_ids.is_empty();
        }
        if clear_recent {
            settings.recent_note_ids = None;
        }
        let mut clear_folder_icons = false;
        if let Some(ref mut folder_icons) = settings.folder_icons {
            let previous_len = folder_icons.len();
            remove_folder_icon_paths(folder_icons, &path);
            if folder_icons.len() != previous_len {
                settings_changed = true;
            }
            clear_folder_icons = folder_icons.is_empty();
        }
        if clear_folder_icons {
            settings.folder_icons = None;
        }
        let mut clear_folder_note_sort_modes = false;
        if let Some(ref mut folder_note_sort_modes) = settings.folder_note_sort_modes {
            let previous_len = folder_note_sort_modes.len();
            remove_folder_note_sort_mode_paths(folder_note_sort_modes, &path);
            if folder_note_sort_modes.len() != previous_len {
                settings_changed = true;
            }
            clear_folder_note_sort_modes = folder_note_sort_modes.is_empty();
        }
        if clear_folder_note_sort_modes {
            settings.folder_note_sort_modes = None;
        }
        if let Some(ref mut collapsed_folders) = settings.collapsed_folders {
            let previous_len = collapsed_folders.len();
            remove_collapsed_folder_paths(collapsed_folders, &path);
            if collapsed_folders.len() != previous_len {
                settings_changed = true;
            }
        }
        if settings_changed {
            let _ = save_settings(&folder, &settings);
        }
    }

    fs::remove_dir_all(&target)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn rename_folder(
    old_path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    validate_folder_path(&old_path)?;

    // Sanitize new name (no slashes allowed in the name itself)
    let sanitized_name = new_name
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-")
        .trim()
        .to_string();
    if sanitized_name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let folder_root = PathBuf::from(&folder);
    let old_target = folder_root.join(old_path.replace('/', std::path::MAIN_SEPARATOR_STR));

    if !old_target.starts_with(&folder_root) {
        return Err("Invalid path: escapes notes folder".to_string());
    }
    if !old_target.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    // Build new path: same parent, new name
    let new_target = old_target
        .parent()
        .ok_or("Cannot determine parent directory")?
        .join(&sanitized_name);

    if new_target.exists() {
        return Err("A folder with that name already exists".to_string());
    }

    // Compute old and new path prefixes for updating IDs
    let old_prefix = format!("{}/", old_path);
    let new_path = if let Some(pos) = old_path.rfind('/') {
        format!("{}/{}", &old_path[..pos], sanitized_name)
    } else {
        sanitized_name.clone()
    };
    let new_prefix = format!("{}/", new_path);

    // Rename on disk
    tokio::fs::rename(&old_target, &new_target)
        .await
        .map_err(|e| e.to_string())?;

    // Update pinned note IDs in settings
    {
        let mut settings = state.settings.write().expect("settings write lock");
        if let Some(ref mut pinned) = settings.pinned_note_ids {
            rewrite_note_id_prefixes(pinned, &old_path, &new_path);
        }
        if let Some(ref mut recent_note_ids) = settings.recent_note_ids {
            rewrite_note_id_prefixes(recent_note_ids, &old_path, &new_path);
        }
        if let Some(ref mut folder_icons) = settings.folder_icons {
            rewrite_folder_icon_paths(folder_icons, &old_path, &new_path);
        }
        if let Some(ref mut folder_note_sort_modes) = settings.folder_note_sort_modes {
            rewrite_folder_note_sort_mode_paths(folder_note_sort_modes, &old_path, &new_path);
        }
        if let Some(ref mut collapsed_folders) = settings.collapsed_folders {
            rewrite_collapsed_folder_paths(collapsed_folders, &old_path, &new_path);
        }
        // Save settings
        let _ = save_settings(&folder, &settings);
    }

    // Update cache
    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        let updates: Vec<(String, String)> = cache
            .keys()
            .filter(|id| id.starts_with(&old_prefix))
            .map(|id| {
                let new_id = format!("{}{}", new_prefix, &id[old_prefix.len()..]);
                (id.clone(), new_id)
            })
            .collect();
        for (old_id, new_id) in updates {
            if let Some(mut meta) = cache.remove(&old_id) {
                meta.id = new_id.clone();
                cache.insert(new_id, meta);
            }
        }
    }

    // Rebuild search index for affected notes
    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.rebuild_index(&folder_root);
        }
    }

    Ok(())
}

#[tauri::command]
async fn move_note(
    id: String,
    target_folder: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_root = PathBuf::from(&folder);
    let _mutation_guard = state.note_mutation_lock.lock().await;
    let source_path = abs_path_from_id(&folder_root, &id)?;

    if !source_path.exists() {
        return Err("Note not found".to_string());
    }

    // Extract the filename (leaf) from the note ID
    let leaf = id.rsplit('/').next().unwrap_or(&id);

    // Build new ID
    let new_id = if target_folder.is_empty() {
        leaf.to_string()
    } else {
        validate_folder_path(&target_folder)?;
        format!("{}/{}", target_folder, leaf)
    };

    if new_id == id {
        return Ok(id);
    }

    let dest_path = abs_path_from_id(&folder_root, &new_id)?;

    // Ensure target directory exists
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Handle collision
    if dest_path.exists() {
        return Err("A note with that name already exists in the target folder".to_string());
    }

    move_note_file_without_clobber(&source_path, &dest_path)
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                "A note with that name already exists in the target folder".to_string()
            } else {
                e.to_string()
            }
        })?;

    // Update pinned note IDs
    {
        let mut settings = state.settings.write().expect("settings write lock");
        if let Some(ref mut pinned) = settings.pinned_note_ids {
            for pin_id in pinned.iter_mut() {
                if *pin_id == id {
                    *pin_id = new_id.clone();
                }
            }
        }
        let _ = save_settings(&folder, &settings);
    }

    // Update cache
    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        if let Some(mut meta) = cache.remove(&id) {
            meta.id = new_id.clone();
            cache.insert(new_id.clone(), meta);
        }
    }

    // Rebuild search index
    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.rebuild_index(&folder_root);
        }
    }

    Ok(new_id)
}

#[tauri::command]
async fn move_notes(
    ids: Vec<String>,
    target_folder: String,
    state: State<'_, AppState>,
) -> Result<Vec<NoteMoveResult>, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_root = PathBuf::from(&folder);
    let _mutation_guard = state.note_mutation_lock.lock().await;
    let move_results = build_note_move_results(&ids, &target_folder)?;

    if move_results.is_empty() {
        return Ok(Vec::new());
    }

    for result in &move_results {
        let source_path = abs_path_from_id(&folder_root, &result.from)?;
        if !source_path.exists() {
            return Err("Note not found".to_string());
        }

        if result.from == result.to {
            continue;
        }

        let dest_path = abs_path_from_id(&folder_root, &result.to)?;
        if dest_path.exists() {
            return Err("A note with that name already exists in the target folder".to_string());
        }
    }

    for result in &move_results {
        if result.from == result.to {
            continue;
        }

        let source_path = abs_path_from_id(&folder_root, &result.from)?;
        let dest_path = abs_path_from_id(&folder_root, &result.to)?;
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| e.to_string())?;
        }

        move_note_file_without_clobber(&source_path, &dest_path)
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    "A note with that name already exists in the target folder".to_string()
                } else {
                    e.to_string()
                }
            })?;
    }

    {
        let mut settings = state.settings.write().expect("settings write lock");
        let mut settings_changed = false;
        if let Some(ref mut pinned_note_ids) = settings.pinned_note_ids {
            settings_changed =
                apply_note_move_results_to_pinned_ids(pinned_note_ids, &move_results);
        }
        if settings_changed {
            let _ = save_settings(&folder, &settings);
        }
    }

    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        apply_note_move_results_to_cache(&mut cache, &move_results);
    }

    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.rebuild_index(&folder_root);
        }
    }

    Ok(move_results)
}

#[tauri::command]
async fn move_folder(
    path: String,
    target_parent: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    validate_folder_path(&path)?;
    if !target_parent.is_empty() {
        validate_folder_path(&target_parent)?;
    }

    let folder_root = PathBuf::from(&folder);
    let source = folder_root.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));

    if !source.is_dir() {
        return Err("Source is not a directory".to_string());
    }

    // Get folder name
    let name = source
        .file_name()
        .ok_or("Cannot determine folder name")?
        .to_string_lossy()
        .to_string();

    let dest = if target_parent.is_empty() {
        folder_root.join(&name)
    } else {
        folder_root
            .join(target_parent.replace('/', std::path::MAIN_SEPARATOR_STR))
            .join(&name)
    };

    // Prevent moving into itself
    if dest.starts_with(&source) {
        return Err("Cannot move a folder into itself".to_string());
    }

    if dest.exists() {
        return Err("A folder with that name already exists in the target".to_string());
    }

    // Ensure target parent exists
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Compute old and new path prefixes for updating IDs
    let old_prefix = format!("{}/", path);
    let new_path = if target_parent.is_empty() {
        name.clone()
    } else {
        format!("{}/{}", target_parent, name)
    };
    let new_prefix = format!("{}/", new_path);

    tokio::fs::rename(&source, &dest)
        .await
        .map_err(|e| e.to_string())?;

    // Update pinned note IDs
    {
        let mut settings = state.settings.write().expect("settings write lock");
        if let Some(ref mut pinned) = settings.pinned_note_ids {
            rewrite_note_id_prefixes(pinned, &path, &new_path);
        }
        if let Some(ref mut recent_note_ids) = settings.recent_note_ids {
            rewrite_note_id_prefixes(recent_note_ids, &path, &new_path);
        }
        if let Some(ref mut folder_icons) = settings.folder_icons {
            rewrite_folder_icon_paths(folder_icons, &path, &new_path);
        }
        if let Some(ref mut folder_note_sort_modes) = settings.folder_note_sort_modes {
            rewrite_folder_note_sort_mode_paths(folder_note_sort_modes, &path, &new_path);
        }
        if let Some(ref mut collapsed_folders) = settings.collapsed_folders {
            rewrite_collapsed_folder_paths(collapsed_folders, &path, &new_path);
        }
        let _ = save_settings(&folder, &settings);
    }

    // Update cache
    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        let updates: Vec<(String, String)> = cache
            .keys()
            .filter(|id| id.starts_with(&old_prefix))
            .map(|id| {
                let new_id = format!("{}{}", new_prefix, &id[old_prefix.len()..]);
                (id.clone(), new_id)
            })
            .collect();
        for (old_id, new_id) in updates {
            if let Some(mut meta) = cache.remove(&old_id) {
                meta.id = new_id.clone();
                cache.insert(new_id, meta);
            }
        }
    }

    // Rebuild search index
    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.rebuild_index(&folder_root);
        }
    }

    Ok(())
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Settings {
    state.settings.read().expect("settings read lock").clone()
}

#[tauri::command]
fn get_appearance_settings(state: State<AppState>) -> AppearanceSettings {
    state
        .app_config
        .read()
        .expect("app_config read lock")
        .appearance
        .clone()
}

#[tauri::command]
fn get_ai_working_directory(state: State<AppState>) -> Option<String> {
    state
        .app_config
        .read()
        .expect("app_config read lock")
        .ai_working_directory
        .clone()
}

#[tauri::command]
fn set_ai_working_directory(
    path: Option<String>,
    app: AppHandle,
    state: State<AppState>,
) -> Result<Option<String>, String> {
    if let Some(ref p) = path {
        let trimmed = p.trim();
        if !trimmed.is_empty() && !PathBuf::from(trimmed).is_dir() {
            return Err(format!("'{}' is not a valid directory", trimmed));
        }
    }

    let updated_config = {
        let mut app_config = state.app_config.write().expect("app_config write lock");
        app_config.ai_working_directory = path;
        app_config.clone()
    };

    save_app_config(&app, &updated_config).map_err(|e| e.to_string())?;
    Ok(updated_config.ai_working_directory)
}

#[tauri::command]
fn update_appearance_settings(
    new_settings: AppearanceSettings,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let updated_config = {
        let mut app_config = state.app_config.write().expect("app_config write lock");
        app_config.appearance = new_settings;
        app_config.clone()
    };

    save_app_config(&app, &updated_config).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn patch_settings(
    patch: SettingsPatch,
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    let should_resync_task_quick_add_shortcut = {
        let settings = state.settings.read().expect("settings read lock");
        patch.tasks_enabled.is_some()
            || patch.task_quick_add_shortcut.is_some()
            || resolve_task_quick_add_shortcut_accelerator(&settings)
                != resolve_task_quick_add_shortcut_accelerator(&{
                    let mut next_settings = settings.clone();
                    apply_settings_patch(&mut next_settings, patch.clone());
                    next_settings
                })
    };

    let next_settings = {
        let mut settings = state.settings.write().expect("settings write lock");
        apply_settings_patch(&mut settings, patch);
        settings.clone()
    };

    save_settings(&folder, &next_settings).map_err(|e| e.to_string())?;

    if should_resync_task_quick_add_shortcut {
        if let Err(error) = sync_task_quick_add_shortcut(&app, &state) {
            eprintln!("Failed to sync task quick add shortcut: {error}");
            let _ = app.emit_to("main", TASK_QUICK_ADD_SHORTCUT_ERROR_EVENT, error);
        }
    }

    Ok(())
}

#[tauri::command]
fn update_git_enabled(
    enabled: Option<bool>,
    expected_folder: String,
    state: State<AppState>,
) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        let folder = app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?;

        if folder != expected_folder {
            return Err("Notes folder changed".to_string());
        }

        folder
    };

    {
        let mut settings = state.settings.write().expect("settings write lock");
        settings.git_enabled = enabled;
    }

    let settings = state.settings.read().expect("settings read lock");
    save_settings(&folder, &settings).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    fs::write(&path, contents)
        .await
        .map_err(|_| "Failed to write file".to_string())
}

#[tauri::command]
fn preview_note_name(template: String) -> Result<String, String> {
    let expanded = expand_note_name_template(&template);
    let sanitized = sanitize_filename(&expanded);

    // Show first note name (with counter as 1 if present)
    let preview = if template.contains("{counter}") {
        sanitized.replace("{counter}", "1")
    } else {
        sanitized
    };

    Ok(preview)
}

// Preview mode: file content returned by read_file_direct / save_file_direct
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub title: String,
    pub modified: i64,
}

/// Validate a file path for preview mode direct file operations.
/// Ensures the path is a markdown file and resolves symlinks.
fn validate_preview_path(path: &str) -> Result<PathBuf, String> {
    let file_path = PathBuf::from(path);

    // Must have a markdown extension
    match file_path.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") => {}
        _ => return Err("Only .md and .markdown files are allowed".to_string()),
    }

    // Resolve symlinks to get the real path
    let canonical = file_path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve file path: {}", e))?;

    // Re-check the extension on the resolved path. Without this, a symlink
    // named "note.md" pointing to "/etc/passwd" would pass the check above
    // and allow reading an arbitrary file after canonicalization.
    match canonical.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") => {}
        _ => return Err("Only .md and .markdown files are allowed".to_string()),
    }

    Ok(canonical)
}

#[tauri::command]
async fn read_file_direct(path: String) -> Result<FileContent, String> {
    let canonical = validate_preview_path(&path)?;

    if !canonical.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    let content = fs::read_to_string(&canonical).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::InvalidData {
            "File is not valid UTF-8. Sly only supports UTF-8 encoded files.".to_string()
        } else {
            "Failed to read file".to_string()
        }
    })?;
    let metadata = fs::metadata(&canonical)
        .await
        .map_err(|_| "Failed to read metadata".to_string())?;

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let title = extract_title(&content);

    Ok(FileContent {
        path,
        content,
        title,
        modified,
    })
}

#[tauri::command]
async fn save_file_direct(path: String, content: String) -> Result<FileContent, String> {
    // For save, the file must already exist (we validate extension + path security)
    let canonical = validate_preview_path(&path)?;

    if !canonical.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    fs::write(&canonical, &content)
        .await
        .map_err(|_| "Failed to write file".to_string())?;

    let metadata = fs::metadata(&canonical)
        .await
        .map_err(|_| "Failed to read metadata".to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let title = extract_title(&content);

    Ok(FileContent {
        path,
        content,
        title,
        modified,
    })
}

#[tauri::command]
async fn import_file_to_folder(
    app: AppHandle,
    path: String,
    state: State<'_, AppState>,
) -> Result<NoteMetadata, String> {
    let source = validate_preview_path(&path)?;
    if !source.is_file() {
        return Err(format!("Not a file: {}", path));
    }

    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_path = PathBuf::from(&folder);

    // Read the source file content
    let content = fs::read_to_string(&source)
        .await
        .map_err(|_| "Failed to read source file".to_string())?;

    // Derive the note ID from the title (H1 heading), falling back to filename
    let extracted_title = extract_title(&content);
    let base_name = if extracted_title.trim().is_empty() {
        source
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string()
    } else {
        extracted_title.trim().to_string()
    };
    let base_id = sanitize_filename(&base_name);

    // Atomically create the file and write content via the handle
    let mut final_id = base_id.clone();
    let mut counter = 1;
    loop {
        let candidate = abs_path_from_id(&folder_path, &final_id)?;
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
            .await
        {
            Ok(mut file) => {
                if file.write_all(content.as_bytes()).await.is_err() {
                    // Clean up the empty file on write failure
                    let _ = fs::remove_file(&candidate).await;
                    return Err("Failed to write file".to_string());
                }
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                final_id = format!("{}-{}", base_id, counter);
                counter += 1;
            }
            Err(_) => return Err("Failed to create file".to_string()),
        }
    }

    let modified = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Update search index
    {
        let index = state.search_index.lock().expect("search index mutex");
        if let Some(ref search_index) = *index {
            let _ = search_index.index_note(&final_id, &extracted_title, &content, modified);
        }
    }

    let preview = generate_preview(&content);

    let metadata = NoteMetadata {
        id: final_id,
        title: extracted_title,
        preview,
        modified,
        created: modified,
    };

    // Update notes cache so fallback search sees the imported note immediately
    {
        let mut cache = state.notes_cache.write().expect("cache write lock");
        cache.insert(metadata.id.clone(), metadata.clone());
    }

    // Tell the main window to select the imported note and focus it
    let _ = app.emit_to("main", "select-note", &metadata.id);
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.set_focus();
    }

    Ok(metadata)
}

#[tauri::command]
async fn search_notes(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let trimmed_query = query.trim().to_string();
    if trimmed_query.is_empty() {
        return Ok(vec![]);
    }

    // Check if search index is available and use it (scoped to drop lock before await)
    let indexed_result = {
        let index = state.search_index.lock().expect("search index mutex");
        (*index).as_ref().map(|search_index| {
            search_index
                .search(&trimmed_query, 20)
                .map_err(|e| e.to_string())
        })
    };

    match indexed_result {
        Some(Ok(results)) if !results.is_empty() => Ok(results),
        Some(Ok(_)) => {
            // Tantivy can miss partial/fuzzy matches; fall back to substring search.
            fallback_search(&trimmed_query, &state).await
        }
        Some(Err(e)) => {
            eprintln!(
                "Tantivy search error, falling back to substring search: {}",
                e
            );
            fallback_search(&trimmed_query, &state).await
        }
        None => {
            // Fallback to simple search if index not available
            fallback_search(&trimmed_query, &state).await
        }
    }
}

// Fallback search when Tantivy index isn't available - searches title and full content
async fn fallback_search(
    query: &str,
    state: &State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config.notes_folder.clone()
    };

    let folder = match folder {
        Some(f) => f,
        None => return Ok(vec![]),
    };

    // Collect cache data upfront to avoid holding lock during async operations
    let cache_data: Vec<(String, String, String, i64)> = {
        let cache = state.notes_cache.read().expect("cache read lock");
        cache
            .values()
            .map(|note| {
                (
                    note.id.clone(),
                    note.title.clone(),
                    note.preview.clone(),
                    note.modified,
                )
            })
            .collect()
    };

    let folder_path = PathBuf::from(&folder);
    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchResult> = Vec::new();

    for (id, title, preview, modified) in cache_data {
        // Read file content asynchronously and search in it
        let file_path = match abs_path_from_id(&folder_path, &id) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let content = match tokio::fs::read_to_string(&file_path).await {
            Ok(content) => content,
            Err(_) => continue,
        };

        let score = score_fallback_search_match(&title, &content, &query_lower);

        if score > 0.0 {
            results.push(SearchResult {
                id,
                title,
                preview,
                modified,
                score,
            });
        }
    }

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(20);

    Ok(results)
}

fn score_fallback_search_match(title: &str, content: &str, query_lower: &str) -> f32 {
    let title_lower = title.to_lowercase();
    let content_lower = content.to_lowercase();

    let mut score = 0.0f32;
    if title_lower.contains(query_lower) {
        score += 50.0;
    }
    if content_lower.contains(query_lower) {
        if score == 0.0 {
            score += 10.0;
        } else {
            score += 5.0;
        }
    }

    score
}

// File watcher event payload
#[derive(Clone, Serialize)]
struct FileChangeEvent {
    kind: String,
    path: String,
    changed_ids: Vec<String>,
    folder_structure_changed: bool,
}

fn setup_file_watcher(
    app: AppHandle,
    notes_folder: &str,
    debounce_map: Arc<Mutex<HashMap<PathBuf, Instant>>>,
) -> Result<FileWatcherState, String> {
    let folder_path = PathBuf::from(notes_folder);
    let notes_root = folder_path.clone();
    let app_handle = app.clone();

    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let kind = match event.kind {
                    EventKind::Create(_) => "created",
                    EventKind::Modify(_) => "modified",
                    EventKind::Remove(_) => "deleted",
                    // Some backends emit Any for renames or unclassified changes.
                    EventKind::Any => "modified",
                    _ => return,
                };

                let mut changed_ids = Vec::new();
                let mut seen_ids = HashSet::new();
                let mut folder_structure_changed = false;
                let mut emitted_path: Option<String> = None;

                for path in event.paths.iter() {
                    if !debounce_path(path, &debounce_map) {
                        continue;
                    }

                    // Detect external changes to the tasks database (e.g. from the CLI)
                    // and notify the frontend so it can refresh without a restart.
                    if let Some(filename) = path.file_name() {
                        let name = filename.to_string_lossy();
                        if (name == "tasks.db" || name == "tasks.db-wal")
                            && path
                                .parent()
                                .map(|p| p.file_name().is_some_and(|n| n == ".sly"))
                                .unwrap_or(false)
                        {
                            let _ = app_handle.emit("tasks-changed", ());
                            continue;
                        }
                    }

                    if emitted_path.is_none() {
                        emitted_path = Some(path.to_string_lossy().into_owned());
                    }

                    if is_visible_folder_structure_path(&notes_root, &event.kind, path) {
                        folder_structure_changed = true;
                    }

                    let note_id = match id_from_abs_path(&notes_root, path) {
                        Some(id) => id,
                        None => continue,
                    };

                    if seen_ids.insert(note_id.clone()) {
                        changed_ids.push(note_id.clone());
                    }

                    // Update search index for external file changes
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        let cache_root_matches = state
                            .notes_cache_root
                            .read()
                            .expect("cache root read lock")
                            .as_deref()
                            == Some(notes_root.to_string_lossy().as_ref());
                        let index = state.search_index.lock().expect("search index mutex");
                        if let Some(ref search_index) = *index {
                            match kind {
                                "created" | "modified" => match std::fs::read_to_string(path) {
                                    Ok(content) => {
                                        let title = extract_title(&content);
                                        let modified = std::fs::metadata(path)
                                            .ok()
                                            .and_then(|m| m.modified().ok())
                                            .and_then(|t| {
                                                t.duration_since(std::time::UNIX_EPOCH).ok()
                                            })
                                            .map(|d| d.as_secs() as i64)
                                            .unwrap_or(0);
                                        let _ = search_index
                                            .index_note(&note_id, &title, &content, modified);
                                    }
                                    Err(_) => {
                                        // File gone between event and read — treat as deletion
                                        if !path.exists() {
                                            let _ = search_index.delete_note(&note_id);
                                        }
                                    }
                                },
                                "deleted" => {
                                    let _ = search_index.delete_note(&note_id);
                                }
                                _ => {}
                            }
                        }

                        if cache_root_matches {
                            let preserved_created = {
                                let cache = state.notes_cache.read().expect("cache read lock");
                                cache.get(&note_id).map(|note| note.created)
                            };

                            let updated = refresh_note_metadata_from_path(
                                &notes_root,
                                path,
                                preserved_created,
                            );

                            let mut cache = state.notes_cache.write().expect("cache write lock");
                            match updated {
                                Some(metadata) => {
                                    cache.insert(note_id.clone(), metadata);
                                }
                                None => {
                                    cache.remove(&note_id);
                                }
                            }
                        }
                    }
                }

                if folder_structure_changed || !changed_ids.is_empty() {
                    let effective_kind = if kind == "modified"
                        && !changed_ids.is_empty()
                        && emitted_path
                            .as_ref()
                            .map(|path| !Path::new(path).exists())
                            .unwrap_or(false)
                    {
                        "deleted"
                    } else {
                        kind
                    };

                    let _ = app_handle.emit(
                        "file-change",
                        FileChangeEvent {
                            kind: effective_kind.to_string(),
                            path: emitted_path
                                .unwrap_or_else(|| notes_root.to_string_lossy().into_owned()),
                            changed_ids,
                            folder_structure_changed,
                        },
                    );
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    let mut watcher = watcher;

    // Watch the notes folder recursively for .md files in subfolders
    watcher
        .watch(&folder_path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    Ok(FileWatcherState {
        watcher,
        folder: folder_path.canonicalize().unwrap_or(folder_path),
    })
}

#[tauri::command]
fn start_file_watcher(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    let canonical_folder = PathBuf::from(&folder)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(&folder));

    // Clean up debounce map before starting
    cleanup_debounce_map(&state.debounce_map);

    let mut file_watcher = state.file_watcher.lock().expect("file watcher mutex");
    if file_watcher
        .as_ref()
        .map(|watcher_state| watcher_state.folder == canonical_folder)
        .unwrap_or(false)
    {
        return Ok(());
    }

    let watcher_state = setup_file_watcher(app, &folder, Arc::clone(&state.debounce_map))?;
    *file_watcher = Some(watcher_state);

    Ok(())
}

#[tauri::command]
fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_clipboard_image(
    base64_data: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Guard against empty clipboard payload
    if base64_data.trim().is_empty() {
        return Err("Clipboard data is empty".to_string());
    }

    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    // Decode base64
    let image_data = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|_| "Failed to decode base64 image data".to_string())?;

    // Guard against zero-byte files
    if image_data.is_empty() {
        return Err("Decoded image data is empty".to_string());
    }

    // Create assets folder path
    let assets_dir = PathBuf::from(&folder).join("assets");
    fs::create_dir_all(&assets_dir)
        .await
        .map_err(|e| e.to_string())?;

    // Generate unique filename with timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut target_name = format!("screenshot-{}.png", timestamp);
    let mut counter = 1;
    let mut target_path = assets_dir.join(&target_name);

    while target_path.exists() {
        target_name = format!("screenshot-{}-{}.png", timestamp, counter);
        target_path = assets_dir.join(&target_name);
        counter += 1;
    }

    // Write the file
    fs::write(&target_path, &image_data)
        .await
        .map_err(|_| "Failed to write image".to_string())?;

    // Return relative path
    Ok(format!("assets/{}", target_name))
}

#[tauri::command]
async fn copy_image_to_assets(
    source_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("Source image file does not exist".to_string());
    }

    // Get file extension
    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .ok_or("Invalid file extension")?;

    const ALLOWED_IMAGE_EXTENSIONS: &[&str] = &[
        "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "tif", "ico", "avif",
    ];
    let ext_lower = extension.to_lowercase();
    if !ALLOWED_IMAGE_EXTENSIONS.contains(&ext_lower.as_str()) {
        return Err("Only image files can be copied to assets".to_string());
    }

    // Get original filename (without extension)
    let original_name = source
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("image");

    // Sanitize the filename
    let sanitized_name = sanitize_filename(original_name);

    // Create assets folder path
    let assets_dir = PathBuf::from(&folder).join("assets");
    fs::create_dir_all(&assets_dir)
        .await
        .map_err(|e| e.to_string())?;

    // Generate unique filename
    let mut target_name = format!("{}.{}", sanitized_name, extension);
    let mut counter = 1;
    let mut target_path = assets_dir.join(&target_name);

    while target_path.exists() {
        target_name = format!("{}-{}.{}", sanitized_name, counter, extension);
        target_path = assets_dir.join(&target_name);
        counter += 1;
    }

    // Copy the file
    fs::copy(&source, &target_path)
        .await
        .map_err(|_| "Failed to copy image".to_string())?;

    // Return both relative path and filename for frontend to construct the URL
    Ok(format!("assets/{}", target_name))
}

#[tauri::command]
fn rebuild_search_index(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    let index_path = get_search_index_path(&app).map_err(|e| e.to_string())?;

    // Create new index
    let search_index = SearchIndex::new(&index_path).map_err(|e| e.to_string())?;
    search_index
        .rebuild_index(&PathBuf::from(&folder))
        .map_err(|e| e.to_string())?;

    let mut index = state.search_index.lock().expect("search index mutex");
    *index = Some(search_index);

    Ok(())
}

// UI helper commands - wrap Tauri plugins for consistent invoke-based API

#[tauri::command]
async fn open_folder_dialog(
    app: AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // Run blocking dialog on a separate thread to avoid blocking the async runtime
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app.dialog().file().set_can_create_directories(true);

        if let Some(path) = default_path {
            builder = builder.set_directory(path);
        }

        builder.blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("Dialog task failed: {}", e))?;

    Ok(result.map(|p| p.to_string()))
}

#[tauri::command]
async fn open_in_file_manager(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() || !path_buf.is_dir() {
        return Err("Path does not exist or is not a directory".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        let windows_path = path.replace("/", "\\");
        std::process::Command::new("explorer")
            .arg(&windows_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        return Err("Unsupported platform".to_string());
    }

    Ok(())
}

#[tauri::command]
async fn open_url_safe(url: String) -> Result<(), String> {
    // Validate URL scheme - only allow http, https, mailto
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    match parsed.scheme() {
        "http" | "https" | "mailto" => {}
        scheme => {
            return Err(format!(
                "URL scheme '{}' is not allowed. Only http, https, and mailto are permitted.",
                scheme
            ))
        }
    }

    // Use system opener
    open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))
}

// Git commands - run blocking git operations off the main thread

#[tauri::command]
async fn git_is_available() -> bool {
    tauri::async_runtime::spawn_blocking(git::is_available)
        .await
        .unwrap_or(false)
}

#[tauri::command]
async fn git_get_status(state: State<'_, AppState>) -> Result<git::GitStatus, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config.notes_folder.clone()
    };

    match folder {
        Some(path) => {
            tauri::async_runtime::spawn_blocking(move || git::get_status(&PathBuf::from(path)))
                .await
                .map_err(|e| e.to_string())
        }
        None => Ok(git::GitStatus::default()),
    }
}

#[tauri::command]
async fn git_init_repo(state: State<'_, AppState>) -> Result<(), String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };

    tauri::async_runtime::spawn_blocking(move || git::git_init(&PathBuf::from(folder)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_commit(message: String, state: State<'_, AppState>) -> Result<git::GitResult, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config.notes_folder.clone()
    };

    match folder {
        Some(path) => tauri::async_runtime::spawn_blocking(move || {
            git::commit_all(&PathBuf::from(path), &message)
        })
        .await
        .map_err(|e| e.to_string()),
        None => Ok(git::GitResult {
            success: false,
            message: None,
            error: Some("Notes folder not set".to_string()),
        }),
    }
}

#[tauri::command]
async fn git_push(state: State<'_, AppState>) -> Result<git::GitResult, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config.notes_folder.clone()
    };

    match folder {
        Some(path) => tauri::async_runtime::spawn_blocking(move || git::push(&PathBuf::from(path)))
            .await
            .map_err(|e| e.to_string()),
        None => Ok(git::GitResult {
            success: false,
            message: None,
            error: Some("Notes folder not set".to_string()),
        }),
    }
}

#[tauri::command]
async fn git_fetch(state: State<'_, AppState>) -> Result<git::GitResult, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config.notes_folder.clone()
    };

    match folder {
        Some(path) => {
            tauri::async_runtime::spawn_blocking(move || git::fetch(&PathBuf::from(path)))
                .await
                .map_err(|e| e.to_string())
        }
        None => Ok(git::GitResult {
            success: false,
            message: None,
            error: Some("Notes folder not set".to_string()),
        }),
    }
}

#[tauri::command]
async fn git_pull(state: State<'_, AppState>) -> Result<git::GitResult, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config.notes_folder.clone()
    };

    match folder {
        Some(path) => tauri::async_runtime::spawn_blocking(move || git::pull(&PathBuf::from(path)))
            .await
            .map_err(|e| e.to_string()),
        None => Ok(git::GitResult {
            success: false,
            message: None,
            error: Some("Notes folder not set".to_string()),
        }),
    }
}

#[tauri::command]
async fn git_add_remote(url: String, state: State<'_, AppState>) -> Result<git::GitResult, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config.notes_folder.clone()
    };

    match folder {
        Some(path) => tauri::async_runtime::spawn_blocking(move || {
            git::add_remote(&PathBuf::from(path), &url)
        })
        .await
        .map_err(|e| e.to_string()),
        None => Ok(git::GitResult {
            success: false,
            message: None,
            error: Some("Notes folder not set".to_string()),
        }),
    }
}

#[tauri::command]
async fn git_push_with_upstream(state: State<'_, AppState>) -> Result<git::GitResult, String> {
    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config.notes_folder.clone()
    };

    match folder {
        Some(path) => {
            tauri::async_runtime::spawn_blocking(move || {
                // Get current branch first
                let status = git::get_status(&PathBuf::from(&path));
                match status.current_branch {
                    Some(branch) => {
                        if !branch.chars().all(|c| {
                            c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_' | '.')
                        }) {
                            return git::GitResult {
                                success: false,
                                message: None,
                                error: Some("Invalid branch name".to_string()),
                            };
                        }
                        git::push_with_upstream(&PathBuf::from(&path), &branch)
                    }
                    None => git::GitResult {
                        success: false,
                        message: None,
                        error: Some("No current branch found".to_string()),
                    },
                }
            })
            .await
            .map_err(|e| e.to_string())
        }
        None => Ok(git::GitResult {
            success: false,
            message: None,
            error: Some("Notes folder not set".to_string()),
        }),
    }
}

// Check if Claude CLI is installed
fn get_expanded_path() -> String {
    let system_path = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_else(|_| String::new());

    if home.is_empty() {
        return system_path;
    }

    // Common locations for node-installed CLIs (nvm, volta, fnm, mise, homebrew, global npm)
    let candidate_dirs = vec![
        format!("{home}/.nvm/versions/node"),
        format!("{home}/.fnm/node-versions"),
        format!("{home}/.local/share/mise/installs/node"),
    ];
    let static_dirs = vec![
        format!("{home}/.bun/bin"),
        format!("{home}/.volta/bin"),
        format!("{home}/.local/bin"),
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
    ];

    let mut expanded = Vec::new();

    // Prefer well-known static locations (e.g. ~/.local/bin for native CLI installs)
    for dir in static_dirs {
        expanded.push(dir);
    }

    // Then scan nvm/fnm node version dirs containing a bin/ folder
    for base in &candidate_dirs {
        if let Ok(entries) = std::fs::read_dir(base) {
            for entry in entries.flatten() {
                let bin_path = entry.path().join("bin");
                if bin_path.exists() {
                    expanded.push(bin_path.to_string_lossy().to_string());
                }
            }
        }
    }

    expanded.push(system_path);
    expanded.join(":")
}

/// Create a `Command` that hides the console window on Windows.
fn no_window_cmd(program: &str) -> std::process::Command {
    let cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd
    }
}

fn check_cli_exists(command_name: &str, path: &str) -> Result<bool, String> {
    let which_cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };

    let check_output = no_window_cmd(which_cmd)
        .arg(command_name)
        .env("PATH", path)
        .output()
        .map_err(|e| format!("Failed to check for {} CLI: {}", command_name, e))?;

    Ok(check_output.status.success())
}

/// Marker comment embedded in CLI wrapper scripts installed by Sly.
/// Used to identify and validate our own wrapper before modifying or removing it.
#[cfg(target_os = "macos")]
const SLY_CLI_MARKER: &str = "# SLY_CLI_WRAPPER";

/// Returns the path where the CLI script should be installed (macOS only).
/// Checks PATH for Homebrew bin first, then falls back to architecture detection.
/// Apple Silicon: /opt/homebrew/bin/sly
/// Intel: /usr/local/bin/sly
#[cfg(target_os = "macos")]
fn cli_target_path() -> PathBuf {
    // Check if the user's PATH contains /opt/homebrew/bin (Homebrew on Apple Silicon)
    if let Ok(path_var) = std::env::var("PATH") {
        if path_var.split(':').any(|p| p == "/opt/homebrew/bin") {
            return PathBuf::from("/opt/homebrew/bin/sly");
        }
    }
    // Fall back to architecture detection
    if std::env::consts::ARCH == "aarch64" {
        return PathBuf::from("/opt/homebrew/bin/sly");
    }
    PathBuf::from("/usr/local/bin/sly")
}

#[tauri::command]
fn get_cli_status() -> Result<CliStatus, String> {
    #[cfg(not(target_os = "macos"))]
    return Ok(CliStatus {
        supported: false,
        installed: false,
        path: None,
    });

    #[cfg(target_os = "macos")]
    {
        let target = cli_target_path();
        if !target.exists() && target.symlink_metadata().is_err() {
            return Ok(CliStatus {
                supported: true,
                installed: false,
                path: None,
            });
        }
        // Verify this is our wrapper (has marker) and points to the current binary
        let content = std::fs::read_to_string(&target).unwrap_or_default();
        if !content.contains(SLY_CLI_MARKER) {
            // Foreign binary at this path — don't claim it as ours
            return Ok(CliStatus {
                supported: true,
                installed: false,
                path: None,
            });
        }
        let current_exe = std::env::current_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        if !current_exe.is_empty() && !content.contains(&current_exe) {
            // Our wrapper but points to a moved/deleted binary — needs reinstall
            return Ok(CliStatus {
                supported: true,
                installed: false,
                path: None,
            });
        }
        Ok(CliStatus {
            supported: true,
            installed: true,
            path: Some(target.to_string_lossy().into_owned()),
        })
    }
}

#[tauri::command]
fn install_cli() -> Result<String, String> {
    #[cfg(not(target_os = "macos"))]
    return Err("CLI install is only supported on macOS".to_string());

    #[cfg(target_os = "macos")]
    {
        use std::os::unix::fs::PermissionsExt;

        let target = cli_target_path();

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
        }

        if target.exists() || target.symlink_metadata().is_ok() {
            // Only remove if it's our wrapper (contains marker)
            let content = std::fs::read_to_string(&target).unwrap_or_default();
            if !content.contains(SLY_CLI_MARKER) {
                return Err(format!(
                    "A different 'sly' command already exists at {}. Remove it manually to install the Sly CLI.",
                    target.display()
                ));
            }
            std::fs::remove_file(&target)
                .map_err(|e| format!("Failed to remove existing file: {}", e))?;
        }

        let exe_path =
            std::env::current_exe().map_err(|e| format!("Cannot find exe path: {}", e))?;

        // Shell-escape the exe path using single quotes to prevent
        // interpretation of $, `, ", and other metacharacters.
        let exe_str = exe_path.to_string_lossy();
        let escaped_exe = format!("'{}'", exe_str.replace('\'', "'\\''"));

        // Run task/doctor/help/version CLI invocations in the foreground so
        // stdout, stderr, and exit codes are preserved. GUI launch/open-folder
        // flows stay backgrounded to preserve the current terminal UX.
        let script = format!(
            "#!/bin/sh\n{}\nforeground=0\nskip_next=0\nfor arg in \"$@\"; do\n  if [ \"$skip_next\" -eq 1 ]; then\n    skip_next=0\n    continue\n  fi\n  case \"$arg\" in\n    --notes-folder)\n      skip_next=1\n      ;;\n    --notes-folder=*)\n      ;;\n    task|doctor|-h|--help|-V|--version)\n      foreground=1\n      break\n      ;;\n  esac\ndone\nif [ \"$foreground\" -eq 1 ]; then\n  exec {} \"$@\"\nfi\nnohup {} \"$@\" >/dev/null 2>&1 &\n",
            SLY_CLI_MARKER, escaped_exe, escaped_exe
        );
        std::fs::write(&target, script.as_bytes())
            .map_err(|e| format!("Failed to write CLI script: {}", e))?;

        let mut perms = std::fs::metadata(&target)
            .map_err(|e| format!("Failed to read permissions: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&target, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;

        Ok(target.to_string_lossy().into_owned())
    }
}

#[tauri::command]
fn uninstall_cli() -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    return Ok(());

    #[cfg(target_os = "macos")]
    {
        let target = cli_target_path();
        if target.exists() || target.symlink_metadata().is_ok() {
            let content = std::fs::read_to_string(&target).unwrap_or_default();
            if !content.contains(SLY_CLI_MARKER) {
                return Err(format!(
                    "File at {} was not installed by Sly. Refusing to remove.",
                    target.display()
                ));
            }
            std::fs::remove_file(&target)
                .map_err(|e| format!("Failed to remove CLI script: {}", e))?;
        }
        Ok(())
    }
}

#[tauri::command]
async fn ai_check_claude_cli() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = get_expanded_path();
        check_cli_exists("claude", &path)
    })
    .await
    .map_err(|e| format!("Failed to check Claude CLI: {}", e))?
}

#[tauri::command]
async fn ai_check_codex_cli() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = get_expanded_path();
        check_cli_exists("codex", &path)
    })
    .await
    .map_err(|e| format!("Failed to check Codex CLI: {}", e))?
}

#[tauri::command]
async fn ai_check_opencode_cli() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = get_expanded_path();
        check_cli_exists("opencode", &path)
    })
    .await
    .map_err(|e| format!("Failed to check OpenCode CLI: {}", e))?
}

/// Shared AI CLI execution: spawns `command` with `args`, writes `stdin_input` to stdin,
/// and returns the result with a 5-minute timeout.
async fn execute_ai_cli(
    cli_name: &str,
    command: String,
    args: Vec<String>,
    stdin_input: String,
    not_found_msg: String,
    current_dir: Option<PathBuf>,
    extra_env: Option<Vec<(String, String)>>,
) -> Result<AiExecutionResult, String> {
    use std::io::Write;
    use std::process::{Child, Stdio};

    let cli_name = cli_name.to_string();
    let timeout_duration = std::time::Duration::from_secs(300);
    let shared_child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_task = Arc::clone(&shared_child);
    let cli_name_task = cli_name.clone();

    let mut task = tauri::async_runtime::spawn_blocking(move || {
        // Blocking I/O: expand PATH and check CLI exists
        let path = get_expanded_path();
        match check_cli_exists(&command, &path) {
            Ok(false) => {
                return AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(not_found_msg),
                };
            }
            Err(e) => {
                return AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(e),
                };
            }
            Ok(true) => {}
        }

        let mut cmd = no_window_cmd(&command);
        cmd.env("PATH", &path);
        if let Some(dir) = &current_dir {
            cmd.current_dir(dir);
        }
        if let Some(env_pairs) = &extra_env {
            for (key, value) in env_pairs {
                cmd.env(key, value);
            }
        }
        for arg in &args {
            cmd.arg(arg);
        }
        let process = match cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(p) => p,
            Err(e) => {
                return AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to execute {}: {}", cli_name_task, e)),
                };
            }
        };

        // Store process in shared state so the timeout handler can kill it.
        // We only take individual I/O handles below — the Child stays in the
        // mutex so it remains reachable for kill().
        if let Ok(mut guard) = child_for_task.lock() {
            *guard = Some(process);
        } else {
            return AiExecutionResult {
                success: false,
                output: String::new(),
                error: Some(format!("Failed to lock {} process handle", cli_name_task)),
            };
        }

        // Take stdin handle (briefly locks then releases)
        let stdin_handle = child_for_task
            .lock()
            .ok()
            .and_then(|mut g| g.as_mut().and_then(|p| p.stdin.take()));

        if let Some(mut stdin) = stdin_handle {
            if let Err(e) = stdin.write_all(stdin_input.as_bytes()) {
                if let Ok(mut g) = child_for_task.lock() {
                    if let Some(ref mut p) = *g {
                        let _ = p.kill();
                        let _ = p.wait();
                    }
                }
                return AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to write to {} stdin: {}", cli_name_task, e)),
                };
            }
            // stdin dropped here — closes the pipe
        } else {
            if let Ok(mut g) = child_for_task.lock() {
                if let Some(ref mut p) = *g {
                    let _ = p.kill();
                    let _ = p.wait();
                }
            }
            return AiExecutionResult {
                success: false,
                output: String::new(),
                error: Some(format!("Failed to open stdin for {}", cli_name_task)),
            };
        }

        // Take stdout/stderr handles so we can read without holding the lock.
        // This allows the timeout handler to lock the mutex and kill the process.
        let stdout_handle = child_for_task
            .lock()
            .ok()
            .and_then(|mut g| g.as_mut().and_then(|p| p.stdout.take()));
        let stderr_handle = child_for_task
            .lock()
            .ok()
            .and_then(|mut g| g.as_mut().and_then(|p| p.stderr.take()));

        use std::io::Read;

        let mut stdout_str = String::new();
        if let Some(mut out) = stdout_handle {
            let _ = out.read_to_string(&mut stdout_str);
        }

        let mut stderr_str = String::new();
        if let Some(mut err) = stderr_handle {
            let _ = err.read_to_string(&mut stderr_str);
        }

        // Collect exit status — process has exited after stdout/stderr close
        let success = child_for_task
            .lock()
            .ok()
            .and_then(|mut g| g.as_mut().and_then(|p| p.wait().ok()))
            .map(|s| s.success())
            .unwrap_or(false);

        // Strip ANSI escape sequences from output (e.g. Ollama progress spinners)
        let ansi_re = ANSI_RE
            .get_or_init(|| regex::Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\].*?\x07").unwrap());
        let stdout_clean = ansi_re.replace_all(&stdout_str, "").to_string();
        let stderr_clean = ansi_re.replace_all(&stderr_str, "").trim().to_string();

        if success {
            AiExecutionResult {
                success: true,
                output: stdout_clean,
                error: None,
            }
        } else {
            AiExecutionResult {
                success: false,
                output: stdout_clean,
                error: Some(stderr_clean),
            }
        }
    });

    let result = match tokio::time::timeout(timeout_duration, &mut task).await {
        Ok(join_result) => {
            join_result.map_err(|e| format!("Failed to join {} blocking task: {}", cli_name, e))?
        }
        Err(_) => {
            // Kill through the shared handle — the Child is still in the mutex
            // because the blocking task only takes I/O handles, not the Child.
            // This sends SIGKILL, which closes the pipes and unblocks the reads.
            if let Ok(mut guard) = shared_child.lock() {
                if let Some(ref mut process) = *guard {
                    let _ = process.kill();
                }
            }

            match tokio::time::timeout(std::time::Duration::from_secs(5), task).await {
                Ok(join_result) => {
                    if let Err(e) = join_result {
                        return Err(format!(
                            "Failed to join {} blocking task after timeout: {}",
                            cli_name, e
                        ));
                    }
                }
                Err(_) => {
                    return Err(format!(
                        "{} CLI timed out and failed to exit after kill signal",
                        cli_name
                    ));
                }
            }

            AiExecutionResult {
                success: false,
                output: String::new(),
                error: Some(format!("{} CLI timed out after 5 minutes", cli_name)),
            }
        }
    };

    Ok(result)
}

fn validate_markdown_note_path(file_path: &str, notes_root: &Path) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if !ext.eq_ignore_ascii_case("md") && !ext.eq_ignore_ascii_case("markdown") {
        return Err("AI features are only supported for markdown files".to_string());
    }

    let canonical = path
        .canonicalize()
        .map_err(|_| "Invalid file path".to_string())?;
    if !canonical.starts_with(notes_root) {
        return Err("File must be within notes folder".to_string());
    }

    Ok(canonical)
}

fn resolve_ai_working_directory(
    app_config: &AppConfig,
    notes_root: &Path,
) -> Result<PathBuf, String> {
    let Some(path) = app_config.ai_working_directory.as_ref() else {
        return Ok(notes_root.to_path_buf());
    };

    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(notes_root.to_path_buf());
    }

    PathBuf::from(trimmed).canonicalize().map_err(|e| {
        format!(
            "AI reference folder '{}' is not accessible: {}. Clear or reselect it in Settings > Extensions.",
            trimmed, e
        )
    })
}

fn resolve_assistant_workspace(
    note_path: &str,
    app_config: &AppConfig,
) -> Result<(PathBuf, PathBuf), String> {
    let notes_folder = app_config
        .notes_folder
        .clone()
        .ok_or("Notes folder not set")?;
    let notes_root = PathBuf::from(&notes_folder)
        .canonicalize()
        .map_err(|_| "Invalid notes folder".to_string())?;
    let _canonical_note = validate_markdown_note_path(note_path, &notes_root)?;
    let execution_dir = resolve_ai_working_directory(app_config, &notes_root)?;

    Ok((notes_root, execution_dir))
}

fn strip_json_code_fences(raw: &str) -> String {
    let trimmed = raw.trim();
    if !trimmed.starts_with("```") {
        return trimmed.to_string();
    }

    let mut lines = trimmed.lines();
    let _ = lines.next();
    let mut collected = lines.collect::<Vec<_>>();
    if matches!(collected.last(), Some(line) if line.trim_start().starts_with("```")) {
        let _ = collected.pop();
    }
    collected.join("\n").trim().to_string()
}

fn sanitize_assistant_result(mut result: AssistantTurnResult) -> AssistantTurnResult {
    if result.reply_text.trim().is_empty() {
        result.reply_text = "Assistant returned no plain-text reply.".to_string();
    }

    result.proposals = result
        .proposals
        .into_iter()
        .enumerate()
        .filter_map(|(index, mut proposal)| {
            if proposal.start_line == 0 || proposal.end_line < proposal.start_line {
                return None;
            }

            if proposal.id.trim().is_empty() {
                proposal.id = format!("proposal-{}", index + 1);
            }
            if proposal.title.trim().is_empty() {
                proposal.title = format!("Proposed edit {}", index + 1);
            }
            if proposal.summary.trim().is_empty() {
                proposal.summary = "Replace the selected lines.".to_string();
            }

            Some(proposal)
        })
        .collect();

    result
}

fn parse_assistant_result(raw_output: &str) -> AssistantTurnResult {
    let trimmed = raw_output.trim();
    let parsed = serde_json::from_str::<AssistantTurnResult>(trimmed).or_else(|_| {
        let stripped = strip_json_code_fences(trimmed);
        serde_json::from_str::<AssistantTurnResult>(&stripped)
    });

    match parsed {
        Ok(result) => sanitize_assistant_result(result),
        Err(_) => AssistantTurnResult {
            reply_text: if trimmed.is_empty() {
                "Assistant returned no output.".to_string()
            } else {
                trimmed.to_string()
            },
            proposals: Vec::new(),
            warning: Some(
                "Assistant returned non-JSON output, so Sly kept the reply as plain text."
                    .to_string(),
            ),
            execution_dir: None,
        },
    }
}

fn build_assistant_prompt(request: &AssistantTurnRequest) -> String {
    let history = if request.history.is_empty() {
        "None.".to_string()
    } else {
        request
            .history
            .iter()
            .map(|entry| format!("- {}: {}", entry.role, entry.text))
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        "You are Sly's note assistant. You are helping with one markdown note.\n\
         Reply with strict JSON only. Do not include markdown code fences.\n\
         The JSON must match this exact shape:\n\
         {{\"replyText\":\"string\",\"proposals\":[{{\"id\":\"string\",\"title\":\"string\",\"summary\":\"string\",\"startLine\":1,\"endLine\":1,\"replacement\":\"string\"}}],\"warning\":null}}\n\
         Rules:\n\
         - replyText must be a concise plain-text answer for the user.\n\
         - proposals may be empty if discussion is enough.\n\
         - If you propose edits, use the exact line numbers shown in the numbered content.\n\
         - replacement must contain the complete replacement text for the inclusive line range.\n\
         - Never mention JSON instructions or tool details in replyText.\n\
         - warning should be null unless the provided scope is insufficient or ambiguous.\n\n\
         Note title: {note_title}\n\
         Note id: {note_id}\n\
         Note path: {note_path}\n\
         Scope: {scope} ({scope_label})\n\
         Line range: {start_line}-{end_line}\n\
         Snapshot hash: {snapshot_hash}\n\n\
         Recent conversation:\n\
         {history}\n\n\
         Numbered markdown content:\n\
         {numbered_content}\n\n\
         User request:\n\
         {user_prompt}\n",
        note_title = request.note_title,
        note_id = request.note_id,
        note_path = request.note_path,
        scope = request.scope,
        scope_label = request.scope_label,
        start_line = request.start_line,
        end_line = request.end_line,
        snapshot_hash = request.snapshot_hash,
        history = history,
        numbered_content = request.numbered_content,
        user_prompt = request.user_prompt,
    )
}

#[tauri::command]
async fn ai_assistant_turn(
    request: AssistantTurnRequest,
    state: State<'_, AppState>,
) -> Result<AssistantTurnResult, String> {
    let app_config = state
        .app_config
        .read()
        .expect("app_config read lock")
        .clone();
    let (_notes_root, execution_dir) =
        resolve_assistant_workspace(&request.note_path, &app_config)?;

    let execution_dir_str = execution_dir.to_string_lossy().to_string();

    let prompt = build_assistant_prompt(&request);
    let provider = request.provider.trim().to_lowercase();

    let result = match provider.as_str() {
        "claude" => execute_ai_cli(
            "Claude",
            "claude".to_string(),
            vec!["--print".to_string()],
            prompt,
            "Claude CLI not found. Please install it from https://claude.ai/code".to_string(),
            Some(execution_dir.clone()),
            None,
        )
        .await?,
        "codex" => execute_ai_cli(
            "Codex",
            "codex".to_string(),
            vec![
                "exec".to_string(),
                "--skip-git-repo-check".to_string(),
                "--dangerously-bypass-approvals-and-sandbox".to_string(),
                "-".to_string(),
            ],
            prompt,
            "Codex CLI not found. Please install it from https://github.com/openai/codex".to_string(),
            Some(execution_dir.clone()),
            None,
        )
        .await?,
        "opencode" => execute_ai_cli(
            "OpenCode",
            "opencode".to_string(),
            vec!["run".to_string(), "--".to_string(), prompt],
            String::new(),
            "OpenCode CLI not found. Please install it from https://opencode.ai".to_string(),
            Some(execution_dir.clone()),
            Some(vec![
                (
                    "OPENCODE_PERMISSION".to_string(),
                    r#"{"*":"allow","bash":"deny","task":"deny","webfetch":"deny","websearch":"deny","codesearch":"deny","skill":"deny","external_directory":"deny","doom_loop":"deny"}"#.to_string(),
                ),
            ]),
        )
        .await?,
        "ollama" => {
            let model_name = request
                .ollama_model
                .as_deref()
                .unwrap_or("qwen3:8b")
                .trim()
                .to_string();

            if !model_name.contains("cloud") {
                let mn = model_name.clone();
                let available = tauri::async_runtime::spawn_blocking(move || {
                    let path = get_expanded_path();
                    let mut cmd = no_window_cmd("ollama");
                    cmd.env("PATH", &path);
                    cmd.args(["show", &mn]);
                    cmd.stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null());
                    match cmd.status() {
                        Ok(status) => status.success(),
                        Err(_) => false,
                    }
                })
                .await
                .unwrap_or(false);

                if !available {
                    return Err(format!(
                        "Model '{}' is not installed. Run `ollama pull {}` in your terminal.",
                        model_name, model_name
                    ));
                }
            }

            execute_ai_cli(
                "Ollama",
                "ollama".to_string(),
                vec!["run".to_string(), model_name.clone()],
                prompt,
                "Ollama CLI not found. Please install it from https://ollama.com".to_string(),
                Some(execution_dir.clone()),
                None,
            )
            .await?
        }
        _ => return Err(format!("Unsupported assistant provider: {}", request.provider)),
    };

    if !result.success {
        return Err(result
            .error
            .unwrap_or_else(|| "Assistant request failed.".to_string()));
    }

    let mut parsed = parse_assistant_result(&result.output);
    parsed.execution_dir = Some(execution_dir_str);
    Ok(parsed)
}

#[tauri::command]
async fn ai_check_ollama_cli() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = get_expanded_path();
        check_cli_exists("ollama", &path)
    })
    .await
    .map_err(|e| format!("Failed to check Ollama CLI: {}", e))?
}

/// Check if a markdown file is inside the configured notes folder.
/// If so, emit a "select-note" event to the main window and focus it, returning true.
/// Returns false on any failure so callers can fall back to create_preview_window.
fn try_select_in_notes_folder(app: &AppHandle, path: &Path) -> bool {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return false,
    };

    let notes_folder = state
        .app_config
        .read()
        .expect("app_config read lock")
        .notes_folder
        .clone();

    let folder = match notes_folder {
        Some(f) => f,
        None => return false,
    };

    let folder_path = PathBuf::from(&folder);
    let (canonical_file, canonical_folder) = match (path.canonicalize(), folder_path.canonicalize())
    {
        (Ok(f), Ok(d)) => (f, d),
        _ => return false,
    };

    if !canonical_file.starts_with(&canonical_folder) {
        return false;
    }

    let note_id = match id_from_abs_path(&canonical_folder, &canonical_file) {
        Some(id) => id,
        None => return false,
    };

    let _ = app.emit_to("main", "select-note", note_id);
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
    true
}

/// Check if a file extension is a supported markdown extension.
fn is_markdown_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|s| {
            let lower = s.to_ascii_lowercase();
            lower == "md" || lower == "markdown"
        })
        .unwrap_or(false)
}

fn format_sly_window_title(title: &str) -> String {
    format!("{} — Sly", title)
}

fn focus_window_after_build(window: &tauri::WebviewWindow) {
    let win = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = win.set_focus();
    });
}

fn register_note_window(state: &AppState, note_id: &str, label: &str) {
    let mut note_windows = state.note_windows.lock().expect("note windows mutex");
    note_windows.retain(|_, existing_label| existing_label != label);
    note_windows.insert(note_id.to_string(), label.to_string());
}

fn clear_note_window_label(state: &AppState, label: &str) {
    let mut note_windows = state.note_windows.lock().expect("note windows mutex");
    note_windows.retain(|_, existing_label| existing_label != label);
}

fn detached_external_file_url(file_path: &str, presentation: &str) -> String {
    let encoded_path = urlencoding::encode(file_path);
    format!(
        "index.html?mode=detached&source=external-file&presentation={}&file={}",
        presentation, encoded_path
    )
}

fn detached_workspace_note_url(note_id: &str) -> String {
    let encoded_note = urlencoding::encode(note_id);
    format!(
        "index.html?mode=detached&source=workspace-note&presentation=interactive&note={}",
        encoded_note
    )
}

fn create_window_with_builder(
    app: &AppHandle,
    label: &str,
    url: String,
    title: String,
    inner_size: (f64, f64),
    min_inner_size: (f64, f64),
) -> Result<tauri::WebviewWindow, String> {
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(inner_size.0, inner_size.1)
        .min_inner_size(min_inner_size.0, min_inner_size.1)
        .resizable(true)
        .decorations(true);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    builder
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))
}

// Preview mode: create a lightweight window for editing a single file
fn create_preview_window(app: &AppHandle, file_path: &str) -> Result<(), String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    let label = format!("preview-{:x}", hasher.finish());

    // If window already exists for this file, focus it
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Extract filename for the window title
    let filename = PathBuf::from(file_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Preview".to_string());
    let url = detached_external_file_url(file_path, "interactive");
    let window = create_window_with_builder(
        app,
        &label,
        url,
        format_sly_window_title(&filename),
        (800.0, 600.0),
        (400.0, 300.0),
    )?;
    focus_window_after_build(&window);

    Ok(())
}

fn create_print_window(app: &AppHandle, file_path: &str) -> Result<(), String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    let label = format!("print-{:x}", hasher.finish());

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }

    let filename = PathBuf::from(file_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Print".to_string());
    let url = detached_external_file_url(file_path, "print");
    let window = create_window_with_builder(
        app,
        &label,
        url,
        format!("{} — Print — Sly", filename),
        (900.0, 700.0),
        (480.0, 360.0),
    )?;
    focus_window_after_build(&window);

    Ok(())
}

#[tauri::command]
fn open_note_window(app: AppHandle, note_id: String, state: State<AppState>) -> Result<(), String> {
    if let Some(existing_label) = state
        .note_windows
        .lock()
        .expect("note windows mutex")
        .get(&note_id)
        .cloned()
    {
        if let Some(window) = app.get_webview_window(&existing_label) {
            window.show().map_err(|e| e.to_string())?;
            window.unminimize().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    let folder = {
        let app_config = state.app_config.read().expect("app_config read lock");
        app_config
            .notes_folder
            .clone()
            .ok_or("Notes folder not set")?
    };
    let folder_path = PathBuf::from(&folder);
    let file_path = abs_path_from_id(&folder_path, &note_id)?;
    if !file_path.exists() {
        return Err("Note not found".to_string());
    }

    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let title = extract_title(&content);

    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    note_id.hash(&mut hasher);
    let label = format!("note-{:x}", hasher.finish());

    if let Some(window) = app.get_webview_window(&label) {
        register_note_window(&state, &note_id, &label);
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let window = create_window_with_builder(
        &app,
        &label,
        detached_workspace_note_url(&note_id),
        format_sly_window_title(&title),
        (900.0, 700.0),
        (480.0, 360.0),
    )?;
    register_note_window(&state, &note_id, &label);
    focus_window_after_build(&window);

    Ok(())
}

#[tauri::command]
fn sync_note_window_identity(
    window: tauri::WebviewWindow,
    note_id: String,
    title: String,
    state: State<AppState>,
) -> Result<(), String> {
    register_note_window(&state, &note_id, window.label());
    window
        .set_title(&format_sly_window_title(&title))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_file_preview(app: AppHandle, path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    if !try_select_in_notes_folder(&app, &file_path) {
        create_preview_window(&app, &path)?;
    }
    Ok(())
}

#[tauri::command]
fn open_print_preview(app: AppHandle, path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    create_print_window(&app, &path)
}

// ── Task commands ─────────────────────────────────────────────────────────────

fn notes_root_for_tasks(state: &AppState) -> Result<PathBuf, String> {
    let app_config = state.app_config.read().expect("app_config read lock");
    let folder = app_config
        .notes_folder
        .clone()
        .ok_or("Notes folder not set")?;
    Ok(PathBuf::from(folder))
}

#[tauri::command]
fn list_tasks(state: State<'_, AppState>) -> Result<Vec<tasks::TaskMetadata>, String> {
    let root = notes_root_for_tasks(&state)?;
    tasks::list_tasks(&root).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_task(id: String, state: State<'_, AppState>) -> Result<tasks::Task, String> {
    let root = notes_root_for_tasks(&state)?;
    tasks::read_task(&root, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_task(
    title: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<tasks::Task, String> {
    let root = notes_root_for_tasks(&state)?;
    let task = tasks::create_task(&root, &title).map_err(|e| e.to_string())?;
    let _ = app.emit("tasks-changed", ());
    Ok(task)
}

#[tauri::command]
fn update_task(
    id: String,
    patch: tasks::TaskPatch,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<tasks::Task, String> {
    let root = notes_root_for_tasks(&state)?;
    let task = tasks::update_task(&root, &id, patch).map_err(|e| e.to_string())?;
    let _ = app.emit("tasks-changed", ());
    Ok(task)
}

#[tauri::command]
fn set_task_completed(
    id: String,
    completed: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<tasks::Task, String> {
    let root = notes_root_for_tasks(&state)?;
    let task = tasks::set_task_completed(&root, &id, completed).map_err(|e| e.to_string())?;
    let _ = app.emit("tasks-changed", ());
    Ok(task)
}

#[tauri::command]
fn delete_task(id: String, state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    let root = notes_root_for_tasks(&state)?;
    tasks::delete_task(&root, &id).map_err(|e| e.to_string())?;
    let _ = app.emit("tasks-changed", ());
    Ok(())
}

#[tauri::command]
fn get_task_view_order(view: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let root = notes_root_for_tasks(&state)?;
    tasks::get_task_view_order(&root, &view).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_task_view_order(
    view: String,
    task_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let root = notes_root_for_tasks(&state)?;
    tasks::set_task_view_order(&root, &view, &task_ids).map_err(|e| e.to_string())
}

// Handle CLI arguments: open .md files in preview mode.
// Returns true if a standalone preview window was created (file outside notes folder).
fn handle_cli_args(app: &AppHandle, args: &[String], cwd: &str) -> bool {
    let mut opened_file = false;
    let mut opened_preview = false;

    for arg in args.iter().skip(1) {
        // Skip flags
        if arg.starts_with('-') {
            continue;
        }

        let path = if PathBuf::from(arg).is_absolute() {
            PathBuf::from(arg)
        } else {
            PathBuf::from(cwd).join(arg)
        };

        if is_markdown_extension(&path) && path.is_file() {
            opened_file = true;
            if !try_select_in_notes_folder(app, &path)
                && create_preview_window(app, &path.to_string_lossy()).is_ok()
            {
                opened_preview = true;
            }
        } else if path.is_dir() {
            let canonical = path.canonicalize().unwrap_or(path.clone());
            let state = app.state::<AppState>();
            // Full initialization: directory creation, write-access check,
            // asset-scope update, config/settings persist, and search-index rebuild
            match initialize_notes_folder(app, &canonical, &state) {
                Ok(normalized_path) => {
                    // Emit event for when app is already running (single-instance)
                    let _ = app.emit("set-notes-folder", normalized_path);
                    opened_file = true;
                }
                Err(e) => {
                    eprintln!("Failed to initialize notes folder {:?}: {}", canonical, e);
                }
            }
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }
        }
    }

    // If no files were opened, show and focus the main window
    if !opened_file {
        if let Some(main_window) = app.get_webview_window("main") {
            let _ = main_window.show();
            let _ = main_window.set_focus();
        }
    }

    opened_preview
}

fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let settings_item = MenuItemBuilder::with_id(MENU_SETTINGS_ID, "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let notes_mode_item = MenuItemBuilder::with_id(MENU_VIEW_NOTES_MODE_ID, "Notes")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;
    let tasks_mode_item = MenuItemBuilder::with_id(MENU_VIEW_TASKS_MODE_ID, "Tasks")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;
    let cycle_left_panes_item =
        MenuItemBuilder::with_id(MENU_CYCLE_LEFT_PANES_ID, "Cycle Left Panes")
            .accelerator("CmdOrCtrl+\\")
            .build(app)?;
    let one_pane_item = MenuItemBuilder::with_id(MENU_VIEW_1_PANE_ID, "1 Pane")
        .accelerator("CmdOrCtrl+Shift+J")
        .build(app)?;
    let two_pane_item = MenuItemBuilder::with_id(MENU_VIEW_2_PANE_ID, "2 Panes")
        .accelerator("CmdOrCtrl+Shift+K")
        .build(app)?;
    let three_pane_item = MenuItemBuilder::with_id(MENU_VIEW_3_PANE_ID, "3 Panes")
        .accelerator("CmdOrCtrl+Shift+L")
        .build(app)?;
    let right_pane_item =
        MenuItemBuilder::with_id(MENU_TOGGLE_OUTLINE_PANEL_ID, "Toggle Right Pane")
            .accelerator("CmdOrCtrl+Alt+4")
            .build(app)?;
    let focus_mode_item = MenuItemBuilder::with_id(MENU_FOCUS_MODE_ID, "Focus Mode")
        .accelerator("CmdOrCtrl+Shift+Enter")
        .build(app)?;
    let about_item = MenuItemBuilder::with_id(MENU_ABOUT_ID, "About Sly").build(app)?;
    let check_for_updates_item =
        MenuItemBuilder::with_id(MENU_CHECK_FOR_UPDATES_ID, "Check for Updates…").build(app)?;
    let github_item = MenuItemBuilder::with_id(MENU_VIEW_GITHUB_ID, "View on GitHub").build(app)?;
    let report_issue_item =
        MenuItemBuilder::with_id(MENU_REPORT_ISSUE_ID, "Report an Issue").build(app)?;

    #[cfg(target_os = "macos")]
    let app_menu = Submenu::with_items(
        app,
        app.package_info().name.clone(),
        true,
        &[
            &about_item,
            &check_for_updates_item,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &notes_mode_item,
            &tasks_mode_item,
            &PredefinedMenuItem::separator(app)?,
            &cycle_left_panes_item,
            &one_pane_item,
            &two_pane_item,
            &three_pane_item,
            &right_pane_item,
            &PredefinedMenuItem::separator(app)?,
            &focus_mode_item,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    let help_menu = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        "Help",
        true,
        &[&github_item, &report_issue_item],
    )?;

    #[cfg(not(target_os = "macos"))]
    let help_menu = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        "Help",
        true,
        &[
            &about_item,
            &check_for_updates_item,
            &PredefinedMenuItem::separator(app)?,
            &github_item,
            &report_issue_item,
        ],
    )?;

    let mut menu = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    {
        menu = menu.item(&app_menu);
    }

    #[cfg(not(target_os = "macos"))]
    {
        menu = menu.item(&file_menu);
    }

    menu.item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()
}

fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.unminimize();
        let _ = main_window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn default_task_quick_add_shortcut() -> &'static str {
    "Control+Space"
}

#[cfg(not(target_os = "macos"))]
fn default_task_quick_add_shortcut() -> &'static str {
    "CommandOrControl+Shift+N"
}

fn resolve_task_quick_add_shortcut_accelerator(settings: &Settings) -> Option<String> {
    if settings.tasks_enabled != Some(true) {
        return None;
    }

    let normalized = settings
        .task_quick_add_shortcut
        .as_deref()
        .and_then(normalize_task_quick_add_shortcut_value);

    match normalized.as_deref() {
        Some("disabled") => None,
        Some(accelerator) => Some(accelerator.to_string()),
        None => Some(default_task_quick_add_shortcut().to_string()),
    }
}

#[cfg(desktop)]
fn sync_task_quick_add_shortcut<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
) -> Result<(), String> {
    let has_notes_folder = state
        .app_config
        .read()
        .expect("app_config read lock")
        .notes_folder
        .is_some();
    let next_shortcut = if has_notes_folder {
        let settings = state.settings.read().expect("settings read lock");
        resolve_task_quick_add_shortcut_accelerator(&settings)
    } else {
        None
    };

    let mut registered_shortcut = state
        .registered_task_quick_add_shortcut
        .lock()
        .expect("task quick add shortcut mutex");

    if *registered_shortcut == next_shortcut {
        return Ok(());
    }

    if let Some(current) = registered_shortcut.as_deref() {
        app.global_shortcut()
            .unregister(current)
            .map_err(|error| error.to_string())?;
    }

    *registered_shortcut = None;

    if let Some(next) = next_shortcut {
        app.global_shortcut()
            .register(next.as_str())
            .map_err(|error| error.to_string())?;
        *registered_shortcut = Some(next);
    }

    Ok(())
}

#[cfg(not(desktop))]
fn sync_task_quick_add_shortcut<R: Runtime>(
    _app: &AppHandle<R>,
    _state: &AppState,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn should_hide_window_on_close(window_label: &str) -> bool {
    window_label == "main"
}

fn open_external_url(url: &'static str) {
    tauri::async_runtime::spawn(async move {
        let _ = open_url_safe(url.to_string()).await;
    });
}

fn handle_app_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        MENU_SETTINGS_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "open-settings", ());
        }
        MENU_VIEW_NOTES_MODE_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "show-notes-mode", ());
        }
        MENU_VIEW_TASKS_MODE_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "show-tasks-mode", ());
        }
        MENU_CYCLE_LEFT_PANES_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "cycle-left-panes", ());
        }
        MENU_VIEW_1_PANE_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "set-pane-mode", 1_i32);
        }
        MENU_VIEW_2_PANE_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "set-pane-mode", 2_i32);
        }
        MENU_VIEW_3_PANE_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "set-pane-mode", 3_i32);
        }
        MENU_TOGGLE_OUTLINE_PANEL_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "toggle-right-panel", ());
        }
        MENU_FOCUS_MODE_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "toggle-focus-mode", ());
        }
        MENU_ABOUT_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "open-settings-about", ());
        }
        MENU_CHECK_FOR_UPDATES_ID => {
            focus_main_window(app);
            let _ = app.emit_to("main", "check-for-updates", ());
        }
        MENU_VIEW_GITHUB_ID => {
            open_external_url(REPOSITORY_URL);
        }
        MENU_REPORT_ISSUE_ID => {
            open_external_url(ISSUES_URL);
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = cli::maybe_run_preflight(&args) {
        std::process::exit(code);
    }

    let builder = tauri::Builder::default()
        .menu(build_app_menu)
        .on_menu_event(handle_app_menu_event)
        // Single-instance: forward CLI args from subsequent launches to the running instance
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            handle_cli_args(app, &args, &cwd);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    focus_main_window(app);
                    let _ = app.emit_to("main", OPEN_GLOBAL_TASK_CAPTURE_EVENT, ());
                }
            })
            .build(),
    );

    let app = builder
        .setup(move |app| {
            // Load app config on startup (contains notes folder path)
            let mut app_config = load_app_config(app.handle());
            let mut app_config_dirty = false;

            // Normalize saved paths from config and clear empty values.
            if let Some(saved_path) = app_config.notes_folder.clone() {
                match normalize_notes_folder_path(&saved_path) {
                    Ok(normalized) if normalized.is_dir() => {
                        let normalized_str = normalized.to_string_lossy().into_owned();
                        if normalized_str != saved_path {
                            app_config.notes_folder = Some(normalized_str);
                            app_config_dirty = true;
                        }
                    }
                    Ok(normalized) => {
                        // Path is structurally valid but not currently a directory
                        // (e.g., unmounted drive). Preserve the user's preference.
                        eprintln!(
                            "Notes folder not found (may be temporarily unavailable): {:?}",
                            normalized
                        );
                    }
                    Err(_) => {
                        app_config.notes_folder = None;
                        app_config_dirty = true;
                    }
                }
            }

            // Load per-folder settings if notes folder is set
            let settings = if let Some(ref folder) = app_config.notes_folder {
                load_settings(folder)
            } else {
                Settings::default()
            };

            if app_config_dirty {
                let _ = save_app_config(app.handle(), &app_config);
            }

            // Initialize search index if notes folder is set
            let search_index = if let Some(ref folder) = app_config.notes_folder {
                if let Ok(index_path) = get_search_index_path(app.handle()) {
                    SearchIndex::new(&index_path).ok().inspect(|idx| {
                        let _ = idx.rebuild_index(&PathBuf::from(folder));
                    })
                } else {
                    None
                }
            } else {
                None
            };

            let state = AppState {
                app_config: RwLock::new(app_config),
                settings: RwLock::new(settings),
                notes_cache: RwLock::new(HashMap::new()),
                notes_cache_root: RwLock::new(None),
                note_mutation_lock: tokio::sync::Mutex::new(()),
                file_watcher: Mutex::new(None),
                note_windows: Mutex::new(HashMap::new()),
                search_index: Mutex::new(search_index),
                debounce_map: Arc::new(Mutex::new(HashMap::new())),
                registered_task_quick_add_shortcut: Mutex::new(None),
            };
            app.manage(state);

            // Add notes folder to asset protocol scope so images can be served
            if let Some(ref folder) = app
                .state::<AppState>()
                .app_config
                .read()
                .expect("app_config read lock")
                .notes_folder
                .clone()
            {
                let _ = app.asset_protocol_scope().allow_directory(folder, true);
            }

            // Handle CLI args on first launch; determine whether to show the main window.
            // When a standalone preview is opened (file outside the notes folder) and the
            // notes folder is already configured, the main window is closed so users only
            // see the preview. When no notes folder is configured yet, the main window is
            // always shown so new users can complete onboarding via the FolderPicker.
            let opened_preview = if args.len() > 1 {
                let cwd = std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                handle_cli_args(app.handle(), &args, &cwd)
            } else {
                false
            };

            if let Some(main_window) = app.get_webview_window("main") {
                let has_notes_folder = app
                    .state::<AppState>()
                    .app_config
                    .read()
                    .expect("app_config read lock")
                    .notes_folder
                    .is_some();

                if opened_preview && has_notes_folder {
                    // Existing user: notes folder is configured and a standalone preview
                    // was opened. Close the hidden main window so only the preview is visible.
                    let _ = main_window.hide();
                } else {
                    // Show the main window when:
                    // - No standalone preview was opened (normal launch), OR
                    // - No notes folder is configured yet (new user needs FolderPicker
                    //   for onboarding, even if a preview is also showing).
                    let _ = main_window.show();
                }
            }

            if let Err(error) =
                sync_task_quick_add_shortcut(app.handle(), app.state::<AppState>().inner())
            {
                eprintln!("Failed to register task quick add shortcut: {error}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if should_hide_window_on_close(window.label()) {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }

                tauri::WindowEvent::Destroyed => {
                    let app = window.app_handle();
                    let state = app.state::<AppState>();
                    clear_note_window_label(&state, window.label());
                }

                // Handle drag-and-drop of .md files onto any window
                tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                    let app = window.app_handle();
                    for path in paths {
                        if is_markdown_extension(path)
                            && path.is_file()
                            && !try_select_in_notes_folder(app, path)
                        {
                            let _ = create_preview_window(app, &path.to_string_lossy());
                        }
                    }
                }

                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_notes_folder,
            set_notes_folder,
            list_notes,
            read_note,
            save_note,
            rename_note,
            delete_note,
            delete_notes,
            create_note,
            duplicate_note,
            list_folders,
            create_folder,
            delete_folder,
            rename_folder,
            move_note,
            move_notes,
            move_folder,
            get_settings,
            get_appearance_settings,
            get_ai_working_directory,
            set_ai_working_directory,
            update_appearance_settings,
            patch_settings,
            update_git_enabled,
            preview_note_name,
            write_file,
            search_notes,
            start_file_watcher,
            rebuild_search_index,
            copy_to_clipboard,
            copy_image_to_assets,
            save_clipboard_image,
            open_folder_dialog,
            open_in_file_manager,
            open_url_safe,
            git_is_available,
            git_get_status,
            git_init_repo,
            git_commit,
            git_push,
            git_fetch,
            git_pull,
            git_add_remote,
            git_push_with_upstream,
            ai_check_claude_cli,
            ai_check_codex_cli,
            ai_check_opencode_cli,
            ai_check_ollama_cli,
            ai_assistant_turn,
            read_file_direct,
            save_file_direct,
            import_file_to_folder,
            open_file_preview,
            open_print_preview,
            open_note_window,
            sync_note_window_identity,
            install_cli,
            uninstall_cli,
            get_cli_status,
            list_tasks,
            read_task,
            create_task,
            update_task,
            set_task_completed,
            delete_task,
            get_task_view_order,
            set_task_view_order,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Use .run() callback to handle macOS "Open With" file events
    // RunEvent::Opened is macOS-only in Tauri v2
    app.run(|_app_handle, _event| {
        #[cfg(target_os = "macos")]
        match _event {
            tauri::RunEvent::Opened { urls } => {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if is_markdown_extension(&path)
                            && path.is_file()
                            && !try_select_in_notes_folder(_app_handle, &path)
                        {
                            let _ = create_preview_window(_app_handle, &path.to_string_lossy());
                        }
                    }
                }
            }

            tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows {
                    focus_main_window(_app_handle);
                }
            }

            _ => {}
        };
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn note(id: &str, title: &str, modified: i64, created: i64) -> NoteMetadata {
        NoteMetadata {
            id: id.to_string(),
            title: title.to_string(),
            preview: String::new(),
            modified,
            created,
        }
    }

    fn old_default_appearance() -> AppearanceSettings {
        persistence::app_config::old_default_appearance()
    }

    fn next_temp_suffix() -> String {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let counter = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{unique}-{counter}")
    }

    fn temp_file_path(prefix: &str) -> PathBuf {
        let suffix = next_temp_suffix();
        std::env::temp_dir().join(format!("sly-{prefix}-{suffix}.json"))
    }

    fn temp_dir_path(prefix: &str) -> PathBuf {
        let suffix = next_temp_suffix();
        std::env::temp_dir().join(format!("sly-{prefix}-{suffix}"))
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn hides_only_main_window_on_close() {
        assert!(should_hide_window_on_close("main"));
        assert!(!should_hide_window_on_close("preview-123"));
    }

    #[test]
    fn resolve_created_timestamp_falls_back_to_modified() {
        assert_eq!(resolve_created_timestamp(None, 42), 42);
        assert_eq!(resolve_created_timestamp(Some(7), 42), 7);
    }

    #[test]
    fn migrate_appearance_defaults_updates_only_old_default_fields() {
        let mut appearance = old_default_appearance();

        assert!(persistence::app_config::migrate_appearance_defaults(
            &mut appearance
        ));
        assert_eq!(appearance.ui_font, FontChoice::preset("inter"));
        assert_eq!(
            appearance.note_font,
            FontChoice::preset("atkinson-hyperlegible-next")
        );
        assert_eq!(appearance.code_font, FontChoice::preset("jetbrains-mono"));
        assert!((appearance.note_typography.base_font_size - 16.0).abs() < 0.0001);
        assert!((appearance.note_typography.line_height - 1.5).abs() < 0.0001);
    }

    #[test]
    fn migrate_appearance_defaults_preserves_customized_fields() {
        let mut appearance = old_default_appearance();
        appearance.ui_font = FontChoice::preset("system-serif");
        appearance.note_font = FontChoice {
            kind: "custom".to_string(),
            value: "\"Literata\", serif".to_string(),
        };
        appearance.code_font = FontChoice::preset("jetbrains-mono");
        appearance.note_typography.base_font_size = 18.0;
        appearance.note_typography.line_height = 1.8;

        assert!(!persistence::app_config::migrate_appearance_defaults(
            &mut appearance
        ));
        assert_eq!(appearance.ui_font, FontChoice::preset("system-serif"));
        assert_eq!(appearance.note_font.kind, "custom");
        assert_eq!(appearance.note_font.value, "\"Literata\", serif");
        assert_eq!(appearance.code_font, FontChoice::preset("jetbrains-mono"));
        assert!((appearance.note_typography.base_font_size - 18.0).abs() < 0.0001);
        assert!((appearance.note_typography.line_height - 1.8).abs() < 0.0001);
    }

    #[test]
    fn migrate_appearance_defaults_handles_partial_migration() {
        let mut appearance = old_default_appearance();
        appearance.note_font = FontChoice::preset("system-serif");
        appearance.note_typography.base_font_size = 18.0;

        assert!(persistence::app_config::migrate_appearance_defaults(
            &mut appearance
        ));
        assert_eq!(appearance.ui_font, FontChoice::preset("inter"));
        assert_eq!(appearance.note_font, FontChoice::preset("system-serif"));
        assert_eq!(appearance.code_font, FontChoice::preset("jetbrains-mono"));
        assert!((appearance.note_typography.base_font_size - 18.0).abs() < 0.0001);
        assert!((appearance.note_typography.line_height - 1.5).abs() < 0.0001);
    }

    #[test]
    fn load_app_config_migrates_legacy_file_and_writes_back_latest_schema() {
        let path = temp_file_path("app-config");
        std::fs::write(
            &path,
            r#"{
  "notes_folder": "/notes",
  "appearance": {
    "mode": "system",
    "lightPresetId": "nord-light",
    "darkPresetId": "nord",
    "uiFont": { "kind": "preset", "value": "system-sans" },
    "noteFont": { "kind": "preset", "value": "system-sans" },
    "codeFont": { "kind": "preset", "value": "system-mono" },
    "noteTypography": { "baseFontSize": 15, "boldWeight": 600, "lineHeight": 1.6 },
    "textDirection": "auto",
    "editorWidth": "normal",
    "interfaceZoom": 1,
    "paneMode": 3,
    "confirmDeletions": true
  }
}"#,
        )
        .unwrap();

        let config = persistence::app_config::load_app_config_from_path(&path);

        assert_eq!(
            config.schema_version,
            persistence::app_config::current_app_config_schema_version()
        );
        assert_eq!(config.appearance.ui_font, FontChoice::preset("inter"));
        assert_eq!(
            config.appearance.note_font,
            FontChoice::preset("atkinson-hyperlegible-next")
        );
        assert_eq!(
            config.appearance.code_font,
            FontChoice::preset("jetbrains-mono")
        );
        assert_eq!(config.appearance.folders_pane_width, 240);
        assert_eq!(config.appearance.notes_pane_width, 304);
        assert!(config.appearance.right_panel_visible);
        assert_eq!(config.appearance.right_panel_width, 260);
        assert_eq!(config.appearance.right_panel_tab, "outline");

        let rewritten: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(rewritten["schemaVersion"], serde_json::json!(1));
        assert_eq!(
            rewritten["appearance"]["foldersPaneWidth"],
            serde_json::json!(240)
        );
        assert_eq!(
            rewritten["appearance"]["notesPaneWidth"],
            serde_json::json!(304)
        );
        assert_eq!(
            rewritten["appearance"]["rightPanelVisible"],
            serde_json::json!(true)
        );
        assert_eq!(
            rewritten["appearance"]["rightPanelWidth"],
            serde_json::json!(260)
        );
        assert_eq!(
            rewritten["appearance"]["rightPanelTab"],
            serde_json::json!("outline")
        );

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn load_app_config_trims_ai_working_directory_and_rewrites_empty_value() {
        let path = temp_file_path("app-config-ai-working-directory");
        std::fs::write(
            &path,
            r#"{
  "schemaVersion": 1,
  "notes_folder": "/notes",
  "aiWorkingDirectory": "   ",
  "appearance": {
    "mode": "system",
    "lightPresetId": "sly-light",
    "darkPresetId": "sly-dark",
    "uiFont": { "kind": "preset", "value": "inter" },
    "noteFont": { "kind": "preset", "value": "atkinson-hyperlegible-next" },
    "codeFont": { "kind": "preset", "value": "jetbrains-mono" },
    "noteTypography": { "baseFontSize": 16, "boldWeight": 600, "lineHeight": 1.5 },
    "textDirection": "auto",
    "editorWidth": "normal",
    "interfaceZoom": 1,
    "paneMode": 3,
    "foldersPaneWidth": 240,
    "notesPaneWidth": 304,
    "rightPanelVisible": true,
    "rightPanelWidth": 260,
    "rightPanelTab": "assistant",
    "confirmDeletions": true
  }
}"#,
        )
        .unwrap();

        let config = persistence::app_config::load_app_config_from_path(&path);

        assert_eq!(config.ai_working_directory, None);

        let rewritten: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(rewritten["aiWorkingDirectory"], serde_json::Value::Null);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn canonicalize_app_config_trims_ai_working_directory() {
        let mut config = AppConfig {
            ai_working_directory: Some("  /tmp/reference  ".to_string()),
            ..Default::default()
        };

        assert!(persistence::app_config::canonicalize_app_config(
            &mut config
        ));
        assert_eq!(
            config.ai_working_directory,
            Some("/tmp/reference".to_string())
        );
    }

    #[test]
    fn canonicalize_app_config_clamps_right_panel_width() {
        let mut config = AppConfig::default();
        config.appearance.right_panel_width = 999;
        config.appearance.right_panel_tab = "legacy".to_string();

        assert!(persistence::app_config::canonicalize_app_config(
            &mut config
        ));
        assert_eq!(config.appearance.right_panel_width, 420);
        assert_eq!(config.appearance.right_panel_tab, "outline");
    }

    #[test]
    fn resolve_assistant_workspace_uses_notes_folder_when_no_override_is_set() {
        let notes_root = temp_dir_path("notes-root");
        std::fs::create_dir_all(&notes_root).unwrap();
        let note_path = notes_root.join("note.md");
        std::fs::write(&note_path, "# Note\n").unwrap();

        let config = AppConfig {
            notes_folder: Some(notes_root.to_string_lossy().into_owned()),
            ..Default::default()
        };

        let (resolved_notes_root, execution_dir) =
            resolve_assistant_workspace(&note_path.to_string_lossy(), &config).unwrap();

        assert_eq!(resolved_notes_root, notes_root.canonicalize().unwrap());
        assert_eq!(execution_dir, notes_root.canonicalize().unwrap());

        let _ = std::fs::remove_file(note_path);
        let _ = std::fs::remove_dir(notes_root);
    }

    #[test]
    fn resolve_assistant_workspace_uses_custom_ai_working_directory_when_valid() {
        let notes_root = temp_dir_path("notes-root");
        let reference_root = temp_dir_path("reference-root");
        std::fs::create_dir_all(&notes_root).unwrap();
        std::fs::create_dir_all(&reference_root).unwrap();
        let note_path = notes_root.join("note.md");
        std::fs::write(&note_path, "# Note\n").unwrap();

        let config = AppConfig {
            notes_folder: Some(notes_root.to_string_lossy().into_owned()),
            ai_working_directory: Some(reference_root.to_string_lossy().into_owned()),
            ..Default::default()
        };

        let (_resolved_notes_root, execution_dir) =
            resolve_assistant_workspace(&note_path.to_string_lossy(), &config).unwrap();

        assert_eq!(execution_dir, reference_root.canonicalize().unwrap());

        let _ = std::fs::remove_file(note_path);
        let _ = std::fs::remove_dir(notes_root);
        let _ = std::fs::remove_dir(reference_root);
    }

    #[test]
    fn resolve_assistant_workspace_rejects_invalid_ai_working_directory_override() {
        let notes_root = temp_dir_path("notes-root");
        let missing_reference_root = temp_dir_path("missing-reference-root");
        std::fs::create_dir_all(&notes_root).unwrap();
        let note_path = notes_root.join("note.md");
        std::fs::write(&note_path, "# Note\n").unwrap();

        let config = AppConfig {
            notes_folder: Some(notes_root.to_string_lossy().into_owned()),
            ai_working_directory: Some(missing_reference_root.to_string_lossy().into_owned()),
            ..Default::default()
        };

        let error = resolve_assistant_workspace(&note_path.to_string_lossy(), &config)
            .expect_err("invalid override should fail");

        assert!(
            error.contains("AI reference folder") && error.contains("is not accessible"),
            "unexpected error: {error}"
        );

        let _ = std::fs::remove_file(note_path);
        let _ = std::fs::remove_dir(notes_root);
    }

    #[test]
    fn resolve_assistant_workspace_still_rejects_note_outside_notes_folder_with_override() {
        let notes_root = temp_dir_path("notes-root");
        let reference_root = temp_dir_path("reference-root");
        let external_root = temp_dir_path("external-root");
        std::fs::create_dir_all(&notes_root).unwrap();
        std::fs::create_dir_all(&reference_root).unwrap();
        std::fs::create_dir_all(&external_root).unwrap();
        let note_path = external_root.join("note.md");
        std::fs::write(&note_path, "# Note\n").unwrap();

        let config = AppConfig {
            notes_folder: Some(notes_root.to_string_lossy().into_owned()),
            ai_working_directory: Some(reference_root.to_string_lossy().into_owned()),
            ..Default::default()
        };

        let error = resolve_assistant_workspace(&note_path.to_string_lossy(), &config)
            .expect_err("note outside notes folder should fail");

        assert_eq!(error, "File must be within notes folder");

        let _ = std::fs::remove_file(note_path);
        let _ = std::fs::remove_dir(notes_root);
        let _ = std::fs::remove_dir(reference_root);
        let _ = std::fs::remove_dir(external_root);
    }

    #[test]
    fn parse_assistant_result_accepts_strict_json() {
        let result = parse_assistant_result(
            r#"{"replyText":"Done.","proposals":[{"id":"p1","title":"Rewrite intro","summary":"Tighten the opening.","startLine":3,"endLine":4,"replacement":"New intro"}],"warning":null}"#,
        );

        assert_eq!(result.reply_text, "Done.");
        assert_eq!(result.proposals.len(), 1);
        assert_eq!(result.proposals[0].id, "p1");
        assert!(result.warning.is_none());
    }

    #[test]
    fn parse_assistant_result_falls_back_to_plain_text_for_invalid_json() {
        let result = parse_assistant_result("Not valid JSON");

        assert_eq!(result.reply_text, "Not valid JSON");
        assert!(result.proposals.is_empty());
        assert!(result.warning.is_some());
    }

    #[test]
    fn load_settings_migrates_legacy_file_and_writes_back_latest_schema() {
        let path = temp_file_path("workspace-settings");
        std::fs::write(
            &path,
            r#"{
  "recentNoteIds": [" beta ", "", 42],
  "folderIcons": {
    "docs": { "icon": { "kind": "lucide", "name": "folder-open" }, "colorId": "blue" },
    "": { "icon": { "kind": "lucide", "name": "" } }
  },
  "folderNoteSortModes": {
    "docs": "titleDesc",
    "": "createdAsc",
    "bad": "invalid"
  },
  "noteListPreviewLines": 9,
  "folderSortMode": "legacy",
  "taskQuickAddShortcut": "not-real"
}"#,
        )
        .unwrap();

        let settings = persistence::workspace_settings::load_settings_from_path(&path);

        assert_eq!(
            settings.schema_version,
            persistence::workspace_settings::current_settings_schema_version()
        );
        assert!(!settings.show_notes_from_subfolders);
        assert_eq!(settings.note_list_preview_lines, 3);
        assert_eq!(settings.folder_sort_mode, FolderSortMode::NameAsc);
        assert_eq!(settings.recent_note_ids, Some(vec!["beta".to_string()]));
        assert_eq!(
            settings.folder_note_sort_modes,
            Some(HashMap::from([(
                "docs".to_string(),
                NoteSortMode::TitleDesc,
            )]))
        );
        assert_eq!(settings.folder_icons.as_ref().map(HashMap::len), Some(1));

        let rewritten: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(rewritten["schemaVersion"], serde_json::json!(1));
        assert_eq!(
            rewritten["showNotesFromSubfolders"],
            serde_json::json!(false)
        );
        assert_eq!(rewritten["noteListPreviewLines"], serde_json::json!(3));
        assert_eq!(rewritten["folderSortMode"], serde_json::json!("nameAsc"));
        assert!(rewritten.get("taskQuickAddShortcut").is_none());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn load_settings_leaves_current_schema_file_unchanged() {
        let path = temp_file_path("workspace-settings-current");
        let content = r#"{
  "schemaVersion": 1,
  "gitEnabled": null,
  "pinnedNoteIds": null,
  "recentNoteIds": ["alpha"],
  "showPinnedNotes": null,
  "showRecentNotes": null,
  "showNoteCounts": true,
  "showNotesFromSubfolders": false,
  "defaultNoteName": null,
  "ollamaModel": null,
  "folderIcons": null,
  "collapsedFolders": null,
  "noteListDateMode": "modified",
  "showNoteListFilename": false,
  "showNoteListFolderPath": true,
  "showNoteListPreview": true,
  "noteListPreviewLines": 2,
  "noteSortMode": "modifiedDesc",
  "folderNoteSortModes": null,
  "folderSortMode": "nameAsc"
}"#;
        std::fs::write(&path, content).unwrap();

        let settings = persistence::workspace_settings::load_settings_from_path(&path);

        assert_eq!(settings.recent_note_ids, Some(vec!["alpha".to_string()]));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), content);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn sort_notes_keeps_pins_first_for_every_mode() {
        let modes = [
            NoteSortMode::ModifiedDesc,
            NoteSortMode::ModifiedAsc,
            NoteSortMode::CreatedDesc,
            NoteSortMode::CreatedAsc,
            NoteSortMode::TitleAsc,
            NoteSortMode::TitleDesc,
        ];

        for mode in modes {
            let mut notes = vec![
                note("alpha", "Alpha", 30, 30),
                note("beta", "Beta", 10, 10),
                note("gamma", "Gamma", 20, 20),
            ];
            let pinned_ids = ["beta".to_string()].into_iter().collect();

            sort_notes(&mut notes, &pinned_ids, mode);

            assert_eq!(notes[0].id, "beta");
        }
    }

    #[test]
    fn sort_notes_supports_created_and_title_modes() {
        let mut created_notes = vec![
            note("one", "Zulu", 10, 30),
            note("two", "Alpha", 30, 10),
            note("three", "Mike", 20, 20),
        ];
        sort_notes(
            &mut created_notes,
            &HashSet::new(),
            NoteSortMode::CreatedAsc,
        );
        assert_eq!(
            created_notes
                .iter()
                .map(|note| note.id.as_str())
                .collect::<Vec<_>>(),
            vec!["two", "three", "one"]
        );

        let mut title_notes = vec![
            note("one", "Zulu", 10, 10),
            note("two", "Alpha", 20, 20),
            note("three", "Mike", 30, 30),
        ];
        sort_notes(&mut title_notes, &HashSet::new(), NoteSortMode::TitleDesc);
        assert_eq!(
            title_notes
                .iter()
                .map(|note| note.id.as_str())
                .collect::<Vec<_>>(),
            vec!["one", "three", "two"]
        );
    }

    #[test]
    fn generate_preview_combines_multiple_body_lines() {
        let content =
            "# Title\nFirst preview sentence.\n\nSecond preview sentence.\nThird preview sentence.";

        let preview = generate_preview(content);

        assert_eq!(
            preview,
            "First preview sentence. Second preview sentence. Third preview sentence."
        );
    }

    #[test]
    fn generate_preview_adds_ellipsis_when_truncated() {
        let content = format!(
            "# Title\n{}\n{}\n",
            "alpha ".repeat(40).trim_end(),
            "beta ".repeat(40).trim_end()
        );

        let preview = generate_preview(&content);

        assert!(preview.ends_with("..."));
        assert!(preview.chars().count() <= NOTE_PREVIEW_MAX_CHARS);
    }

    #[test]
    fn rewrite_note_id_prefixes_updates_recent_and_pinned_note_ids() {
        let mut note_ids = vec![
            "source/moved/one".to_string(),
            "source/moved/nested/two".to_string(),
            "other/three".to_string(),
        ];

        let changed = rewrite_note_id_prefixes(&mut note_ids, "source/moved", "target/moved");

        assert!(changed);
        assert_eq!(
            note_ids,
            vec![
                "target/moved/one".to_string(),
                "target/moved/nested/two".to_string(),
                "other/three".to_string(),
            ]
        );
    }

    #[test]
    fn collapsed_folder_paths_rewrite_nested_paths() {
        let mut collapsed_folders = vec![
            "docs".to_string(),
            "docs/rust".to_string(),
            "journal".to_string(),
        ];

        rewrite_collapsed_folder_paths(&mut collapsed_folders, "docs", "work");

        assert_eq!(
            collapsed_folders,
            vec![
                "work".to_string(),
                "work/rust".to_string(),
                "journal".to_string(),
            ]
        );
    }

    #[test]
    fn collapsed_folder_paths_remove_deleted_paths_and_descendants() {
        let mut collapsed_folders = vec![
            "docs".to_string(),
            "docs/rust".to_string(),
            "journal".to_string(),
        ];

        remove_collapsed_folder_paths(&mut collapsed_folders, "docs");

        assert_eq!(collapsed_folders, vec!["journal".to_string()]);
    }

    #[test]
    fn validate_folder_path_rejects_reserved_names_and_traversal() {
        assert!(validate_folder_path("notes/personal").is_ok());
        assert!(validate_folder_path("notes/../private").is_err());
        assert!(validate_folder_path(".sly").is_err());
        assert!(validate_folder_path("assets/images").is_err());
    }

    #[test]
    fn sanitize_filename_normalizes_empty_and_invalid_characters() {
        assert_eq!(sanitize_filename("  My:/Note  "), "My--Note");
        assert_eq!(sanitize_filename(" \u{00A0}\u{FEFF} "), "Untitled");
    }

    #[test]
    fn placeholder_detection_is_limited_to_default_untitled_names() {
        assert!(is_default_placeholder_leaf("Untitled"));
        assert!(is_default_placeholder_leaf("Untitled-3"));
        assert!(!is_default_placeholder_leaf("Daily"));
        assert!(!is_default_placeholder_leaf("Untitled-copy"));
        assert!(is_default_placeholder_title("Untitled"));
        assert!(is_default_placeholder_title("Untitled 4"));
        assert!(!is_default_placeholder_title("Untitled Copy"));
    }

    #[test]
    fn unique_note_id_for_leaf_preserves_folder_prefix_and_suffixes_collisions() {
        let notes_root = temp_dir_path("unique-note-id");
        std::fs::create_dir_all(notes_root.join("docs")).unwrap();
        std::fs::write(notes_root.join("docs/Alpha.md"), "# Alpha\n").unwrap();

        let unique_id = unique_note_id_for_leaf(&notes_root, "docs/Untitled", "Alpha").unwrap();

        assert_eq!(unique_id, "docs/Alpha-1");

        let _ = std::fs::remove_dir_all(notes_root);
    }

    #[test]
    fn normalize_requested_note_leaf_strips_markdown_extension() {
        assert_eq!(normalize_requested_note_leaf("  Daily.md "), "Daily");
        assert_eq!(normalize_requested_note_leaf("Report.MD"), "Report");
    }

    #[test]
    fn create_unique_note_file_suffixes_collisions_without_overwriting() {
        let notes_root = temp_dir_path("create-unique-note-file");
        std::fs::create_dir_all(&notes_root).unwrap();
        std::fs::write(notes_root.join("Alpha.md"), "# Existing\n").unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let (final_id, final_path) = runtime
            .block_on(create_unique_note_file(&notes_root, "Alpha", b"# New\n"))
            .unwrap();

        assert_eq!(final_id, "Alpha-1");
        assert_eq!(std::fs::read_to_string(final_path).unwrap(), "# New\n");
        assert_eq!(
            std::fs::read_to_string(notes_root.join("Alpha.md")).unwrap(),
            "# Existing\n"
        );

        let _ = std::fs::remove_dir_all(notes_root);
    }

    #[test]
    fn move_note_file_without_clobber_keeps_existing_destination() {
        let notes_root = temp_dir_path("move-note-file-without-clobber");
        std::fs::create_dir_all(&notes_root).unwrap();
        let source = notes_root.join("Source.md");
        let destination = notes_root.join("Destination.md");
        std::fs::write(&source, "# Source\n").unwrap();
        std::fs::write(&destination, "# Destination\n").unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let error = runtime
            .block_on(move_note_file_without_clobber(&source, &destination))
            .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "# Source\n");
        assert_eq!(
            std::fs::read_to_string(&destination).unwrap(),
            "# Destination\n"
        );

        let _ = std::fs::remove_dir_all(notes_root);
    }

    #[test]
    fn rewrite_content_heading_replaces_existing_heading_after_frontmatter() {
        let original = "---\nlayout: note\n---\n# Original\n\nBody";
        let rewritten = rewrite_content_heading(original, "Original (Copy)");

        assert_eq!(
            rewritten,
            "---\nlayout: note\n---\n# Original (Copy)\n\nBody"
        );
    }

    #[test]
    fn rewrite_content_heading_inserts_heading_when_missing() {
        let original = "First paragraph\n\nBody";
        let rewritten = rewrite_content_heading(original, "Inserted");

        assert_eq!(rewritten, "# Inserted\n\nFirst paragraph\n\nBody");
    }

    #[test]
    fn preview_note_name_replaces_counter_placeholder() {
        let preview = preview_note_name("Daily-{counter}".to_string()).unwrap();
        assert_eq!(preview, "Daily-1");
    }

    #[test]
    fn apply_settings_patch_updates_only_requested_fields() {
        let mut settings = Settings {
            schema_version: persistence::workspace_settings::current_settings_schema_version(),
            git_enabled: Some(true),
            pinned_note_ids: Some(vec!["alpha".to_string()]),
            recent_note_ids: Some(vec!["alpha".to_string()]),
            show_pinned_notes: Some(true),
            show_recent_notes: Some(true),
            show_note_counts: true,
            show_notes_from_subfolders: false,
            default_note_name: Some("Untitled".to_string()),
            ollama_model: Some("qwen3:8b".to_string()),
            folder_icons: None,
            collapsed_folders: None,
            note_list_date_mode: NoteListDateMode::Modified,
            show_note_list_filename: true,
            show_note_list_folder_path: false,
            show_note_list_preview: true,
            note_list_preview_lines: 2,
            note_sort_mode: NoteSortMode::TitleAsc,
            folder_note_sort_modes: Some(HashMap::from([(
                "journal".to_string(),
                NoteSortMode::CreatedAsc,
            )])),
            folder_sort_mode: FolderSortMode::NameDesc,
            tasks_enabled: None,
            task_quick_add_shortcut: None,
        };

        apply_settings_patch(
            &mut settings,
            SettingsPatch {
                recent_note_ids: Some(Some(vec!["beta".to_string(), "alpha".to_string()])),
                show_pinned_notes: Some(Some(false)),
                show_recent_notes: Some(Some(false)),
                show_note_counts: Some(Some(false)),
                show_notes_from_subfolders: Some(Some(true)),
                default_note_name: Some(Some("Daily".to_string())),
                ollama_model: Some(None),
                note_list_date_mode: Some(NoteListDateMode::Off),
                show_note_list_filename: Some(Some(true)),
                show_note_list_folder_path: Some(Some(false)),
                show_note_list_preview: Some(Some(false)),
                note_list_preview_lines: Some(3),
                folder_note_sort_modes: Some(Some(HashMap::from([(
                    "daily".to_string(),
                    NoteSortMode::TitleDesc,
                )]))),
                task_quick_add_shortcut: Some(Some(" command-shift-n ".to_string())),
                ..SettingsPatch::default()
            },
        );

        assert_eq!(settings.default_note_name.as_deref(), Some("Daily"));
        assert_eq!(settings.ollama_model, None);
        assert_eq!(settings.git_enabled, Some(true));
        assert_eq!(
            settings.recent_note_ids,
            Some(vec!["beta".to_string(), "alpha".to_string()])
        );
        assert_eq!(settings.show_pinned_notes, Some(false));
        assert_eq!(settings.show_recent_notes, Some(false));
        assert!(!settings.show_note_counts);
        assert!(settings.show_notes_from_subfolders);
        assert_eq!(settings.note_list_date_mode, NoteListDateMode::Off);
        assert!(settings.show_note_list_filename);
        assert!(!settings.show_note_list_folder_path);
        assert!(!settings.show_note_list_preview);
        assert_eq!(settings.note_list_preview_lines, 3);
        assert_eq!(settings.note_sort_mode, NoteSortMode::TitleAsc);
        assert_eq!(
            settings.folder_note_sort_modes,
            Some(HashMap::from([(
                "daily".to_string(),
                NoteSortMode::TitleDesc,
            )]))
        );
        assert_eq!(
            settings.task_quick_add_shortcut.as_deref(),
            Some("command-shift-n")
        );
    }

    #[test]
    fn settings_default_matches_fresh_folder_defaults() {
        let settings = Settings::default();

        assert_eq!(
            settings.schema_version,
            persistence::workspace_settings::current_settings_schema_version()
        );
        assert_eq!(settings.git_enabled, None);
        assert_eq!(settings.pinned_note_ids, None);
        assert_eq!(settings.recent_note_ids, None);
        assert_eq!(settings.show_pinned_notes, None);
        assert_eq!(settings.show_recent_notes, None);
        assert!(settings.show_note_counts);
        assert!(!settings.show_notes_from_subfolders);
        assert_eq!(settings.default_note_name, None);
        assert_eq!(settings.ollama_model, None);
        assert_eq!(settings.folder_icons, None);
        assert_eq!(settings.collapsed_folders, None);
        assert_eq!(settings.note_list_date_mode, NoteListDateMode::Modified);
        assert!(settings.show_note_list_filename);
        assert!(!settings.show_note_list_folder_path);
        assert!(settings.show_note_list_preview);
        assert_eq!(
            settings.note_list_preview_lines,
            default_note_list_preview_lines()
        );
        assert_eq!(settings.note_sort_mode, NoteSortMode::ModifiedDesc);
        assert_eq!(settings.folder_note_sort_modes, None);
        assert_eq!(settings.folder_sort_mode, FolderSortMode::NameAsc);
        assert_eq!(settings.task_quick_add_shortcut, None);
    }

    #[test]
    fn deserialize_demo_workspace_settings_file() {
        let content = std::fs::read_to_string("../docs/demo-workspace/.sly/settings.json").unwrap();
        let settings: Settings = serde_json::from_str(&content).unwrap();

        assert_eq!(
            settings.schema_version,
            persistence::workspace_settings::current_settings_schema_version()
        );
        assert!(settings.show_note_counts);
        assert!(!settings.show_notes_from_subfolders);
        assert_eq!(settings.folder_sort_mode, FolderSortMode::NameAsc);
        assert_eq!(settings.pinned_note_ids.as_ref().map(Vec::len), Some(2));
        assert_eq!(settings.recent_note_ids.as_ref().map(Vec::len), Some(5));
        assert_eq!(settings.folder_icons.as_ref().map(HashMap::len), Some(8));
    }

    #[test]
    fn rewrite_folder_icon_paths_preserves_color_and_emoji_entries() {
        let mut folder_icons = HashMap::from([
            (
                "docs".to_string(),
                FolderAppearance {
                    icon: Some(FolderIconSpec::Lucide {
                        name: "folder-open".to_string(),
                    }),
                    color_id: Some(FolderColorId::Olive),
                },
            ),
            (
                "docs/ideas".to_string(),
                FolderAppearance {
                    icon: Some(FolderIconSpec::Emoji {
                        shortcode: "bulb".to_string(),
                    }),
                    color_id: Some(FolderColorId::Amber),
                },
            ),
        ]);

        rewrite_folder_icon_paths(&mut folder_icons, "docs", "work");

        assert_eq!(
            folder_icons.get("work"),
            Some(&FolderAppearance {
                icon: Some(FolderIconSpec::Lucide {
                    name: "folder-open".to_string(),
                }),
                color_id: Some(FolderColorId::Olive),
            })
        );
        assert_eq!(
            folder_icons.get("work/ideas"),
            Some(&FolderAppearance {
                icon: Some(FolderIconSpec::Emoji {
                    shortcode: "bulb".to_string(),
                }),
                color_id: Some(FolderColorId::Amber),
            })
        );
    }

    #[test]
    fn remove_folder_icon_paths_removes_folder_and_descendants() {
        let mut folder_icons = HashMap::from([
            (
                "docs".to_string(),
                FolderAppearance {
                    icon: Some(FolderIconSpec::Lucide {
                        name: "folder".to_string(),
                    }),
                    color_id: None,
                },
            ),
            (
                "docs/ideas".to_string(),
                FolderAppearance {
                    icon: Some(FolderIconSpec::Emoji {
                        shortcode: "book".to_string(),
                    }),
                    color_id: Some(FolderColorId::Blue),
                },
            ),
            (
                "journal".to_string(),
                FolderAppearance {
                    icon: Some(FolderIconSpec::Emoji {
                        shortcode: "memo".to_string(),
                    }),
                    color_id: None,
                },
            ),
        ]);

        remove_folder_icon_paths(&mut folder_icons, "docs");

        assert!(!folder_icons.contains_key("docs"));
        assert!(!folder_icons.contains_key("docs/ideas"));
        assert!(folder_icons.contains_key("journal"));
    }

    #[test]
    fn rewrite_folder_note_sort_mode_paths_updates_nested_paths() {
        let mut folder_note_sort_modes = HashMap::from([
            ("docs".to_string(), NoteSortMode::TitleAsc),
            ("docs/ideas".to_string(), NoteSortMode::CreatedDesc),
            ("journal".to_string(), NoteSortMode::ModifiedAsc),
        ]);

        rewrite_folder_note_sort_mode_paths(&mut folder_note_sort_modes, "docs", "work");

        assert_eq!(
            folder_note_sort_modes.get("work"),
            Some(&NoteSortMode::TitleAsc)
        );
        assert_eq!(
            folder_note_sort_modes.get("work/ideas"),
            Some(&NoteSortMode::CreatedDesc)
        );
        assert_eq!(
            folder_note_sort_modes.get("journal"),
            Some(&NoteSortMode::ModifiedAsc)
        );
    }

    #[test]
    fn remove_folder_note_sort_mode_paths_removes_folder_and_descendants() {
        let mut folder_note_sort_modes = HashMap::from([
            ("docs".to_string(), NoteSortMode::TitleAsc),
            ("docs/ideas".to_string(), NoteSortMode::CreatedDesc),
            ("journal".to_string(), NoteSortMode::ModifiedAsc),
        ]);

        remove_folder_note_sort_mode_paths(&mut folder_note_sort_modes, "docs");

        assert!(!folder_note_sort_modes.contains_key("docs"));
        assert!(!folder_note_sort_modes.contains_key("docs/ideas"));
        assert_eq!(
            folder_note_sort_modes.get("journal"),
            Some(&NoteSortMode::ModifiedAsc)
        );
    }

    #[test]
    fn fallback_search_scoring_prefers_title_matches() {
        let title_score = score_fallback_search_match("Alpha planning", "body text", "alpha");
        let body_score = score_fallback_search_match("Meeting notes", "alpha in body", "alpha");

        assert!(title_score > body_score);
        assert_eq!(body_score, 10.0);
    }

    #[test]
    fn build_note_move_results_keeps_no_ops_and_preserves_order() {
        let results = build_note_move_results(
            &[
                "alpha".to_string(),
                "work/beta".to_string(),
                "alpha".to_string(),
            ],
            "",
        )
        .unwrap();

        assert_eq!(
            results,
            vec![
                NoteMoveResult {
                    from: "alpha".to_string(),
                    to: "alpha".to_string(),
                },
                NoteMoveResult {
                    from: "work/beta".to_string(),
                    to: "beta".to_string(),
                },
            ]
        );
    }

    #[test]
    fn build_note_move_results_rejects_target_collisions_within_batch() {
        let error = build_note_move_results(
            &["docs/alpha".to_string(), "archive/alpha".to_string()],
            "work",
        )
        .unwrap_err();

        assert_eq!(
            error,
            "A note with that name already exists in the target folder"
        );
    }

    #[test]
    fn apply_note_move_results_updates_pinned_note_ids() {
        let mut pinned_note_ids = vec!["alpha".to_string(), "archive/beta".to_string()];
        let changed = apply_note_move_results_to_pinned_ids(
            &mut pinned_note_ids,
            &[
                NoteMoveResult {
                    from: "alpha".to_string(),
                    to: "work/alpha".to_string(),
                },
                NoteMoveResult {
                    from: "archive/beta".to_string(),
                    to: "archive/beta".to_string(),
                },
            ],
        );

        assert!(changed);
        assert_eq!(
            pinned_note_ids,
            vec!["work/alpha".to_string(), "archive/beta".to_string()]
        );
    }

    #[test]
    fn prune_deleted_pinned_note_ids_removes_all_deleted_entries() {
        let mut pinned_note_ids =
            vec!["alpha".to_string(), "beta".to_string(), "gamma".to_string()];
        let deleted_note_ids = HashSet::from(["alpha".to_string(), "gamma".to_string()]);

        let changed = prune_deleted_pinned_note_ids(&mut pinned_note_ids, &deleted_note_ids);

        assert!(changed);
        assert_eq!(pinned_note_ids, vec!["beta".to_string()]);
    }

    #[test]
    fn apply_note_move_results_updates_cache_entries() {
        let mut notes_cache = HashMap::from([
            ("alpha".to_string(), note("alpha", "Alpha", 10, 10)),
            (
                "archive/beta".to_string(),
                note("archive/beta", "Beta", 20, 20),
            ),
        ]);

        apply_note_move_results_to_cache(
            &mut notes_cache,
            &[
                NoteMoveResult {
                    from: "alpha".to_string(),
                    to: "work/alpha".to_string(),
                },
                NoteMoveResult {
                    from: "archive/beta".to_string(),
                    to: "archive/beta".to_string(),
                },
            ],
        );

        assert!(!notes_cache.contains_key("alpha"));
        assert_eq!(
            notes_cache
                .get("work/alpha")
                .map(|metadata| metadata.id.as_str()),
            Some("work/alpha")
        );
        assert!(notes_cache.contains_key("archive/beta"));
    }

    #[test]
    fn rebuild_notes_cache_incrementally_tracks_changed_added_and_deleted_notes() {
        let notes_root = temp_dir_path("notes-cache");
        std::fs::create_dir_all(notes_root.join("docs")).unwrap();

        let alpha_path = notes_root.join("alpha.md");
        let beta_path = notes_root.join("docs/beta.md");
        std::fs::write(&alpha_path, "# Alpha\nOriginal body").unwrap();
        std::fs::write(&beta_path, "# Beta\nBeta body").unwrap();

        let initial_cache = rebuild_notes_cache_incrementally(&notes_root, &HashMap::new());
        assert_eq!(initial_cache.len(), 2);
        assert_eq!(
            initial_cache.get("alpha").map(|note| note.preview.as_str()),
            Some("Original body")
        );

        std::thread::sleep(Duration::from_millis(1100));
        std::fs::write(&alpha_path, "# Alpha updated\nNew preview text").unwrap();
        std::fs::remove_file(&beta_path).unwrap();
        std::fs::write(notes_root.join("gamma.md"), "# Gamma\nGamma body").unwrap();

        let refreshed_cache = rebuild_notes_cache_incrementally(&notes_root, &initial_cache);

        assert_eq!(refreshed_cache.len(), 2);
        assert_eq!(
            refreshed_cache.get("alpha").map(|note| note.title.as_str()),
            Some("Alpha updated")
        );
        assert_eq!(
            refreshed_cache
                .get("alpha")
                .map(|note| note.preview.as_str()),
            Some("New preview text")
        );
        assert!(!refreshed_cache.contains_key("docs/beta"));
        assert_eq!(
            refreshed_cache.get("gamma").map(|note| note.title.as_str()),
            Some("Gamma")
        );

        let _ = std::fs::remove_dir_all(notes_root);
    }
}
