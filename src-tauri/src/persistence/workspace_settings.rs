use anyhow::Result;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::{
    default_note_list_preview_lines, normalize_task_quick_add_shortcut_value, FolderAppearance,
    FolderIconSpec, NoteSortMode, Settings, SettingsPatch,
};

const CURRENT_SETTINGS_SCHEMA_VERSION: u32 = 1;

pub(crate) fn current_settings_schema_version() -> u32 {
    CURRENT_SETTINGS_SCHEMA_VERSION
}

pub(crate) fn get_settings_path(notes_folder: &str) -> PathBuf {
    let sly_dir = PathBuf::from(notes_folder).join(".sly");
    std::fs::create_dir_all(&sly_dir).ok();
    sly_dir.join("settings.json")
}

pub(crate) fn load_settings(notes_folder: &str) -> Settings {
    let path = get_settings_path(notes_folder);
    load_settings_from_path(&path)
}

pub(crate) fn load_settings_from_path(path: &Path) -> Settings {
    let Some(content) = std::fs::read_to_string(path).ok() else {
        return Settings::default();
    };

    let Ok(original_value) = serde_json::from_str::<Value>(&content) else {
        return Settings::default();
    };

    let (canonical_value, migrated) = migrate_and_canonicalize_settings_value(original_value);
    let Ok(settings) = serde_json::from_value::<Settings>(canonical_value.clone()) else {
        return Settings::default();
    };

    if migrated {
        let _ = save_settings_to_path(path, &settings);
    }

    settings
}

pub(crate) fn save_settings(notes_folder: &str, settings: &Settings) -> Result<()> {
    let path = get_settings_path(notes_folder);
    save_settings_to_path(&path, settings)
}

pub(crate) fn save_settings_to_path(path: &Path, settings: &Settings) -> Result<()> {
    let mut canonical = settings.clone();
    canonicalize_settings(&mut canonical);
    let content = serde_json::to_string_pretty(&canonical)?;
    std::fs::write(path, content)?;
    Ok(())
}

pub(crate) fn apply_settings_patch(settings: &mut Settings, patch: SettingsPatch) {
    if let Some(git_enabled) = patch.git_enabled {
        settings.git_enabled = git_enabled;
    }
    if let Some(pinned_note_ids) = patch.pinned_note_ids {
        settings.pinned_note_ids = pinned_note_ids;
    }
    if let Some(recent_note_ids) = patch.recent_note_ids {
        settings.recent_note_ids = recent_note_ids;
    }
    if let Some(show_pinned_notes) = patch.show_pinned_notes {
        settings.show_pinned_notes = show_pinned_notes;
    }
    if let Some(show_recent_notes) = patch.show_recent_notes {
        settings.show_recent_notes = show_recent_notes;
    }
    if let Some(show_note_counts) = patch.show_note_counts {
        settings.show_note_counts = show_note_counts.unwrap_or(true);
    }
    if let Some(show_notes_from_subfolders) = patch.show_notes_from_subfolders {
        settings.show_notes_from_subfolders = show_notes_from_subfolders.unwrap_or(false);
    }
    if let Some(default_note_name) = patch.default_note_name {
        settings.default_note_name = default_note_name;
    }
    if let Some(ollama_model) = patch.ollama_model {
        settings.ollama_model = ollama_model;
    }
    if let Some(folder_icons) = patch.folder_icons {
        settings.folder_icons = folder_icons;
    }
    if let Some(collapsed_folders) = patch.collapsed_folders {
        settings.collapsed_folders = collapsed_folders;
    }
    if let Some(note_list_date_mode) = patch.note_list_date_mode {
        settings.note_list_date_mode = note_list_date_mode;
    }
    if let Some(show_note_list_filename) = patch.show_note_list_filename {
        settings.show_note_list_filename = show_note_list_filename.unwrap_or(true);
    }
    if let Some(show_note_list_folder_path) = patch.show_note_list_folder_path {
        settings.show_note_list_folder_path = show_note_list_folder_path.unwrap_or(false);
    }
    if let Some(show_note_list_preview) = patch.show_note_list_preview {
        settings.show_note_list_preview = show_note_list_preview.unwrap_or(true);
    }
    if let Some(note_list_preview_lines) = patch.note_list_preview_lines {
        settings.note_list_preview_lines = note_list_preview_lines.clamp(1, 3);
    }
    if let Some(note_sort_mode) = patch.note_sort_mode {
        settings.note_sort_mode = note_sort_mode;
    }
    if let Some(folder_note_sort_modes) = patch.folder_note_sort_modes {
        settings.folder_note_sort_modes = folder_note_sort_modes;
    }
    if let Some(folder_sort_mode) = patch.folder_sort_mode {
        settings.folder_sort_mode = folder_sort_mode;
    }
    if let Some(tasks_enabled) = patch.tasks_enabled {
        settings.tasks_enabled = tasks_enabled;
    }
    if let Some(task_quick_add_shortcut) = patch.task_quick_add_shortcut {
        settings.task_quick_add_shortcut = task_quick_add_shortcut;
    }
    canonicalize_settings(settings);
}

