use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const TASKS_DB_SCHEMA_VERSION: i32 = 1;

// Public types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMetadata {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub action_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub created_at: String,
    pub action_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub action_at: Option<Option<String>>,
}

#[derive(Debug)]
struct TaskRow {
    id: String,
    title: String,
    description: String,
    created_at: String,
    action_at: Option<String>,
    completed_at: Option<String>,
}

impl From<TaskRow> for Task {
    fn from(row: TaskRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            description: row.description,
            created_at: row.created_at,
            action_at: row.action_at,
            completed_at: row.completed_at,
        }
    }
}

impl From<TaskRow> for TaskMetadata {
    fn from(row: TaskRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            created_at: row.created_at,
            action_at: row.action_at,
            completed_at: row.completed_at,
        }
    }
}

// Path helpers

pub(crate) fn tasks_db_path(notes_root: &Path) -> PathBuf {
    notes_root.join(".sly").join("tasks.db")
}

fn open_tasks_db(notes_root: &Path) -> Result<Connection> {
    let db_path = tasks_db_path(notes_root);
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "busy_timeout", 5_000)?;
    initialize_schema(&conn)?;
    Ok(conn)
}

fn initialize_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            action_at TEXT NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
            ON tasks (completed_at);

        CREATE INDEX IF NOT EXISTS idx_tasks_action_at
            ON tasks (action_at);
        ",
    )?;
    conn.pragma_update(None, "user_version", TASKS_DB_SCHEMA_VERSION)?;
    Ok(())
}

// Normalization helpers

fn now_rfc3339() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn new_task_id() -> String {
    Uuid::now_v7().to_string()
}

fn normalize_action_at(value: Option<String>) -> Result<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };

    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let parsed = DateTime::parse_from_rfc3339(trimmed)
        .map_err(|error| anyhow!("Invalid actionAt timestamp: {error}"))?;
    Ok(Some(
        parsed
            .with_timezone(&Utc)
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string(),
    ))
}

fn normalize_title(title: &str) -> Result<String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("Task title cannot be empty"));
    }

    Ok(trimmed.to_string())
}

