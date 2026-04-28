use anyhow::{anyhow, Result};
use chrono::{DateTime, Datelike, Local, NaiveDate, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Deserializer, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const TASKS_DB_SCHEMA_VERSION: i32 = 9;

// Public types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMetadata {
    pub id: String,
    pub title: String,
    pub description: String,
    pub link: String,
    pub waiting_for: String,
    pub created_at: String,
    pub action_at: Option<String>,
    pub schedule_bucket: Option<String>,
    pub completed_at: Option<String>,
    pub starred: bool,
    pub due_at: Option<String>,
    pub recurrence: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub link: String,
    pub waiting_for: String,
    pub created_at: String,
    pub action_at: Option<String>,
    pub schedule_bucket: Option<String>,
    pub completed_at: Option<String>,
    pub starred: bool,
    pub due_at: Option<String>,
    pub recurrence: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub link: Option<String>,
    pub waiting_for: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_nullable_string")]
    pub action_at: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_nullable_string")]
    pub schedule_bucket: Option<Option<String>>,
    pub starred: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_optional_nullable_string")]
    pub due_at: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_nullable_string")]
    pub recurrence: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TaskView {
    Inbox,
    Today,
    Upcoming,
    Waiting,
    Anytime,
    Someday,
    Completed,
    Starred,
}

impl TaskView {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Inbox => "inbox",
            Self::Today => "today",
            Self::Upcoming => "upcoming",
            Self::Waiting => "waiting",
            Self::Anytime => "anytime",
            Self::Someday => "someday",
            Self::Completed => "completed",
            Self::Starred => "starred",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TaskSelectorCandidate {
    pub(crate) id: String,
    pub(crate) title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResolvedTaskSelector {
    pub(crate) id: String,
    pub(crate) title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ResolveTaskSelectorError {
    NotFound {
        selector: String,
    },
    Ambiguous {
        selector: String,
        candidates: Vec<TaskSelectorCandidate>,
    },
}

fn deserialize_optional_nullable_string<'de, D>(
    deserializer: D,
) -> std::result::Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Some(Option::<String>::deserialize(deserializer)?))
}

#[derive(Debug)]
struct TaskRow {
    id: String,
    title: String,
    description: String,
    link: String,
    waiting_for: String,
    created_at: String,
    action_at: Option<String>,
    schedule_bucket: Option<String>,
    completed_at: Option<String>,
    starred: bool,
    due_at: Option<String>,
    recurrence: Option<String>,
    tags: Vec<String>,
}

impl From<TaskRow> for Task {
    fn from(row: TaskRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            description: row.description,
            link: row.link,
            waiting_for: row.waiting_for,
            created_at: row.created_at,
            action_at: row.action_at,
            schedule_bucket: row.schedule_bucket,
            completed_at: row.completed_at,
            starred: row.starred,
            due_at: row.due_at,
            recurrence: row.recurrence,
            tags: row.tags,
        }
    }
}

impl From<TaskRow> for TaskMetadata {
    fn from(row: TaskRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            description: row.description,
            link: row.link,
            waiting_for: row.waiting_for,
            created_at: row.created_at,
            action_at: row.action_at,
            schedule_bucket: row.schedule_bucket,
            completed_at: row.completed_at,
            starred: row.starred,
            due_at: row.due_at,
            recurrence: row.recurrence,
            tags: row.tags,
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
            link TEXT NOT NULL DEFAULT '',
            waiting_for TEXT NOT NULL DEFAULT '',
            action_at TEXT NULL,
            schedule_bucket TEXT NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
            ON tasks (completed_at);

        CREATE INDEX IF NOT EXISTS idx_tasks_action_at
            ON tasks (action_at);
        ",
    )?;