pub(crate) fn canonicalize_settings(settings: &mut Settings) -> bool {
    let mut changed = false;

    if settings.schema_version != CURRENT_SETTINGS_SCHEMA_VERSION {
        settings.schema_version = CURRENT_SETTINGS_SCHEMA_VERSION;
        changed = true;
    }

    changed |= canonicalize_optional_string_list(&mut settings.pinned_note_ids);
    changed |= canonicalize_optional_string_list(&mut settings.recent_note_ids);
    changed |= canonicalize_optional_string_list(&mut settings.collapsed_folders);

    if let Some(folder_icons) = settings.folder_icons.take() {
        let normalized_folder_icons = sanitize_folder_icons_map(folder_icons);
        if normalized_folder_icons.is_empty() {
            settings.folder_icons = None;
            changed = true;
        } else {
            if settings.folder_icons.as_ref() != Some(&normalized_folder_icons) {
                changed = true;
            }
            settings.folder_icons = Some(normalized_folder_icons);
        }
    }

    if let Some(folder_note_sort_modes) = settings.folder_note_sort_modes.take() {
        let normalized_folder_note_sort_modes =
            sanitize_folder_note_sort_modes_map(folder_note_sort_modes);
        if normalized_folder_note_sort_modes.is_empty() {
            settings.folder_note_sort_modes = None;
            changed = true;
        } else {
            if settings.folder_note_sort_modes.as_ref() != Some(&normalized_folder_note_sort_modes)
            {
                changed = true;
            }
            settings.folder_note_sort_modes = Some(normalized_folder_note_sort_modes);
        }
    }

    let note_list_preview_lines = settings.note_list_preview_lines.clamp(1, 3);
    if note_list_preview_lines != settings.note_list_preview_lines {
        settings.note_list_preview_lines = note_list_preview_lines;
        changed = true;
    }

    if let Some(default_note_name) = &settings.default_note_name {
        let trimmed = default_note_name.trim();
        if trimmed.is_empty() {
            settings.default_note_name = None;
            changed = true;
        } else if trimmed != default_note_name {
            settings.default_note_name = Some(trimmed.to_string());
            changed = true;
        }
    }

    if let Some(ollama_model) = &settings.ollama_model {
        let trimmed = ollama_model.trim();
        if trimmed.is_empty() {
            settings.ollama_model = None;
            changed = true;
        } else if trimmed != ollama_model {
            settings.ollama_model = Some(trimmed.to_string());
            changed = true;
        }
    }

    if settings.tasks_enabled.is_none() {
        settings.tasks_enabled = Some(true);
        changed = true;
    }

    if let Some(task_quick_add_shortcut) = settings.task_quick_add_shortcut.take() {
        match normalize_task_quick_add_shortcut_value(&task_quick_add_shortcut) {
            Some(normalized) => {
                if normalized != task_quick_add_shortcut {
                    changed = true;
                }
                settings.task_quick_add_shortcut = Some(normalized);
            }
            None => {
                changed = true;
            }
        }
    }

    changed
}

fn migrate_and_canonicalize_settings_value(original_value: Value) -> (Value, bool) {
    let mut migrated = false;
    let mut value = ensure_object_value(original_value);
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;

    if version == 0 {
        value = migrate_settings_v0_to_v1(value);
        migrated = true;
    } else {
        canonicalize_settings_value(&mut value);
    }

    let mut settings = serde_json::from_value::<Settings>(value.clone()).unwrap_or_default();
    if canonicalize_settings(&mut settings) {
        migrated = true;
    }
    let canonical_value =
        serde_json::to_value(&settings).unwrap_or_else(|_| Value::Object(Map::new()));

    if canonical_value != value {
        migrated = true;
    }

    (canonical_value, migrated)
}

fn migrate_settings_v0_to_v1(mut value: Value) -> Value {
    canonicalize_settings_value(&mut value);

    let mut settings = serde_json::from_value::<Settings>(value).unwrap_or_default();
    settings.schema_version = CURRENT_SETTINGS_SCHEMA_VERSION;
    let _ = canonicalize_settings(&mut settings);

    serde_json::to_value(settings).unwrap_or_else(|_| Value::Object(Map::new()))
}

