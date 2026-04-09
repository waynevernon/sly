use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::frontmatter::extract_frontmatter_block;

// ── Public types ─────────────────────────────────────────────────────────────

/// Lightweight metadata returned by `list_tasks`. Parsed from frontmatter only.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMetadata {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub action_date: Option<String>,
    pub waiting: bool,
    pub someday: bool,
    pub completed_at: Option<String>,
}

/// Full task including the markdown body (everything after frontmatter).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub action_date: Option<String>,
    pub waiting: bool,
    pub someday: bool,
    pub completed_at: Option<String>,
    pub notes: String,
}

/// Fields that can be updated via `update_task`. Each field is doubly-optional:
/// `None` → leave unchanged; `Some(None)` → clear; `Some(Some(v))` → set to v.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub title: Option<String>,
    pub action_date: Option<Option<String>>,
    pub waiting: Option<bool>,
    pub someday: Option<bool>,
    pub notes: Option<String>,
}

// ── Path helpers ─────────────────────────────────────────────────────────────

pub(crate) fn tasks_dir(notes_root: &Path) -> PathBuf {
    notes_root.join(".tasks")
}

/// Generate a new unique task file ID (no extension).
pub(crate) fn new_task_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // XOR a stack-address-derived value for uniqueness within the same ms.
    let discriminant: u64 = {
        let x: u64 = 0;
        (&x as *const u64 as u64)
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407)
    };
    let rand = (discriminant >> 33) as u32 & 0xFFFFFF;
    format!("{ms:016}-{rand:06x}")
}

pub(crate) fn task_path(notes_root: &Path, id: &str) -> PathBuf {
    tasks_dir(notes_root).join(format!("{id}.md"))
}

/// True if the given path lives directly inside the `.tasks/` directory.
pub(crate) fn is_task_path(notes_root: &Path, path: &Path) -> bool {
    let dir = tasks_dir(notes_root);
    path.starts_with(&dir)
        && path.extension().and_then(|e| e.to_str()) == Some("md")
}

/// Extract a task ID (stem) from an absolute path inside `.tasks/`.
pub(crate) fn id_from_task_path(notes_root: &Path, path: &Path) -> Option<String> {
    if !is_task_path(notes_root, path) {
        return None;
    }
    path.file_stem()?.to_str().map(|s| s.to_string())
}

// ── Frontmatter parsing ───────────────────────────────────────────────────────

struct ParsedFrontmatter {
    title: String,
    created_at: String,
    action_date: Option<String>,
    waiting: bool,
    someday: bool,
    completed_at: Option<String>,
}

impl Default for ParsedFrontmatter {
    fn default() -> Self {
        Self {
            title: String::new(),
            created_at: now_rfc3339(),
            action_date: None,
            waiting: false,
            someday: false,
            completed_at: None,
        }
    }
}