    if !table_column_exists(conn, "tasks", "link")? {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN link TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    if !table_column_exists(conn, "tasks", "schedule_bucket")? {
        conn.execute("ALTER TABLE tasks ADD COLUMN schedule_bucket TEXT NULL", [])?;
    }

    if !table_column_exists(conn, "tasks", "waiting_for")? {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN waiting_for TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    if !table_column_exists(conn, "tasks", "starred")? {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN starred INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    if !table_column_exists(conn, "tasks", "due_at")? {
        conn.execute("ALTER TABLE tasks ADD COLUMN due_at TEXT NULL", [])?;
    }

    if !table_column_exists(conn, "tasks", "recurrence")? {
        conn.execute("ALTER TABLE tasks ADD COLUMN recurrence TEXT NULL", [])?;
    }

    if !table_column_exists(conn, "tasks", "tags")? {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
            [],
        )?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS task_view_order (
            view TEXT NOT NULL,
            task_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (view, task_id)
        );
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

pub(crate) fn local_date_to_action_at(date: &str) -> Result<String> {
    let parsed = NaiveDate::parse_from_str(date.trim(), "%Y-%m-%d")
        .map_err(|error| anyhow!("Invalid date `{date}`: {error}"))?;
    let local_noon = parsed
        .and_hms_opt(12, 0, 0)
        .ok_or_else(|| anyhow!("Invalid local noon for date `{date}`"))?;
    let localized = Local
        .from_local_datetime(&local_noon)
        .single()
        .or_else(|| Local.from_local_datetime(&local_noon).earliest())
        .ok_or_else(|| anyhow!("Invalid local time for date `{date}`"))?;
    Ok(localized
        .with_timezone(&Utc)
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string())
}

fn normalize_title(title: &str) -> Result<String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("Task title cannot be empty"));
    }

    Ok(trimmed.to_string())
}

fn normalize_link(link: &str) -> String {
    link.trim().to_string()
}

fn normalize_waiting_for(waiting_for: &str) -> String {
    waiting_for.trim().to_string()
}

fn normalize_schedule_bucket(value: Option<String>) -> Result<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };

    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    match trimmed {
        "anytime" | "someday" => Ok(Some(trimmed.to_string())),
        _ => Err(anyhow!("Invalid scheduleBucket value: {trimmed}")),
    }
}