fn canonicalize_settings_value(value: &mut Value) {
    let object = ensure_object(value);
    object.insert(
        "schemaVersion".to_string(),
        Value::from(CURRENT_SETTINGS_SCHEMA_VERSION),
    );

    normalize_optional_bool_field(object, "gitEnabled");
    normalize_optional_string_array_field(object, "pinnedNoteIds");
    normalize_optional_string_array_field(object, "recentNoteIds");
    normalize_optional_bool_field(object, "showPinnedNotes");
    normalize_optional_bool_field(object, "showRecentNotes");
    normalize_bool_field(object, "showNoteCounts");
    normalize_bool_field(object, "showNotesFromSubfolders");
    normalize_optional_string_field(object, "defaultNoteName");
    normalize_optional_string_field(object, "ollamaModel");
    normalize_folder_icons_field(object, "folderIcons");
    normalize_optional_string_array_field(object, "collapsedFolders");
    normalize_string_enum_field(object, "noteListDateMode", &["modified", "created", "off"]);
    normalize_bool_field(object, "showNoteListFilename");
    normalize_bool_field(object, "showNoteListFolderPath");
    normalize_bool_field(object, "showNoteListPreview");
    normalize_preview_lines_field(object, "noteListPreviewLines");
    normalize_string_enum_field(
        object,
        "noteSortMode",
        &[
            "modifiedDesc",
            "modifiedAsc",
            "createdDesc",
            "createdAsc",
            "titleAsc",
            "titleDesc",
        ],
    );
    normalize_folder_note_sort_modes_field(object, "folderNoteSortModes");
    normalize_string_enum_field(object, "folderSortMode", &["nameAsc", "nameDesc"]);
    normalize_optional_bool_field(object, "tasksEnabled");
    normalize_optional_string_field(object, "taskQuickAddShortcut");
}

fn ensure_object_value(value: Value) -> Value {
    match value {
        Value::Object(_) => value,
        _ => Value::Object(Map::new()),
    }
}

fn ensure_object(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }

    value.as_object_mut().expect("value object")
}

fn normalize_optional_bool_field(object: &mut Map<String, Value>, key: &str) {
    let should_remove = match object.get(key) {
        Some(Value::Bool(_)) | Some(Value::Null) | None => false,
        Some(_) => true,
    };

    if should_remove {
        object.remove(key);
    }
}

fn normalize_bool_field(object: &mut Map<String, Value>, key: &str) {
    let should_remove = match object.get(key) {
        Some(Value::Bool(_)) | None => false,
        Some(_) => true,
    };

    if should_remove {
        object.remove(key);
    }
}

fn normalize_optional_string_field(object: &mut Map<String, Value>, key: &str) {
    let should_remove = match object.get(key) {
        Some(Value::String(_)) | Some(Value::Null) | None => false,
        Some(_) => true,
    };

    if should_remove {
        object.remove(key);
    }
}

fn normalize_optional_string_array_field(object: &mut Map<String, Value>, key: &str) {
    let Some(value) = object.get_mut(key) else {
        return;
    };

    match value {
        Value::Null => {}
        Value::Array(entries) => {
            entries.retain(|entry| entry.as_str().is_some());
        }
        _ => {
            object.remove(key);
        }
    }
}

fn normalize_preview_lines_field(object: &mut Map<String, Value>, key: &str) {
    let replacement = match object.get(key) {
        Some(Value::Number(number)) => number
            .as_u64()
            .map(|value| Value::from(value.clamp(1, 3)))
            .or(Some(Value::from(default_note_list_preview_lines()))),
        Some(_) => Some(Value::from(default_note_list_preview_lines())),
        None => None,
    };

    if let Some(value) = replacement {
        object.insert(key.to_string(), value);
    }
}

fn normalize_string_enum_field(object: &mut Map<String, Value>, key: &str, allowed: &[&str]) {
    let should_remove = match object.get(key) {
        Some(Value::String(value)) => !allowed.contains(&value.as_str()),
        Some(_) => true,
        None => false,
    };

    if should_remove {
        object.remove(key);
    }
}