/// Minimal hand-rolled key:value YAML parser for task frontmatter.
/// Only handles the fixed set of fields we write; ignores everything else.
fn parse_frontmatter(content: &str) -> ParsedFrontmatter {
    let block = match extract_frontmatter_block(content) {
        Some(b) => b,
        None => return ParsedFrontmatter::default(),
    };

    let mut fm = ParsedFrontmatter::default();

    for line in block.lines() {
        let Some((key, raw_value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let value = raw_value.trim();

        match key {
            "title" => fm.title = unquote(value).to_string(),
            "created_at" => {
                if !value.is_empty() && value != "null" {
                    fm.created_at = value.to_string();
                }
            }
            "action_date" => {
                if value.is_empty() || value == "null" {
                    fm.action_date = None;
                } else {
                    fm.action_date = Some(value.to_string());
                }
            }
            "waiting" => fm.waiting = value == "true",
            "someday" => fm.someday = value == "true",
            "completed_at" => {
                if value.is_empty() || value == "null" {
                    fm.completed_at = None;
                } else {
                    fm.completed_at = Some(value.to_string());
                }
            }
            _ => {}
        }
    }

    fm
}

/// Strip surrounding single or double quotes from a YAML scalar.
fn unquote(s: &str) -> &str {
    if (s.starts_with('"') && s.ends_with('"'))
        || (s.starts_with('\'') && s.ends_with('\''))
    {
        &s[1..s.len() - 1]
    } else {
        s
    }
}

/// Extract the notes body (content after frontmatter).
fn extract_notes_body(content: &str) -> String {
    use crate::frontmatter::strip_frontmatter;
    strip_frontmatter(content)
        .unwrap_or("")
        .trim_start_matches('\n')
        .trim_start_matches("\r\n")
        .to_string()
}

// ── Serialization ─────────────────────────────────────────────────────────────

fn serialize_task_file(
    title: &str,
    created_at: &str,
    action_date: Option<&str>,
    waiting: bool,
    someday: bool,
    completed_at: Option<&str>,
    notes: &str,
) -> String {
    let action_date_str = action_date
        .map(|d| d.to_string())
        .unwrap_or_else(|| "null".to_string());
    let completed_at_str = completed_at
        .map(|d| d.to_string())
        .unwrap_or_else(|| "null".to_string());

    // Escape the title: wrap in double quotes if it contains special chars.
    let safe_title = escape_yaml_scalar(title);

    let mut s = format!(
        "---\ntitle: {safe_title}\ncreated_at: {created_at}\naction_date: {action_date_str}\nwaiting: {waiting}\nsomeday: {someday}\ncompleted_at: {completed_at_str}\n---\n"
    );

    if !notes.is_empty() {
        s.push('\n');
        s.push_str(notes);
        if !notes.ends_with('\n') {
            s.push('\n');
        }
    }

    s
}

fn escape_yaml_scalar(s: &str) -> String {
    // Use double-quoted form if the string contains characters that need escaping.
    if s.contains(':') || s.contains('#') || s.contains('"') || s.contains('\'') || s.starts_with(' ') || s.ends_with(' ') {
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        s.to_string()
    }
}

// ── Time helpers ──────────────────────────────────────────────────────────────

pub(crate) fn now_rfc3339() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

// ── File IO ──────────────────────────────────────────────────────────────────

/// List all tasks in the `.tasks/` directory.
pub(crate) fn list_tasks(notes_root: &Path) -> Result<Vec<TaskMetadata>> {
    let dir = tasks_dir(notes_root);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut tasks = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let id = match id_from_task_path(notes_root, &path) {
            Some(id) => id,
            None => continue,
        };
        if let Ok(content) = std::fs::read_to_string(&path) {
            let fm = parse_frontmatter(&content);
            tasks.push(TaskMetadata {
                id,
                title: fm.title,
                created_at: fm.created_at,
                action_date: fm.action_date,
                waiting: fm.waiting,
                someday: fm.someday,
                completed_at: fm.completed_at,
            });
        }
    }

    // Sort by created_at descending (newest first in each view)
    tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(tasks)
}

/// Read a single task by ID.
pub(crate) fn read_task(notes_root: &Path, id: &str) -> Result<Task> {
    let path = task_path(notes_root, id);
    let content = std::fs::read_to_string(&path)
        .map_err(|e| anyhow::anyhow!("Task not found: {id}: {e}"))?;
    let fm = parse_frontmatter(&content);
    let notes = extract_notes_body(&content);
    Ok(Task {
        id: id.to_string(),
        title: fm.title,
        created_at: fm.created_at,
        action_date: fm.action_date,
        waiting: fm.waiting,
        someday: fm.someday,
        completed_at: fm.completed_at,
        notes,
    })
}

/// Create a new task with the given title. Returns the created task.
pub(crate) fn create_task(notes_root: &Path, title: &str) -> Result<Task> {
    let dir = tasks_dir(notes_root);
    std::fs::create_dir_all(&dir)?;

    let id = new_task_id();
    let created_at = now_rfc3339();
    let content = serialize_task_file(
        title,
        &created_at,
        None,
        false,
        false,
        None,
        "",
    );

    let path = task_path(notes_root, &id);
    std::fs::write(&path, &content)?;

    Ok(Task {
        id,
        title: title.to_string(),
        created_at,
        action_date: None,
        waiting: false,
        someday: false,
        completed_at: None,
        notes: String::new(),
    })
}

/// Apply a patch to an existing task. Returns the updated task.
pub(crate) fn update_task(notes_root: &Path, id: &str, patch: TaskPatch) -> Result<Task> {
    let path = task_path(notes_root, id);
    let content = std::fs::read_to_string(&path)
        .map_err(|e| anyhow::anyhow!("Task not found: {id}: {e}"))?;

    let fm = parse_frontmatter(&content);
    let current_notes = extract_notes_body(&content);

    let title = patch.title.unwrap_or(fm.title);
    let action_date = patch.action_date
        .unwrap_or(fm.action_date);
    let waiting = patch.waiting.unwrap_or(fm.waiting);
    let someday = patch.someday.unwrap_or(fm.someday);
    let notes = patch.notes.unwrap_or(current_notes);

    let new_content = serialize_task_file(
        &title,
        &fm.created_at,
        action_date.as_deref(),
        waiting,
        someday,
        fm.completed_at.as_deref(),
        &notes,
    );

    std::fs::write(&path, &new_content)?;

    Ok(Task {
        id: id.to_string(),
        title,
        created_at: fm.created_at,
        action_date,
        waiting,
        someday,
        completed_at: fm.completed_at,
        notes,
    })
}

/// Toggle the completed state of a task.
pub(crate) fn set_task_completed(notes_root: &Path, id: &str, completed: bool) -> Result<Task> {
    let path = task_path(notes_root, id);
    let content = std::fs::read_to_string(&path)
        .map_err(|e| anyhow::anyhow!("Task not found: {id}: {e}"))?;

    let fm = parse_frontmatter(&content);
    let notes = extract_notes_body(&content);

    let completed_at = if completed {
        Some(now_rfc3339())
    } else {
        None
    };

    let new_content = serialize_task_file(
        &fm.title,
        &fm.created_at,
        fm.action_date.as_deref(),
        fm.waiting,
        fm.someday,
        completed_at.as_deref(),
        &notes,
    );

    std::fs::write(&path, &new_content)?;

    Ok(Task {
        id: id.to_string(),
        title: fm.title,
        created_at: fm.created_at,
        action_date: fm.action_date,
        waiting: fm.waiting,
        someday: fm.someday,
        completed_at,
        notes,
    })
}

/// Delete a task by ID.
pub(crate) fn delete_task(notes_root: &Path, id: &str) -> Result<()> {
    let path = task_path(notes_root, id);
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_root() -> TempDir {
        tempfile::tempdir().expect("tempdir")
    }

    // ── frontmatter round-trip ────────────────────────────────────────────────

    #[test]
    fn parse_full_frontmatter() {
        let content = "---\ntitle: Buy milk\ncreated_at: 2026-04-09T10:00:00Z\naction_date: 2026-04-10\nwaiting: true\nsomeday: false\ncompleted_at: null\n---\n\nSome notes here.";
        let fm = parse_frontmatter(content);
        assert_eq!(fm.title, "Buy milk");
        assert_eq!(fm.created_at, "2026-04-09T10:00:00Z");
        assert_eq!(fm.action_date, Some("2026-04-10".to_string()));
        assert!(fm.waiting);
        assert!(!fm.someday);
        assert_eq!(fm.completed_at, None);
    }

    #[test]
    fn parse_missing_optional_fields() {
        let content = "---\ntitle: Minimal\ncreated_at: 2026-01-01T00:00:00Z\naction_date: null\nwaiting: false\nsomeday: false\ncompleted_at: null\n---\n";
        let fm = parse_frontmatter(content);
        assert_eq!(fm.title, "Minimal");
        assert_eq!(fm.action_date, None);
        assert!(!fm.waiting);
        assert_eq!(fm.completed_at, None);
    }

    #[test]
    fn parse_malformed_no_frontmatter() {
        let fm = parse_frontmatter("# Just markdown\nNo frontmatter here.");
        // Should produce defaults without panicking.
        assert!(!fm.waiting);
        assert!(!fm.someday);
        assert_eq!(fm.action_date, None);
    }

    #[test]
    fn serialize_round_trip() {
        let content = serialize_task_file(
            "Buy milk",
            "2026-04-09T10:00:00Z",
            Some("2026-04-10"),
            false,
            false,
            None,
            "Go to the store.",
        );
        let fm = parse_frontmatter(&content);
        assert_eq!(fm.title, "Buy milk");
        assert_eq!(fm.action_date, Some("2026-04-10".to_string()));
        assert!(!fm.waiting);
    }

    #[test]
    fn serialize_title_with_colon() {
        let content = serialize_task_file("Fix: the bug", "2026-04-09T00:00:00Z", None, false, false, None, "");
        assert!(content.contains("\"Fix: the bug\""));
        let fm = parse_frontmatter(&content);
        assert_eq!(fm.title, "Fix: the bug");
    }

    // ── view routing ─────────────────────────────────────────────────────────

    fn meta(
        action_date: Option<&str>,
        waiting: bool,
        someday: bool,
        completed_at: Option<&str>,
    ) -> TaskMetadata {
        TaskMetadata {
            id: "x".to_string(),
            title: "T".to_string(),
            created_at: "2026-04-09T00:00:00Z".to_string(),
            action_date: action_date.map(str::to_string),
            waiting,
            someday,
            completed_at: completed_at.map(str::to_string),
        }
    }

    fn derive(m: &TaskMetadata, today: &str) -> &'static str {
        // Mirror the frontend deriveView logic in Rust for testing.
        if m.completed_at.is_some() {
            return "logbook";
        }
        if m.waiting {
            return "waiting";
        }
        if m.someday {
            return "someday";
        }
        if let Some(date) = &m.action_date {
            if date.as_str() <= today {
                return "today";
            } else {
                return "upcoming";
            }
        }
        "inbox"
    }

    #[test]
    fn view_routing_table() {
        let today = "2026-04-09";
        let cases: &[(&str, TaskMetadata)] = &[
            ("logbook",  meta(None,               false, false, Some("2026-04-09T12:00:00Z"))),
            ("waiting",  meta(Some("2026-04-09"), true,  false, None)),
            ("someday",  meta(None,               false, true,  None)),
            ("today",    meta(Some("2026-04-09"), false, false, None)),
            ("today",    meta(Some("2026-04-08"), false, false, None)), // overdue
            ("upcoming", meta(Some("2026-04-10"), false, false, None)),
            ("inbox",    meta(None,               false, false, None)),
        ];

        for (expected, task) in cases {
            assert_eq!(derive(task, today), *expected, "Failed for expected={expected}");
        }
    }

    // ── file IO ───────────────────────────────────────────────────────────────

    #[test]
    fn create_and_read_task() {
        let root = make_root();
        let task = create_task(root.path(), "Hello world").unwrap();
        assert_eq!(task.title, "Hello world");
        assert!(!task.id.is_empty());

        let read = read_task(root.path(), &task.id).unwrap();
        assert_eq!(read.title, task.title);
        assert_eq!(read.created_at, task.created_at);
    }

    #[test]
    fn update_task_fields() {
        let root = make_root();
        let task = create_task(root.path(), "Original").unwrap();

        let patch = TaskPatch {
            title: Some("Updated".to_string()),
            action_date: Some(Some("2026-05-01".to_string())),
            waiting: Some(true),
            someday: None,
            notes: Some("My notes.".to_string()),
        };
        let updated = update_task(root.path(), &task.id, patch).unwrap();
        assert_eq!(updated.title, "Updated");
        assert_eq!(updated.action_date, Some("2026-05-01".to_string()));
        assert!(updated.waiting);
        assert_eq!(updated.notes, "My notes.");
    }

    #[test]
    fn clear_action_date() {
        let root = make_root();
        let task = create_task(root.path(), "Task").unwrap();
        // Set date
        let p1 = TaskPatch { action_date: Some(Some("2026-05-01".to_string())), ..Default::default() };
        update_task(root.path(), &task.id, p1).unwrap();
        // Clear date
        let p2 = TaskPatch { action_date: Some(None), ..Default::default() };
        let updated = update_task(root.path(), &task.id, p2).unwrap();
        assert_eq!(updated.action_date, None);
    }

    #[test]
    fn complete_and_uncomplete_task() {
        let root = make_root();
        let task = create_task(root.path(), "Done soon").unwrap();

        let done = set_task_completed(root.path(), &task.id, true).unwrap();
        assert!(done.completed_at.is_some());

        let undone = set_task_completed(root.path(), &task.id, false).unwrap();
        assert_eq!(undone.completed_at, None);
    }

    #[test]
    fn delete_task_removes_file() {
        let root = make_root();
        let task = create_task(root.path(), "Ephemeral").unwrap();
        let path = task_path(root.path(), &task.id);
        assert!(path.exists());

        delete_task(root.path(), &task.id).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn list_tasks_excludes_non_md() {
        let root = make_root();
        let dir = tasks_dir(root.path());
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("ignore.txt"), "not a task").unwrap();
        create_task(root.path(), "Real task").unwrap();

        let tasks = list_tasks(root.path()).unwrap();
        assert_eq!(tasks.len(), 1);
    }

    #[test]
    fn is_task_path_works() {
        let root = make_root();
        let inside = tasks_dir(root.path()).join("2026-04-09-abc.md");
        let outside = root.path().join("note.md");
        assert!(is_task_path(root.path(), &inside));
        assert!(!is_task_path(root.path(), &outside));
    }
}
