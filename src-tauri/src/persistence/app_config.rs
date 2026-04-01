use anyhow::Result;
use serde_json::{Map, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

use crate::{
    default_code_font, default_editor_width, default_note_base_font_size, default_note_font,
    default_note_line_height, default_right_panel_tab, default_theme_mode, default_ui_font,
    AppConfig, AppearanceSettings, FontChoice, NoteTypographySettings,
};

const CURRENT_APP_CONFIG_SCHEMA_VERSION: u32 = 1;

pub(crate) fn current_app_config_schema_version() -> u32 {
    CURRENT_APP_CONFIG_SCHEMA_VERSION
}

pub(crate) fn get_app_config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let app_data = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data)?;
    Ok(app_data.join("config.json"))
}

pub(crate) fn load_app_config<R: Runtime>(app: &AppHandle<R>) -> AppConfig {
    let path = match get_app_config_path(app) {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };

    load_app_config_from_path(&path)
}

pub(crate) fn load_app_config_from_path(path: &std::path::Path) -> AppConfig {
    let Some(content) = std::fs::read_to_string(path).ok() else {
        return AppConfig::default();
    };

    let Ok(original_value) = serde_json::from_str::<Value>(&content) else {
        return AppConfig::default();
    };

    let (canonical_value, migrated) = migrate_and_canonicalize_app_config_value(original_value);
    let Ok(config) = serde_json::from_value::<AppConfig>(canonical_value.clone()) else {
        return AppConfig::default();
    };

    if migrated {
        let _ = save_app_config_to_path(path, &config);
    }

    config
}

pub(crate) fn save_app_config<R: Runtime>(app: &AppHandle<R>, config: &AppConfig) -> Result<()> {
    let path = get_app_config_path(app)?;
    save_app_config_to_path(&path, config)
}

pub(crate) fn save_app_config_to_path(path: &std::path::Path, config: &AppConfig) -> Result<()> {
    let mut canonical = config.clone();
    canonicalize_app_config(&mut canonical);
    let content = serde_json::to_string_pretty(&canonical)?;
    std::fs::write(path, content)?;
    Ok(())
}

pub(crate) fn migrate_appearance_defaults(appearance: &mut AppearanceSettings) -> bool {
    let mut changed = false;

    if font_choice_is_preset(&appearance.ui_font, "system-sans") {
        appearance.ui_font = default_ui_font();
        changed = true;
    }

    if font_choice_is_preset(&appearance.note_font, "system-sans") {
        appearance.note_font = default_note_font();
        changed = true;
    }

    if font_choice_is_preset(&appearance.code_font, "system-mono") {
        appearance.code_font = default_code_font();
        changed = true;
    }

    if float_matches(appearance.note_typography.base_font_size, 15.0) {
        appearance.note_typography.base_font_size = default_note_base_font_size();
        changed = true;
    }

    if float_matches(appearance.note_typography.line_height, 1.6) {
        appearance.note_typography.line_height = default_note_line_height();
        changed = true;
    }

    changed
}

pub(crate) fn canonicalize_app_config(config: &mut AppConfig) -> bool {
    let mut changed = false;

    if config.schema_version != CURRENT_APP_CONFIG_SCHEMA_VERSION {
        config.schema_version = CURRENT_APP_CONFIG_SCHEMA_VERSION;
        changed = true;
    }

    if let Some(notes_folder) = &config.notes_folder {
        let trimmed = notes_folder.trim();
        if trimmed.is_empty() {
            config.notes_folder = None;
            changed = true;
        } else if trimmed != notes_folder {
            config.notes_folder = Some(trimmed.to_string());
            changed = true;
        }
    }

    changed |= canonicalize_appearance_settings(&mut config.appearance);
    changed
}

#[cfg(test)]
pub(crate) fn old_default_appearance() -> AppearanceSettings {
    AppearanceSettings {
        mode: crate::default_theme_mode(),
        light_preset_id: crate::default_light_preset_id(),
        dark_preset_id: crate::default_dark_preset_id(),
        ui_font: FontChoice::preset("system-sans"),
        note_font: FontChoice::preset("system-sans"),
        code_font: FontChoice::preset("system-mono"),
        note_typography: NoteTypographySettings {
            base_font_size: 15.0,
            bold_weight: crate::default_note_bold_weight(),
            line_height: 1.6,
        },
        text_direction: crate::TextDirection::default(),
        editor_width: crate::default_editor_width(),
        custom_editor_width_px: None,
        interface_zoom: crate::default_interface_zoom(),
        pane_mode: crate::default_pane_mode(),
        folders_pane_width: crate::default_folders_pane_width(),
        notes_pane_width: crate::default_notes_pane_width(),
        right_panel_visible: crate::default_true(),
        right_panel_width: crate::default_right_panel_width(),
        right_panel_tab: crate::default_right_panel_tab(),
        custom_light_colors: None,
        custom_dark_colors: None,
        confirm_deletions: crate::default_true(),
    }
}