fn normalize_folder_icons_field(object: &mut Map<String, Value>, key: &str) {
    let Some(value) = object.get_mut(key) else {
        return;
    };

    match value {
        Value::Null => {}
        Value::Object(entries) => {
            entries.retain(|path, folder_appearance| {
                if path.trim().is_empty() || !folder_appearance.is_object() {
                    return false;
                }

                let folder_appearance = ensure_object(folder_appearance);
                match folder_appearance.get_mut("icon") {
                    Some(Value::Null) | None => {}
                    Some(icon) if icon.is_object() => {
                        let icon_object = ensure_object(icon);
                        let valid_kind = icon_object
                            .get("kind")
                            .and_then(Value::as_str)
                            .map(|kind| kind == "lucide" || kind == "emoji")
                            .unwrap_or(false);
                        let has_name = icon_object
                            .get("name")
                            .and_then(Value::as_str)
                            .map(|name| !name.trim().is_empty())
                            .unwrap_or(false);
                        let has_shortcode = icon_object
                            .get("shortcode")
                            .and_then(Value::as_str)
                            .map(|shortcode| !shortcode.trim().is_empty())
                            .unwrap_or(false);

                        if !valid_kind
                            || (!has_name && !has_shortcode)
                            || (icon_object.get("kind").and_then(Value::as_str) == Some("lucide")
                                && !has_name)
                            || (icon_object.get("kind").and_then(Value::as_str) == Some("emoji")
                                && !has_shortcode)
                        {
                            return false;
                        }
                    }
                    Some(_) => return false,
                }

                match folder_appearance.get("colorId") {
                    Some(Value::String(color_id))
                        if matches!(
                            color_id.as_str(),
                            "slate"
                                | "blue"
                                | "teal"
                                | "green"
                                | "olive"
                                | "amber"
                                | "orange"
                                | "red"
                                | "plum"
                        ) => {}
                    Some(Value::Null) | None => {}
                    Some(_) => return false,
                }

                true
            });
        }
        _ => {
            object.remove(key);
        }
    }
}

fn normalize_folder_note_sort_modes_field(object: &mut Map<String, Value>, key: &str) {
    let Some(value) = object.get_mut(key) else {
        return;
    };

    match value {
        Value::Null => {}
        Value::Object(entries) => {
            entries.retain(|path, note_sort_mode| {
                !path.trim().is_empty()
                    && note_sort_mode
                        .as_str()
                        .map(|mode| {
                            matches!(
                                mode,
                                "modifiedDesc"
                                    | "modifiedAsc"
                                    | "createdDesc"
                                    | "createdAsc"
                                    | "titleAsc"
                                    | "titleDesc"
                            )
                        })
                        .unwrap_or(false)
            });
        }
        _ => {
            object.remove(key);
        }
    }
}

fn canonicalize_optional_string_list(values: &mut Option<Vec<String>>) -> bool {
    let Some(current_values) = values.clone() else {
        return false;
    };

    let normalized_values = current_values
        .into_iter()
        .filter_map(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        })
        .collect::<Vec<_>>();

    if normalized_values.is_empty() {
        *values = None;
        true
    } else {
        let changed = values.as_ref() != Some(&normalized_values);
        *values = Some(normalized_values);
        changed
    }
}

fn sanitize_folder_icon_spec(icon: FolderIconSpec) -> Option<FolderIconSpec> {
    match icon {
        FolderIconSpec::Lucide { name } => {
            let normalized = name.trim();
            if normalized.is_empty() {
                None
            } else {
                Some(FolderIconSpec::Lucide {
                    name: normalized.to_string(),
                })
            }
        }
        FolderIconSpec::Emoji { shortcode } => {
            let normalized = shortcode.trim();
            if normalized.is_empty() {
                None
            } else {
                Some(FolderIconSpec::Emoji {
                    shortcode: normalized.to_string(),
                })
            }
        }
    }
}

fn sanitize_folder_appearance(folder_appearance: FolderAppearance) -> Option<FolderAppearance> {
    let icon = folder_appearance.icon.and_then(sanitize_folder_icon_spec);
    let color_id = folder_appearance.color_id;

    if icon.is_none() && color_id.is_none() {
        return None;
    }

    Some(FolderAppearance { icon, color_id })
}

fn sanitize_folder_icons_map(
    folder_icons: HashMap<String, FolderAppearance>,
) -> HashMap<String, FolderAppearance> {
    folder_icons
        .into_iter()
        .filter_map(|(path, folder_appearance)| {
            let normalized_path = path.trim().to_string();
            if normalized_path.is_empty() {
                return None;
            }

            sanitize_folder_appearance(folder_appearance)
                .map(|normalized_appearance| (normalized_path, normalized_appearance))
        })
        .collect()
}

fn sanitize_folder_note_sort_modes_map(
    folder_note_sort_modes: HashMap<String, NoteSortMode>,
) -> HashMap<String, NoteSortMode> {
    folder_note_sort_modes
        .into_iter()
        .filter_map(|(path, note_sort_mode)| {
            let normalized_path = path.trim().to_string();
            if normalized_path.is_empty() {
                None
            } else {
                Some((normalized_path, note_sort_mode))
            }
        })
        .collect()
}
