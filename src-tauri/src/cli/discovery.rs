use std::path::{Path, PathBuf};

use crate::persistence::app_config::{default_app_config_path_for_cli, load_app_config_from_path};
use crate::persistence::workspace_settings::{load_settings, save_settings};
use crate::tasks::{self, tasks_db_path};
use crate::{AppConfig, Settings};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NotesFolderSource {
    CliFlag,
    AppConfig,
    None,
}

impl NotesFolderSource {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::CliFlag => "cli flag",
            Self::AppConfig => "app config",
            Self::None => "none",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct CliRuntime {
    pub(crate) app_config_path: Option<PathBuf>,
    pub(crate) today: String,
}

impl Default for CliRuntime {
    fn default() -> Self {
        Self {
            app_config_path: default_app_config_path_for_cli(),
            today: chrono::Local::now().format("%Y-%m-%d").to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct ResolvedVault {
    pub(crate) notes_folder: PathBuf,
    pub(crate) settings: Settings,
}

#[derive(Debug, Clone)]
pub(crate) struct DoctorContext {
    pub(crate) notes_folder: Option<PathBuf>,
    pub(crate) notes_folder_source: NotesFolderSource,
}

pub(crate) fn load_cli_app_config(runtime: &CliRuntime) -> AppConfig {
    runtime
        .app_config_path
        .as_deref()
        .map(load_app_config_from_path)
        .unwrap_or_default()
}

pub(crate) fn resolve_notes_folder(
    cli_notes_folder: Option<&Path>,
    runtime: &CliRuntime,
    allow_create: bool,
    require_write: bool,
) -> Result<ResolvedVault, String> {
    let doctor = build_doctor_context(cli_notes_folder, runtime);
    let Some(notes_folder) = doctor.notes_folder else {
        return Err(
            "Notes folder not set. Pass `--notes-folder PATH` or run `sly .` first.".to_string(),
        );
    };

    prepare_notes_folder(&notes_folder, allow_create, require_write)?;
    let notes_folder_str = notes_folder.to_string_lossy().into_owned();
    let settings = load_settings(&notes_folder_str);

    Ok(ResolvedVault {
        notes_folder,
        settings,
    })
}

pub(crate) fn build_doctor_context(
    cli_notes_folder: Option<&Path>,
    runtime: &CliRuntime,
) -> DoctorContext {
    let app_config = load_cli_app_config(runtime);
    if let Some(cli_path) = cli_notes_folder {
        return DoctorContext {
            notes_folder: Some(cli_path.to_path_buf()),
            notes_folder_source: NotesFolderSource::CliFlag,
        };
    }

    let notes_folder = app_config.notes_folder.as_ref().map(PathBuf::from);
    let notes_folder_source = if notes_folder.is_some() {
        NotesFolderSource::AppConfig
    } else {
        NotesFolderSource::None
    };

    DoctorContext {
        notes_folder,
        notes_folder_source,
    }
}

pub(crate) fn tasks_db_info(notes_folder: &Path) -> (PathBuf, bool, bool, Option<usize>) {
    let db_path = tasks_db_path(notes_folder);
    let db_exists = db_path.exists();
    match tasks::task_count_if_db_exists(notes_folder) {
        Ok(task_count) => (db_path, db_exists, task_count.is_some(), task_count),
        Err(_) => (db_path, db_exists, false, None),
    }
}

pub(crate) fn persist_tasks_enabled(
    notes_folder: &Path,
    settings: &mut Settings,
) -> Result<(), String> {
    if settings.tasks_enabled == Some(true) {
        return Ok(());
    }

    settings.tasks_enabled = Some(true);
    save_settings(&notes_folder.to_string_lossy(), settings).map_err(|error| error.to_string())
}

fn prepare_notes_folder(
    path: &Path,
    allow_create: bool,
    require_write: bool,
) -> Result<(), String> {
    if path.exists() {
        if !path.is_dir() {
            return Err(format!(
                "Notes folder is not a directory: {}",
                path.display()
            ));
        }
    } else if allow_create {
        std::fs::create_dir_all(path).map_err(|error| {
            format!("Failed to create notes folder {}: {error}", path.display())
        })?;
    } else {
        return Err(format!(
            "Notes folder does not exist: {}. Pass `--notes-folder PATH` or run `sly .` first.",
            path.display()
        ));
    }

    let assets_dir = path.join("assets");
    let sly_dir = path.join(".sly");

    std::fs::create_dir_all(&assets_dir).map_err(|error| {
        format!(
            "Failed to create assets directory {}: {error}",
            assets_dir.display()
        )
    })?;
    std::fs::create_dir_all(&sly_dir).map_err(|error| {
        format!(
            "Failed to create config directory {}: {error}",
            sly_dir.display()
        )
    })?;

    if require_write {
        let test_path = sly_dir.join(".write-test");
        std::fs::write(&test_path, b"ok")
            .map_err(|error| format!("Notes folder is not writable: {error}"))?;
        let _ = std::fs::remove_file(test_path);
    }

    Ok(())
}