fn migrate_and_canonicalize_app_config_value(original_value: Value) -> (Value, bool) {
    let mut migrated = false;
    let mut value = ensure_object_value(original_value);
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32;

    if version == 0 {
        value = migrate_app_config_v0_to_v1(value);
        migrated = true;
    } else {
        canonicalize_app_config_value(&mut value);
    }

    let mut config = serde_json::from_value::<AppConfig>(value.clone()).unwrap_or_default();
    if canonicalize_app_config(&mut config) {
        migrated = true;
    }
    let canonical_value =
        serde_json::to_value(&config).unwrap_or_else(|_| Value::Object(Map::new()));

    if canonical_value != value {
        migrated = true;
    }

    (canonical_value, migrated)
}

fn migrate_app_config_v0_to_v1(mut value: Value) -> Value {
    canonicalize_app_config_value(&mut value);

    let mut config = serde_json::from_value::<AppConfig>(value).unwrap_or_default();
    config.schema_version = CURRENT_APP_CONFIG_SCHEMA_VERSION;
    let _ = migrate_appearance_defaults(&mut config.appearance);
    let _ = canonicalize_app_config(&mut config);

    serde_json::to_value(config).unwrap_or_else(|_| Value::Object(Map::new()))
}

fn canonicalize_app_config_value(value: &mut Value) {
    let object = ensure_object(value);
    object.insert(
        "schemaVersion".to_string(),
        Value::from(CURRENT_APP_CONFIG_SCHEMA_VERSION),
    );

    normalize_optional_string_field(object, "notes_folder");
    normalize_appearance_value(object);
}

fn normalize_appearance_value(root: &mut Map<String, Value>) {
    let appearance = root
        .entry("appearance".to_string())
        .or_insert_with(|| serde_json::to_value(AppearanceSettings::default()).unwrap());

    if !appearance.is_object() {
        *appearance = serde_json::to_value(AppearanceSettings::default()).unwrap();
    }

    let appearance = ensure_object(appearance);
    normalize_string_enum_field(
        appearance,
        "mode",
        &["light", "dark", "system"],
        Some(default_theme_mode()),
    );
    normalize_font_choice_field(appearance, "uiFont");
    normalize_font_choice_field(appearance, "noteFont");
    normalize_font_choice_field(appearance, "codeFont");
    normalize_note_typography_value(appearance);
    normalize_string_enum_field(appearance, "textDirection", &["auto", "ltr", "rtl"], None);
    normalize_string_enum_field(
        appearance,
        "editorWidth",
        &["narrow", "normal", "wide", "full", "custom"],
        Some(default_editor_width()),
    );
    normalize_u32_field(appearance, "customEditorWidthPx");
    normalize_f32_field(appearance, "interfaceZoom");
    normalize_i32_field(appearance, "paneMode");
    normalize_u32_field(appearance, "foldersPaneWidth");
    normalize_u32_field(appearance, "notesPaneWidth");
    normalize_bool_field(appearance, "rightPanelVisible");
    normalize_u32_field(appearance, "rightPanelWidth");
    normalize_string_enum_field(
        appearance,
        "rightPanelTab",
        &["outline", "assistant"],
        Some(default_right_panel_tab()),
    );
    normalize_bool_field(appearance, "confirmDeletions");
}

fn normalize_note_typography_value(appearance: &mut Map<String, Value>) {
    let note_typography = appearance
        .entry("noteTypography".to_string())
        .or_insert_with(|| serde_json::to_value(NoteTypographySettings::default()).unwrap());

    if !note_typography.is_object() {
        *note_typography = serde_json::to_value(NoteTypographySettings::default()).unwrap();
    }

    let note_typography = ensure_object(note_typography);
    normalize_f32_field(note_typography, "baseFontSize");
    normalize_i32_field(note_typography, "boldWeight");
    normalize_f32_field(note_typography, "lineHeight");
}