fn task_row_from_query(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRow> {
    Ok(TaskRow {
        id: row.get("id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        created_at: row.get("created_at")?,
        action_at: row.get("action_at")?,
        completed_at: row.get("completed_at")?,
    })
}

fn read_task_row(conn: &Connection, id: &str) -> Result<TaskRow> {
    conn.query_row(
        "
        SELECT id, title, description, created_at, action_at, completed_at
        FROM tasks
        WHERE id = ?1
        ",
        [id],
        task_row_from_query,
    )
    .optional()?
    .ok_or_else(|| anyhow!("Task not found: {id}"))
}

// CRUD

pub(crate) fn list_tasks(notes_root: &Path) -> Result<Vec<TaskMetadata>> {
    let conn = open_tasks_db(notes_root)?;
    let mut statement = conn.prepare(
        "
        SELECT id, title, description, created_at, action_at, completed_at
        FROM tasks
        ORDER BY created_at DESC
        ",
    )?;

    let rows = statement.query_map([], task_row_from_query)?;
    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(TaskMetadata::from(row?));
    }
    Ok(tasks)
}

pub(crate) fn read_task(notes_root: &Path, id: &str) -> Result<Task> {
    let conn = open_tasks_db(notes_root)?;
    Ok(Task::from(read_task_row(&conn, id)?))
}

pub(crate) fn create_task(notes_root: &Path, title: &str) -> Result<Task> {
    let conn = open_tasks_db(notes_root)?;
    let task = Task {
        id: new_task_id(),
        title: normalize_title(title)?,
        description: String::new(),
        created_at: now_rfc3339(),
        action_at: None,
        completed_at: None,
    };

    conn.execute(
        "
        INSERT INTO tasks (id, title, description, action_at, created_at, completed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ",
        params![
            &task.id,
            &task.title,
            &task.description,
            &task.action_at,
            &task.created_at,
            &task.completed_at,
        ],
    )?;

    Ok(task)
}

pub(crate) fn update_task(notes_root: &Path, id: &str, patch: TaskPatch) -> Result<Task> {
    let conn = open_tasks_db(notes_root)?;
    let existing = read_task_row(&conn, id)?;

    let title = match patch.title {
        Some(next) => normalize_title(&next)?,
        None => existing.title,
    };
    let description = patch.description.unwrap_or(existing.description);
    let action_at = match patch.action_at {
        Some(next) => normalize_action_at(next)?,
        None => existing.action_at,
    };

    conn.execute(
        "
        UPDATE tasks
        SET title = ?2,
            description = ?3,
            action_at = ?4
        WHERE id = ?1
        ",
        params![id, title, description, action_at],
    )?;

    Ok(Task {
        id: id.to_string(),
        title,
        description,
        created_at: existing.created_at,
        action_at,
        completed_at: existing.completed_at,
    })
}

pub(crate) fn set_task_completed(notes_root: &Path, id: &str, completed: bool) -> Result<Task> {
    let conn = open_tasks_db(notes_root)?;
    let existing = read_task_row(&conn, id)?;
    let completed_at = if completed { Some(now_rfc3339()) } else { None };

    conn.execute(
        "
        UPDATE tasks
        SET completed_at = ?2
        WHERE id = ?1
        ",
        params![id, completed_at],
    )?;

    Ok(Task {
        id: id.to_string(),
        title: existing.title,
        description: existing.description,
        created_at: existing.created_at,
        action_at: existing.action_at,
        completed_at,
    })
}

pub(crate) fn delete_task(notes_root: &Path, id: &str) -> Result<()> {
    let conn = open_tasks_db(notes_root)?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_root() -> TempDir {
        tempfile::tempdir().expect("tempdir")
    }

    #[test]
    fn initializes_tasks_db_inside_sly_directory() {
        let root = make_root();
        let db_path = tasks_db_path(root.path());
        assert!(!db_path.exists());

        let conn = open_tasks_db(root.path()).unwrap();
        let user_version: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();

        assert_eq!(user_version, TASKS_DB_SCHEMA_VERSION);
        assert!(db_path.exists());
    }

    #[test]
    fn create_and_read_task() {
        let root = make_root();
        let task = create_task(root.path(), "Hello world").unwrap();
        let read = read_task(root.path(), &task.id).unwrap();

        assert_eq!(read.id, task.id);
        assert_eq!(read.title, "Hello world");
        assert_eq!(read.description, "");
        assert!(read.action_at.is_none());
        assert!(read.completed_at.is_none());
    }

    #[test]
    fn create_task_rejects_blank_title() {
        let root = make_root();
        let result = create_task(root.path(), "   ");

        assert!(result.is_err());
    }

    #[test]
    fn update_task_fields() {
        let root = make_root();
        let task = create_task(root.path(), "Original").unwrap();

        let updated = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                title: Some("Updated".to_string()),
                description: Some("Task description".to_string()),
                action_at: Some(Some("2026-04-10T17:00:00-05:00".to_string())),
            },
        )
        .unwrap();

        assert_eq!(updated.title, "Updated");
        assert_eq!(updated.description, "Task description");
        assert_eq!(updated.action_at.as_deref(), Some("2026-04-10T22:00:00Z"));
    }

    #[test]
    fn clear_action_at() {
        let root = make_root();
        let task = create_task(root.path(), "Task").unwrap();

        let updated = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                action_at: Some(Some("2026-04-10T12:00:00Z".to_string())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.action_at.as_deref(), Some("2026-04-10T12:00:00Z"));

        let cleared = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                action_at: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(cleared.action_at.is_none());
    }

    #[test]
    fn complete_and_uncomplete_task() {
        let root = make_root();
        let task = create_task(root.path(), "Done soon").unwrap();

        let done = set_task_completed(root.path(), &task.id, true).unwrap();
        assert!(done.completed_at.is_some());

        let undone = set_task_completed(root.path(), &task.id, false).unwrap();
        assert!(undone.completed_at.is_none());
    }

    #[test]
    fn delete_task_removes_row() {
        let root = make_root();
        let task = create_task(root.path(), "Ephemeral").unwrap();

        delete_task(root.path(), &task.id).unwrap();
        assert!(read_task(root.path(), &task.id).is_err());
    }

    #[test]
    fn list_tasks_ignores_legacy_tasks_directory() {
        let root = make_root();
        let legacy_dir = root.path().join(".tasks");
        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::write(legacy_dir.join("legacy.md"), "# Old task").unwrap();

        let tasks = list_tasks(root.path()).unwrap();
        assert!(tasks.is_empty());
    }

    #[test]
    fn list_tasks_returns_created_tasks() {
        let root = make_root();
        let first = create_task(root.path(), "First").unwrap();
        let second = create_task(root.path(), "Second").unwrap();

        let tasks = list_tasks(root.path()).unwrap();
        let ids: Vec<&str> = tasks.iter().map(|task| task.id.as_str()).collect();

        assert_eq!(tasks.len(), 2);
        assert!(ids.contains(&first.id.as_str()));
        assert!(ids.contains(&second.id.as_str()));
    }

    #[test]
    fn invalid_action_at_is_rejected() {
        let root = make_root();
        let task = create_task(root.path(), "Broken").unwrap();

        let result = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                action_at: Some(Some("not-a-date".to_string())),
                ..Default::default()
            },
        );

        assert!(result.is_err());
    }

    #[test]
    fn update_task_rejects_blank_title() {
        let root = make_root();
        let task = create_task(root.path(), "Keep me").unwrap();

        let result = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                title: Some("   ".to_string()),
                ..Default::default()
            },
        );

        assert!(result.is_err());
    }
}
