use crate::cli::{CliDoctorReport, CliTaskSummary};
use crate::tasks::Task;
use serde::Serialize;

fn json_dumps<T: Serialize + ?Sized>(value: &T) -> String {
    serde_json::to_string_pretty(value).expect("json serialization should succeed")
}

fn truncate_with_ellipsis(value: &str, width: usize) -> String {
    let trimmed = value.trim();
    let char_count = trimmed.chars().count();
    if char_count <= width {
        return trimmed.to_string();
    }

    if width <= 1 {
        return "…".to_string();
    }

    let mut result = String::with_capacity(width);
    for ch in trimmed.chars().take(width - 1) {
        result.push(ch);
    }
    result.push('…');
    result
}

fn pad(value: &str, width: usize) -> String {
    let len = value.chars().count();
    if len >= width {
        value.to_string()
    } else {
        format!("{value:<width$}")
    }
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn task_when_label(summary: &CliTaskSummary) -> String {
    if let Some(action_at) = &summary.action_at {
        return action_at.clone();
    }
    if let Some(bucket) = &summary.schedule_bucket {
        return bucket.clone();
    }
    String::new()
}

fn task_status_label(task: &Task) -> &'static str {
    if task.completed_at.is_some() {
        "completed"
    } else {
        "open"
    }
}

pub(crate) fn render_task_list_table(tasks: &[CliTaskSummary]) -> String {
    let mut lines = Vec::with_capacity(tasks.len() + 2);
    lines.push(format!(
        "{}  {}  {}  {}",
        pad("ID", 8),
        pad("VIEW", 10),
        pad("WHEN", 20),
        "TITLE"
    ));
    lines.push(format!(
        "{}  {}  {}  {}",
        "-".repeat(8),
        "-".repeat(10),
        "-".repeat(20),
        "-".repeat(40)
    ));

    for task in tasks {
        let id = truncate_with_ellipsis(&task.id, 8);
        let view = task.view.clone();
        let when = task_when_label(task);
        let mut title = task.title.clone();
        if task.completed {
            title.push_str(" [done]");
        } else if task.overdue {
            title.push_str(" [overdue]");
        }
        if !task.waiting_for.trim().is_empty() {
            title.push_str(" [waiting]");
        }
        lines.push(format!(
            "{}  {}  {}  {}",
            pad(&id, 8),
            pad(&view, 10),
            pad(&truncate_with_ellipsis(&when, 20), 20),
            title
        ));
    }

    lines.join("\n")
}

pub(crate) fn render_task_list_csv(tasks: &[CliTaskSummary]) -> String {
    let mut lines = vec![String::from(
        "id,title,view,completed,overdue,actionAt,scheduleBucket,waitingFor,link,createdAt,completedAt,description",
    )];

    for task in tasks {
        let row = [
            csv_escape(&task.id),
            csv_escape(&task.title),
            csv_escape(&task.view),
            task.completed.to_string(),
            task.overdue.to_string(),
            csv_escape(task.action_at.as_deref().unwrap_or("")),
            csv_escape(task.schedule_bucket.as_deref().unwrap_or("")),
            csv_escape(&task.waiting_for),
            csv_escape(&task.link),
            csv_escape(&task.created_at),
            csv_escape(task.completed_at.as_deref().unwrap_or("")),
            csv_escape(&task.description),
        ];
        lines.push(row.join(","));
    }

    lines.join("\n")
}

pub(crate) fn render_task_list_json(tasks: &[CliTaskSummary]) -> String {
    json_dumps(tasks)
}

pub(crate) fn render_task_text(task: &Task) -> String {
    let mut lines = vec![
        task.title.clone(),
        "─".repeat(task.title.chars().count().max(8)),
    ];
    lines.push(format!("ID: {}", task.id));
    lines.push(format!("Status: {}", task_status_label(task)));
    lines.push(format!("Created: {}", task.created_at));

    if let Some(action_at) = &task.action_at {
        lines.push(format!("Action At: {action_at}"));
    }
    if let Some(schedule_bucket) = &task.schedule_bucket {
        lines.push(format!("Schedule Bucket: {schedule_bucket}"));
    }
    if let Some(completed_at) = &task.completed_at {
        lines.push(format!("Completed At: {completed_at}"));
    }
    if !task.waiting_for.trim().is_empty() {
        lines.push(format!("Waiting For: {}", task.waiting_for));
    }
    if !task.link.trim().is_empty() {
        lines.push(format!("Link: {}", task.link));
    }
    if !task.description.trim().is_empty() {
        lines.push(String::new());
        lines.push("Description".to_string());
        lines.push("───────────".to_string());
        lines.push(task.description.clone());
    }

    lines.join("\n")
}

pub(crate) fn render_task_json(task: &Task) -> String {
    json_dumps(task)
}

pub(crate) fn render_delete_message(id: &str, title: &str) -> String {
    format!("Deleted task {id} ({title})")
}

pub(crate) fn render_doctor_table(report: &CliDoctorReport) -> String {
    let mut lines = vec![
        format!("OK: {}", report.ok),
        format!(
            "Notes Folder: {}",
            report.notes_folder.as_deref().unwrap_or("(not set)")
        ),
        format!("Notes Folder Source: {}", report.notes_folder_source),
        format!(
            "Tasks Enabled: {}",
            report
                .tasks_enabled
                .map(|value| value.to_string())
                .unwrap_or_else(|| "(unset)".to_string())
        ),
        format!("Tasks DB Path: {}", report.tasks_db_path),
        format!("Tasks DB Exists: {}", report.tasks_db_exists),
        format!("Can Read Tasks: {}", report.can_read_tasks),
        format!(
            "Task Count: {}",
            report
                .task_count
                .map(|value| value.to_string())
                .unwrap_or_else(|| "(unknown)".to_string())
        ),
    ];

    if !report.warnings.is_empty() {
        lines.push(String::new());
        lines.push("Warnings".to_string());
        lines.push("────────".to_string());
        lines.extend(report.warnings.iter().cloned());
    }

    lines.join("\n")
}

pub(crate) fn render_doctor_json(report: &CliDoctorReport) -> String {
    json_dumps(report)
}