fn canonicalize_appearance_settings(appearance: &mut AppearanceSettings) -> bool {
    let mut changed = false;

    changed |= migrate_appearance_defaults(appearance);
    changed |= normalize_mode(
        &mut appearance.mode,
        &["light", "dark", "system"],
        default_theme_mode(),
    );
    changed |= normalize_font_choice(&mut appearance.ui_font, default_ui_font());
    changed |= normalize_font_choice(&mut appearance.note_font, default_note_font());
    changed |= normalize_font_choice(&mut appearance.code_font, default_code_font());
    changed |= normalize_mode(
        &mut appearance.editor_width,
        &["narrow", "normal", "wide", "full", "custom"],
        default_editor_width(),
    );

    if !float_matches(
        appearance.interface_zoom,
        clamp_zoom(appearance.interface_zoom),
    ) {
        appearance.interface_zoom = clamp_zoom(appearance.interface_zoom);
        changed = true;
    }

    let pane_mode = appearance.pane_mode.clamp(1, 3);
    if pane_mode != appearance.pane_mode {
        appearance.pane_mode = pane_mode;
        changed = true;
    }

    if let Some(px) = appearance.custom_editor_width_px {
        let normalized = px.clamp(480, 3840);
        if normalized != px {
            appearance.custom_editor_width_px = Some(normalized);
            changed = true;
        }
    }

    let folders_width = appearance.folders_pane_width.clamp(140, 480);
    if folders_width != appearance.folders_pane_width {
        appearance.folders_pane_width = folders_width;
        changed = true;
    }

    let notes_width = appearance.notes_pane_width.clamp(180, 560);
    if notes_width != appearance.notes_pane_width {
        appearance.notes_pane_width = notes_width;
        changed = true;
    }

    let right_panel_width = appearance.right_panel_width.clamp(200, 420);
    if right_panel_width != appearance.right_panel_width {
        appearance.right_panel_width = right_panel_width;
        changed = true;
    }

    changed |= normalize_mode(
        &mut appearance.right_panel_tab,
        &["outline", "assistant"],
        default_right_panel_tab(),
    );

    changed
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

fn normalize_optional_string_field(object: &mut Map<String, Value>, key: &str) {
    let should_remove = match object.get(key) {
        Some(Value::String(_)) | Some(Value::Null) | None => false,
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

fn normalize_f32_field(object: &mut Map<String, Value>, key: &str) {
    let should_remove = match object.get(key) {
        Some(Value::Number(number)) => number.as_f64().is_none(),
        Some(_) => true,
        None => false,
    };

    if should_remove {
        object.remove(key);
    }
}

fn normalize_i32_field(object: &mut Map<String, Value>, key: &str) {
    let should_remove = match object.get(key) {
        Some(Value::Number(number)) => number.as_i64().is_none(),
        Some(_) => true,
        None => false,
    };

    if should_remove {
        object.remove(key);
    }
}

fn normalize_u32_field(object: &mut Map<String, Value>, key: &str) {
    let should_remove = match object.get(key) {
        Some(Value::Number(number)) => number.as_u64().is_none(),
        Some(_) => true,
        None => false,
    };

    if should_remove {
        object.remove(key);
    }
}

fn normalize_string_enum_field(
    object: &mut Map<String, Value>,
    key: &str,
    allowed: &[&str],
    fallback: Option<String>,
) {
    let replacement = match object.get(key) {
        Some(Value::String(value)) if allowed.contains(&value.as_str()) => None,
        Some(_) => fallback.map(Value::String),
        None => None,
    };

    match replacement {
        Some(value) => {
            object.insert(key.to_string(), value);
        }
        None => {
            let should_remove = matches!(object.get(key), Some(value) if !value.is_string());
            if should_remove {
                object.remove(key);
            }
        }
    }
}

fn normalize_font_choice_field(object: &mut Map<String, Value>, key: &str) {
    let Some(value) = object.get_mut(key) else {
        return;
    };

    if !value.is_object() {
        object.remove(key);
        return;
    }

    let choice = ensure_object(value);
    let kind_is_valid = choice
        .get("kind")
        .and_then(Value::as_str)
        .map(|kind| kind == "preset" || kind == "custom")
        .unwrap_or(false);
    let value_is_valid = choice
        .get("value")
        .and_then(Value::as_str)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    if !kind_is_valid || !value_is_valid {
        object.remove(key);
    }
}

fn normalize_font_choice(choice: &mut FontChoice, default_choice: FontChoice) -> bool {
    let trimmed = choice.value.trim().to_string();
    let valid_kind = choice.kind == "preset" || choice.kind == "custom";

    if !valid_kind || trimmed.is_empty() {
        *choice = default_choice;
        return true;
    }

    if trimmed != choice.value {
        choice.value = trimmed;
        return true;
    }

    false
}

fn normalize_mode(value: &mut String, allowed: &[&str], default_value: String) -> bool {
    if allowed.contains(&value.as_str()) {
        false
    } else {
        *value = default_value;
        true
    }
}

fn font_choice_is_preset(choice: &FontChoice, preset: &str) -> bool {
    choice.kind == "preset" && choice.value == preset
}

fn float_matches(value: f32, expected: f32) -> bool {
    (value - expected).abs() < 0.0001
}

fn clamp_zoom(zoom: f32) -> f32 {
    (zoom.clamp(0.7, 1.5) * 20.0).round() / 20.0
}