fn normalize_tag(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_start_matches('#');
    if trimmed.is_empty() {
        return None;
    }

    let normalized = trimmed
        .chars()
        .map(|ch| {
            if ch.is_alphanumeric() || matches!(ch, '-' | '_' | '/') {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for tag in tags {
        let Some(tag) = normalize_tag(&tag) else {
            continue;
        };
        if !normalized.contains(&tag) {
            normalized.push(tag);
        }
    }
    normalized
}

fn serialize_tags(tags: &[String]) -> Result<String> {
    serde_json::to_string(tags).map_err(|error| anyhow!("Invalid task tags: {error}"))
}

fn deserialize_tags(value: String) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(&value)
        .map(normalize_tags)
        .unwrap_or_default()
}

fn table_column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;

    for name in columns {
        if name? == column {
            return Ok(true);
        }
    }

    Ok(false)
}

fn action_at_to_local_date(action_at: Option<&str>) -> Option<String> {
    let action_at = action_at?;
    let parsed = DateTime::parse_from_rfc3339(action_at).ok()?;
    Some(parsed.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

fn schedule_bucket_sort_order(bucket: Option<&str>) -> i32 {
    match bucket {
        Some("anytime") => 0,
        Some("someday") => 1,
        _ => 2,
    }
}

pub(crate) fn derive_task_view(task: &TaskMetadata, today: &str) -> TaskView {
    if task.completed_at.is_some() {
        return TaskView::Completed;
    }

    if let Some(action_date) = action_at_to_local_date(task.action_at.as_deref()) {
        return if action_date.as_str() <= today {
            TaskView::Today
        } else {
            TaskView::Upcoming
        };
    }

    match task.schedule_bucket.as_deref() {
        Some("anytime") => TaskView::Anytime,
        Some("someday") => TaskView::Someday,
        _ => TaskView::Inbox,
    }
}

pub(crate) fn is_task_overdue(task: &TaskMetadata, today: &str) -> bool {
    if task.completed_at.is_some() {
        return false;
    }

    action_at_to_local_date(task.action_at.as_deref())
        .map(|date| date.as_str() < today)
        .unwrap_or(false)
}

pub(crate) fn task_matches_view(task: &TaskMetadata, view: Option<TaskView>, today: &str) -> bool {
    let Some(view) = view else {
        return true;
    };

    if view == TaskView::Waiting {
        return task.completed_at.is_none() && !task.waiting_for.trim().is_empty();
    }

    if view == TaskView::Starred {
        return task.completed_at.is_none() && task.starred;
    }

    derive_task_view(task, today) == view
}

pub(crate) fn task_matches_query(task: &TaskMetadata, query: &str) -> bool {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return true;
    }

    [
        task.title.as_str(),
        task.description.as_str(),
        task.link.as_str(),
        task.waiting_for.as_str(),
    ]
    .iter()
    .any(|field| field.to_lowercase().contains(&needle))
        || task
            .tags
            .iter()
            .any(|tag| tag.to_lowercase().contains(&needle))
}

pub(crate) fn sort_tasks_for_view(tasks: &mut [TaskMetadata], view: Option<TaskView>, today: &str) {
    tasks.sort_by(|left, right| compare_tasks(left, right, view, today));
}

fn compare_tasks(
    left: &TaskMetadata,
    right: &TaskMetadata,
    view: Option<TaskView>,
    today: &str,
) -> std::cmp::Ordering {
    match view {
        Some(TaskView::Today)
        | Some(TaskView::Upcoming)
        | Some(TaskView::Waiting)
        | Some(TaskView::Starred) => {
            let left_date = action_at_to_local_date(left.action_at.as_deref());
            let right_date = action_at_to_local_date(right.action_at.as_deref());
            match (left_date, right_date) {
                (Some(left_date), Some(right_date)) => {
                    let cmp = left_date.cmp(&right_date);
                    if cmp != std::cmp::Ordering::Equal {
                        return cmp;
                    }

                    let cmp = left.action_at.cmp(&right.action_at);
                    if cmp != std::cmp::Ordering::Equal {
                        return cmp;
                    }
                }
                (Some(_), None) => return std::cmp::Ordering::Less,
                (None, Some(_)) => return std::cmp::Ordering::Greater,
                (None, None) => {}
            }

            if matches!(view, Some(TaskView::Waiting)) {
                let cmp = schedule_bucket_sort_order(left.schedule_bucket.as_deref()).cmp(
                    &schedule_bucket_sort_order(right.schedule_bucket.as_deref()),
                );
                if cmp != std::cmp::Ordering::Equal {
                    return cmp;
                }
            }

            left.created_at.cmp(&right.created_at)
        }
        Some(TaskView::Completed) => right.completed_at.cmp(&left.completed_at),
        Some(TaskView::Inbox) | Some(TaskView::Anytime) | Some(TaskView::Someday) | None => {
            let left_view = derive_task_view(left, today);
            let right_view = derive_task_view(right, today);
            let view_cmp = task_view_sort_order(left_view).cmp(&task_view_sort_order(right_view));
            if view_cmp != std::cmp::Ordering::Equal && view.is_none() {
                return view_cmp;
            }
            left.created_at.cmp(&right.created_at)
        }
    }
}

fn task_view_sort_order(view: TaskView) -> i32 {
    match view {
        TaskView::Today => 0,
        TaskView::Upcoming => 1,
        TaskView::Anytime => 2,
        TaskView::Someday => 3,
        TaskView::Inbox => 4,
        TaskView::Completed => 5,
        TaskView::Waiting => 6,
        TaskView::Starred => 7,
    }
}

fn task_row_from_query(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRow> {
    Ok(TaskRow {
        id: row.get("id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        link: row.get("link")?,
        waiting_for: row.get("waiting_for")?,
        created_at: row.get("created_at")?,
        action_at: row.get("action_at")?,
        schedule_bucket: row.get("schedule_bucket")?,
        completed_at: row.get("completed_at")?,
        starred: row
            .get::<_, i64>("starred")
            .map(|v| v != 0)
            .unwrap_or(false),
        due_at: row.get("due_at")?,
        recurrence: row.get("recurrence")?,
        tags: deserialize_tags(row.get("tags")?),
    })
}

fn read_task_row(conn: &Connection, id: &str) -> Result<TaskRow> {
    conn.query_row(
        "
        SELECT id, title, description, link, waiting_for, created_at, action_at, schedule_bucket, completed_at, starred, due_at, recurrence, tags
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
        SELECT id, title, description, link, waiting_for, created_at, action_at, schedule_bucket, completed_at, starred, due_at, recurrence, tags
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

pub(crate) fn task_count_if_db_exists(notes_root: &Path) -> Result<Option<usize>> {
    let db_path = tasks_db_path(notes_root);
    if !db_path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(db_path)?;
    let count = conn.query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get::<_, i64>(0))?;
    Ok(Some(count.max(0) as usize))
}

pub(crate) fn create_task(notes_root: &Path, title: &str) -> Result<Task> {
    let conn = open_tasks_db(notes_root)?;
    let task = Task {
        id: new_task_id(),
        title: normalize_title(title)?,
        description: String::new(),
        link: String::new(),
        waiting_for: String::new(),
        created_at: now_rfc3339(),
        action_at: None,
        schedule_bucket: None,
        completed_at: None,
        starred: false,
        due_at: None,
        recurrence: None,
        tags: Vec::new(),
    };
    let tags_json = serialize_tags(&task.tags)?;

    conn.execute(
        "
        INSERT INTO tasks (id, title, description, link, waiting_for, action_at, schedule_bucket, created_at, completed_at, starred, due_at, recurrence, tags)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ",
        params![
            &task.id,
            &task.title,
            &task.description,
            &task.link,
            &task.waiting_for,
            &task.action_at,
            &task.schedule_bucket,
            &task.created_at,
            &task.completed_at,
            task.starred as i64,
            &task.due_at,
            &task.recurrence,
            tags_json,
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
    let link = match patch.link {
        Some(next) => normalize_link(&next),
        None => existing.link,
    };
    let waiting_for = match patch.waiting_for {
        Some(next) => normalize_waiting_for(&next),
        None => existing.waiting_for,
    };
    let starred = patch.starred.unwrap_or(existing.starred);
    let mut action_at = existing.action_at;
    let mut schedule_bucket = existing.schedule_bucket;

    if let Some(next) = patch.action_at {
        action_at = normalize_action_at(next)?;
        if action_at.is_some() {
            schedule_bucket = None;
        }
    }

    if let Some(next) = patch.schedule_bucket {
        schedule_bucket = normalize_schedule_bucket(next)?;
        if schedule_bucket.is_some() {
            action_at = None;
        }
    }

    let due_at = match patch.due_at {
        Some(next) => normalize_action_at(next)?,
        None => existing.due_at,
    };

    let recurrence = match patch.recurrence {
        Some(next) => normalize_recurrence(next)?,
        None => existing.recurrence,
    };
    let tags = patch.tags.map(normalize_tags).unwrap_or(existing.tags);
    let tags_json = serialize_tags(&tags)?;

    conn.execute(
        "
        UPDATE tasks
        SET title = ?2,
            description = ?3,
            link = ?4,
            waiting_for = ?5,
            action_at = ?6,
            schedule_bucket = ?7,
            starred = ?8,
            due_at = ?9,
            recurrence = ?10,
            tags = ?11
        WHERE id = ?1
        ",
        params![
            id,
            title,
            description,
            link,
            waiting_for,
            action_at,
            schedule_bucket,
            starred as i64,
            due_at,
            recurrence,
            tags_json,
        ],
    )?;

    Ok(Task {
        id: id.to_string(),
        title,
        description,
        link,
        waiting_for,
        created_at: existing.created_at,
        action_at,
        schedule_bucket,
        completed_at: existing.completed_at,
        starred,
        due_at,
        recurrence,
        tags,
    })
}

pub(crate) fn set_task_completed(notes_root: &Path, id: &str, completed: bool) -> Result<Task> {
    let mut conn = open_tasks_db(notes_root)?;
    let existing = read_task_row(&conn, id)?;
    let completed_at = if completed { Some(now_rfc3339()) } else { None };

    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE tasks SET completed_at = ?2 WHERE id = ?1",
        params![id, completed_at],
    )?;

    if completed {
        if let Some(rule) = &existing.recurrence {
            let today_local = Local::now().format("%Y-%m-%d").to_string();
            let mode = recurrence_mode(rule);
            let base_date = if mode == "schedule" {
                action_at_to_local_date(existing.action_at.as_deref())
                    .unwrap_or_else(|| today_local.clone())
            } else {
                today_local.clone()
            };
            let next_date = compute_next_occurrence(&base_date, rule, &today_local)?;
            let next_action_at = local_date_to_action_at(&next_date)?;
            let next_id = new_task_id();
            let next_created_at = now_rfc3339();
            tx.execute(
                "
                INSERT INTO tasks (id, title, description, link, waiting_for, action_at, schedule_bucket, created_at, completed_at, starred, due_at, recurrence, tags)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                ",
                params![
                    next_id,
                    &existing.title,
                    &existing.description,
                    &existing.link,
                    &existing.waiting_for,
                    next_action_at,
                    Option::<String>::None,
                    next_created_at,
                    Option::<String>::None,
                    0i64,
                    Option::<String>::None,
                    &existing.recurrence,
                    serialize_tags(&existing.tags)?,
                ],
            )?;
        }
    }

    tx.commit()?;

    Ok(Task {
        id: id.to_string(),
        title: existing.title,
        description: existing.description,
        link: existing.link,
        waiting_for: existing.waiting_for,
        created_at: existing.created_at,
        action_at: existing.action_at,
        schedule_bucket: existing.schedule_bucket,
        completed_at,
        starred: existing.starred,
        due_at: existing.due_at,
        recurrence: existing.recurrence,
        tags: existing.tags,
    })
}

fn normalize_recurrence(value: Option<String>) -> Result<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let parts: Vec<&str> = trimmed.split(':').collect();
    if parts.len() < 2 {
        return Err(anyhow!("Invalid recurrence rule: {trimmed}"));
    }

    let period = parts[0];
    let mode = parts[1];

    if !matches!(mode, "completion" | "schedule") {
        return Err(anyhow!("Invalid recurrence mode: {mode}"));
    }

    match period {
        "daily" | "weekday" | "weekly" | "yearly" => Ok(Some(format!("{period}:{mode}"))),
        "monthly" => {
            if mode == "schedule" {
                let anchor: u8 = parts
                    .get(2)
                    .ok_or_else(|| anyhow!("Monthly schedule recurrence requires anchor day"))?
                    .parse()
                    .map_err(|_| anyhow!("Invalid anchor day in recurrence rule: {trimmed}"))?;
                if !(1..=31).contains(&anchor) {
                    return Err(anyhow!("Anchor day must be 1–31, got {anchor}"));
                }
                Ok(Some(format!("monthly:schedule:{anchor}")))
            } else {
                Ok(Some("monthly:completion".to_string()))
            }
        }
        _ => Err(anyhow!("Invalid recurrence period: {period}")),
    }
}

fn recurrence_mode(rule: &str) -> &str {
    rule.split(':').nth(1).unwrap_or("completion")
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1u32)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .expect("valid next-month first day")
        .pred_opt()
        .expect("valid predecessor")
        .day()
}

fn advance_date_monthly(date: NaiveDate, anchor_day: Option<u32>) -> NaiveDate {
    let (next_year, next_month) = if date.month() == 12 {
        (date.year() + 1, 1u32)
    } else {
        (date.year(), date.month() + 1)
    };
    let target_day = anchor_day.unwrap_or_else(|| date.day());
    let last = days_in_month(next_year, next_month);
    NaiveDate::from_ymd_opt(next_year, next_month, target_day.min(last))
        .expect("valid monthly next date")
}

fn advance_date_yearly(date: NaiveDate) -> NaiveDate {
    let next_year = date.year() + 1;
    let last = days_in_month(next_year, date.month());
    NaiveDate::from_ymd_opt(next_year, date.month(), date.day().min(last))
        .expect("valid yearly next date")
}

fn compute_next_occurrence(base_date: &str, rule: &str, today: &str) -> Result<String> {
    use chrono::Duration;

    let parts: Vec<&str> = rule.split(':').collect();
    if parts.len() < 2 {
        return Err(anyhow!("Invalid recurrence rule: {rule}"));
    }
    let period = parts[0];
    let anchor_day: Option<u32> = parts.get(2).and_then(|s| s.parse().ok());

    let base = NaiveDate::parse_from_str(base_date, "%Y-%m-%d")
        .map_err(|e| anyhow!("Invalid base date `{base_date}`: {e}"))?;
    let today_nd = NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .map_err(|e| anyhow!("Invalid today `{today}`: {e}"))?;

    let next = match period {
        "daily" => base + Duration::days(1),
        "weekday" => {
            let mut candidate = base + Duration::days(1);
            while matches!(
                candidate.weekday(),
                chrono::Weekday::Sat | chrono::Weekday::Sun
            ) {
                candidate += Duration::days(1);
            }
            candidate
        }
        "weekly" => base + Duration::weeks(1),
        "monthly" => advance_date_monthly(base, anchor_day),
        "yearly" => advance_date_yearly(base),
        _ => return Err(anyhow!("Unknown recurrence period: {period}")),
    };

    // Floor: next occurrence must be at least tomorrow
    let result = if next <= today_nd {
        today_nd + Duration::days(1)
    } else {
        next
    };

    Ok(result.format("%Y-%m-%d").to_string())
}

pub(crate) fn delete_task(notes_root: &Path, id: &str) -> Result<()> {
    let conn = open_tasks_db(notes_root)?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    conn.execute("DELETE FROM task_view_order WHERE task_id = ?1", [id])?;
    Ok(())
}

pub(crate) fn get_task_view_order(notes_root: &Path, view: &str) -> Result<Vec<String>> {
    let conn = open_tasks_db(notes_root)?;
    let mut stmt =
        conn.prepare("SELECT task_id FROM task_view_order WHERE view = ?1 ORDER BY position ASC")?;
    let ids = stmt
        .query_map([view], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ids)
}

pub(crate) fn set_task_view_order(
    notes_root: &Path,
    view: &str,
    task_ids: &[String],
) -> Result<()> {
    let mut conn = open_tasks_db(notes_root)?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM task_view_order WHERE view = ?1", [view])?;

    let mut ordered_ids = Vec::new();
    for id in task_ids {
        if !ordered_ids.contains(id) {
            ordered_ids.push(id.clone());
        }
    }

    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "INSERT INTO task_view_order (view, task_id, position) VALUES (?1, ?2, ?3)",
            params![view, id, i as i64],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub(crate) fn resolve_task_selector(
    notes_root: &Path,
    selector: &str,
) -> std::result::Result<ResolvedTaskSelector, ResolveTaskSelectorError> {
    let selector = selector.trim();
    if selector.is_empty() {
        return Err(ResolveTaskSelectorError::NotFound {
            selector: selector.to_string(),
        });
    }

    let tasks = list_tasks(notes_root).map_err(|_| ResolveTaskSelectorError::NotFound {
        selector: selector.to_string(),
    })?;

    if let Some(task) = tasks.iter().find(|task| task.id == selector) {
        return Ok(ResolvedTaskSelector {
            id: task.id.clone(),
            title: task.title.clone(),
        });
    }

    let exact_title_matches = tasks
        .iter()
        .filter(|task| task.title == selector)
        .collect::<Vec<_>>();
    if exact_title_matches.len() == 1 {
        let task = exact_title_matches[0];
        return Ok(ResolvedTaskSelector {
            id: task.id.clone(),
            title: task.title.clone(),
        });
    }
    if exact_title_matches.len() > 1 {
        return Err(ResolveTaskSelectorError::Ambiguous {
            selector: selector.to_string(),
            candidates: exact_title_matches
                .into_iter()
                .map(|task| TaskSelectorCandidate {
                    id: task.id.clone(),
                    title: task.title.clone(),
                })
                .collect(),
        });
    }

    let prefix_matches = tasks
        .iter()
        .filter(|task| task.id.starts_with(selector))
        .collect::<Vec<_>>();
    if prefix_matches.len() == 1 {
        let task = prefix_matches[0];
        return Ok(ResolvedTaskSelector {
            id: task.id.clone(),
            title: task.title.clone(),
        });
    }
    if prefix_matches.len() > 1 {
        return Err(ResolveTaskSelectorError::Ambiguous {
            selector: selector.to_string(),
            candidates: prefix_matches
                .into_iter()
                .map(|task| TaskSelectorCandidate {
                    id: task.id.clone(),
                    title: task.title.clone(),
                })
                .collect(),
        });
    }

    let selector_lower = selector.to_lowercase();
    let fragment_matches = tasks
        .iter()
        .filter(|task| task.title.to_lowercase().contains(&selector_lower))
        .collect::<Vec<_>>();
    if fragment_matches.len() == 1 {
        let task = fragment_matches[0];
        return Ok(ResolvedTaskSelector {
            id: task.id.clone(),
            title: task.title.clone(),
        });
    }
    if fragment_matches.len() > 1 {
        return Err(ResolveTaskSelectorError::Ambiguous {
            selector: selector.to_string(),
            candidates: fragment_matches
                .into_iter()
                .map(|task| TaskSelectorCandidate {
                    id: task.id.clone(),
                    title: task.title.clone(),
                })
                .collect(),
        });
    }

    Err(ResolveTaskSelectorError::NotFound {
        selector: selector.to_string(),
    })
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
        assert_eq!(read.link, "");
        assert_eq!(read.waiting_for, "");
        assert!(read.action_at.is_none());
        assert!(read.schedule_bucket.is_none());
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
                link: Some(" https://example.com/task ".to_string()),
                waiting_for: Some(" Jordan ".to_string()),
                action_at: Some(Some("2026-04-10T17:00:00-05:00".to_string())),
                schedule_bucket: None,
                starred: None,
                due_at: None,
                recurrence: None,
                tags: None,
            },
        )
        .unwrap();

        assert_eq!(updated.title, "Updated");
        assert_eq!(updated.description, "Task description");
        assert_eq!(updated.link, "https://example.com/task");
        assert_eq!(updated.waiting_for, "Jordan");
        assert_eq!(updated.action_at.as_deref(), Some("2026-04-10T22:00:00Z"));
        assert!(updated.schedule_bucket.is_none());
    }

    #[test]
    fn migrates_legacy_db_to_add_link_column() {
        let root = make_root();
        let db_path = tasks_db_path(root.path());
        std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();

        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                action_at TEXT NULL,
                schedule_bucket TEXT NULL,
                created_at TEXT NOT NULL,
                completed_at TEXT NULL
            );
            PRAGMA user_version = 1;
            INSERT INTO tasks (id, title, description, action_at, created_at, completed_at)
            VALUES ('task-1', 'Legacy task', 'Existing description', NULL, '2026-04-10T12:00:00Z', NULL);
            ",
        )
        .unwrap();
        drop(conn);

        let migrated = read_task(root.path(), "task-1").unwrap();
        let migrated_conn = Connection::open(&db_path).unwrap();
        let user_version: i32 = migrated_conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();

        assert_eq!(migrated.link, "");
        assert_eq!(migrated.waiting_for, "");
        assert!(migrated.schedule_bucket.is_none());
        assert!(migrated.due_at.is_none());
        assert!(migrated.recurrence.is_none());
        assert_eq!(user_version, TASKS_DB_SCHEMA_VERSION);
    }

    #[test]
    fn update_due_at_and_can_clear() {
        let root = make_root();
        let task = create_task(root.path(), "Has due date").unwrap();
        assert!(task.due_at.is_none());

        let updated = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                due_at: Some(Some("2026-05-01T12:00:00Z".to_string())),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(updated.due_at.is_some());

        let cleared = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                due_at: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(cleared.due_at.is_none());
    }

    #[test]
    fn update_waiting_for_trims_and_can_clear() {
        let root = make_root();
        let task = create_task(root.path(), "Waiting").unwrap();

        let updated = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                waiting_for: Some(" Jordan ".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.waiting_for, "Jordan");

        let cleared = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                waiting_for: Some("   ".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(cleared.waiting_for, "");
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
    fn task_patch_deserializes_explicit_null_as_clear() {
        let patch: TaskPatch =
            serde_json::from_str(r#"{"actionAt":null,"scheduleBucket":null}"#).unwrap();

        assert_eq!(patch.action_at, Some(None));
        assert_eq!(patch.schedule_bucket, Some(None));
    }

    #[test]
    fn set_schedule_bucket_clears_action_at() {
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

        let bucketed = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                schedule_bucket: Some(Some("anytime".to_string())),
                ..Default::default()
            },
        )
        .unwrap();

        assert!(bucketed.action_at.is_none());
        assert_eq!(bucketed.schedule_bucket.as_deref(), Some("anytime"));
    }

    #[test]
    fn set_action_at_clears_schedule_bucket() {
        let root = make_root();
        let task = create_task(root.path(), "Task").unwrap();

        let bucketed = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                schedule_bucket: Some(Some("someday".to_string())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(bucketed.schedule_bucket.as_deref(), Some("someday"));

        let dated = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                action_at: Some(Some("2026-04-10T12:00:00Z".to_string())),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(dated.action_at.as_deref(), Some("2026-04-10T12:00:00Z"));
        assert!(dated.schedule_bucket.is_none());
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
    fn set_task_view_order_deduplicates_ids() {
        let root = make_root();
        let first = create_task(root.path(), "First").unwrap();
        let second = create_task(root.path(), "Second").unwrap();

        set_task_view_order(
            root.path(),
            "inbox",
            &[
                first.id.clone(),
                second.id.clone(),
                first.id.clone(),
                second.id.clone(),
            ],
        )
        .unwrap();

        assert_eq!(
            get_task_view_order(root.path(), "inbox").unwrap(),
            vec![first.id, second.id],
        );
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
    fn invalid_schedule_bucket_is_rejected() {
        let root = make_root();
        let task = create_task(root.path(), "Broken bucket").unwrap();

        let result = update_task(
            root.path(),
            &task.id,
            TaskPatch {
                schedule_bucket: Some(Some("later".to_string())),
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

    // --- Recurrence helper tests ---

    #[test]
    fn next_occurrence_daily_completion() {
        // base = today, so next = tomorrow
        let result =
            compute_next_occurrence("2026-01-15", "daily:completion", "2026-01-15").unwrap();
        assert_eq!(result, "2026-01-16");
    }

    #[test]
    fn next_occurrence_weekday_skips_weekend() {
        // Friday → Monday
        let result =
            compute_next_occurrence("2026-01-16", "weekday:schedule", "2026-01-14").unwrap();
        assert_eq!(result, "2026-01-19");
    }

    #[test]
    fn next_occurrence_monthly_schedule_preserves_anchor_31() {
        // Jan 31 → Feb 28 (2026 is not a leap year)
        let r1 =
            compute_next_occurrence("2026-01-31", "monthly:schedule:31", "2026-01-14").unwrap();
        assert_eq!(r1, "2026-02-28");
        // Feb 28 → Mar 31 (anchor is 31, March has 31 days)
        let r2 =
            compute_next_occurrence("2026-02-28", "monthly:schedule:31", "2026-02-14").unwrap();
        assert_eq!(r2, "2026-03-31");
        // Mar 31 → Apr 30 (anchor is 31, April has 30 days)
        let r3 =
            compute_next_occurrence("2026-03-31", "monthly:schedule:31", "2026-03-14").unwrap();
        assert_eq!(r3, "2026-04-30");
    }

    #[test]
    fn next_occurrence_floors_to_tomorrow_when_behind() {
        // schedule mode, action_at was a month ago — result must be at least tomorrow
        let result =
            compute_next_occurrence("2026-01-01", "weekly:schedule", "2026-03-01").unwrap();
        assert_eq!(result, "2026-03-02");
    }

    #[test]
    fn next_occurrence_yearly_handles_leap_year() {
        // Feb 29 in a non-leap year → Feb 28
        let result =
            compute_next_occurrence("2024-02-29", "yearly:schedule", "2024-03-01").unwrap();
        assert_eq!(result, "2025-02-28");
    }

    #[test]
    fn recurring_task_spawns_on_complete() {
        let root = make_root();
        let task = create_task(root.path(), "Daily standup").unwrap();
        update_task(
            root.path(),
            &task.id,
            TaskPatch {
                action_at: Some(Some("2026-04-10T17:00:00Z".to_string())),
                recurrence: Some(Some("daily:schedule".to_string())),
                ..Default::default()
            },
        )
        .unwrap();

        set_task_completed(root.path(), &task.id, true).unwrap();

        let all = list_tasks(root.path()).unwrap();
        let spawned: Vec<_> = all
            .iter()
            .filter(|t| t.id != task.id && t.title == "Daily standup")
            .collect();
        assert_eq!(spawned.len(), 1);
        assert!(spawned[0].completed_at.is_none());
        assert_eq!(spawned[0].recurrence.as_deref(), Some("daily:schedule"));
    }

    #[test]
    fn non_recurring_task_does_not_spawn() {
        let root = make_root();
        let task = create_task(root.path(), "One-off task").unwrap();

        set_task_completed(root.path(), &task.id, true).unwrap();

        let all = list_tasks(root.path()).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, task.id);
    }

    #[test]
    fn normalize_recurrence_validates_and_rejects_bad_rules() {
        assert!(normalize_recurrence(Some("bad".to_string())).is_err());
        assert!(normalize_recurrence(Some("daily:bad_mode".to_string())).is_err());
        assert!(normalize_recurrence(Some("monthly:schedule".to_string())).is_err());
        assert!(normalize_recurrence(Some("monthly:schedule:0".to_string())).is_err());
        assert!(normalize_recurrence(Some("monthly:schedule:32".to_string())).is_err());
        assert_eq!(
            normalize_recurrence(Some("weekly:completion".to_string())).unwrap(),
            Some("weekly:completion".to_string())
        );
        assert_eq!(
            normalize_recurrence(Some("monthly:schedule:15".to_string())).unwrap(),
            Some("monthly:schedule:15".to_string())
        );
        assert_eq!(normalize_recurrence(None).unwrap(), None);
    }
}
