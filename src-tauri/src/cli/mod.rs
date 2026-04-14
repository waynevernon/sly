mod discovery;
mod formatters;

use std::io::Write;
use std::path::{Path, PathBuf};

use clap::{ArgAction, Args, CommandFactory, Parser, Subcommand, ValueEnum};
use serde::Serialize;

use crate::cli::discovery::{
    build_doctor_context, persist_tasks_enabled, resolve_notes_folder, tasks_db_info, CliRuntime,
};
use crate::cli::formatters::{
    render_delete_message, render_doctor_json, render_doctor_table, render_task_json,
    render_task_list_csv, render_task_list_json, render_task_list_table, render_task_text,
};
use crate::persistence::workspace_settings::load_settings;
use crate::tasks::{
    self, derive_task_view, is_task_overdue, local_date_to_action_at, resolve_task_selector,
    sort_tasks_for_view, task_matches_query, task_matches_view, Task, TaskMetadata, TaskPatch,
    TaskView,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CliTaskSummary {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) link: String,
    pub(crate) waiting_for: String,
    pub(crate) created_at: String,
    pub(crate) action_at: Option<String>,
    pub(crate) schedule_bucket: Option<String>,
    pub(crate) completed_at: Option<String>,
    pub(crate) view: String,
    pub(crate) overdue: bool,
    pub(crate) completed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CliDoctorReport {
    pub(crate) ok: bool,
    pub(crate) notes_folder: Option<String>,
    pub(crate) notes_folder_source: String,
    pub(crate) tasks_enabled: Option<bool>,
    pub(crate) tasks_db_path: String,
    pub(crate) tasks_db_exists: bool,
    pub(crate) can_read_tasks: bool,
    pub(crate) task_count: Option<usize>,
    pub(crate) warnings: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum ListFormat {
    Table,
    Json,
    Csv,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum TextOrJsonFormat {
    Text,
    Json,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum DoctorFormat {
    Table,
    Json,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
#[value(rename_all = "kebab-case")]
enum TaskViewArg {
    All,
    Inbox,
    Today,
    Upcoming,
    Waiting,
    Anytime,
    Someday,
    Completed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
#[value(rename_all = "lower")]
enum ScheduleBucketArg {
    Anytime,
    Someday,
}

impl ScheduleBucketArg {
    fn as_str(self) -> &'static str {
        match self {
            Self::Anytime => "anytime",
            Self::Someday => "someday",
        }
    }
}

impl TaskViewArg {
    fn as_task_view(self) -> Option<TaskView> {
        match self {
            Self::All => None,
            Self::Inbox => Some(TaskView::Inbox),
            Self::Today => Some(TaskView::Today),
            Self::Upcoming => Some(TaskView::Upcoming),
            Self::Waiting => Some(TaskView::Waiting),
            Self::Anytime => Some(TaskView::Anytime),
            Self::Someday => Some(TaskView::Someday),
            Self::Completed => Some(TaskView::Completed),
        }
    }
}

#[derive(Debug, Parser)]
#[command(
    name = "sly",
    disable_help_subcommand = true,
    version,
    about = "Task-oriented CLI for Sly notes folders.",
    after_help = "Run `sly task <command> --help` for command-specific options and examples."
)]
struct Cli {
    #[arg(long, global = true, value_name = "PATH")]
    notes_folder: Option<PathBuf>,

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    #[command(about = "Diagnose notes-folder and task database discovery.")]
    Doctor(DoctorCommand),
    #[command(subcommand, about = "Manage tasks stored in the current Sly vault.")]
    Task(TaskCommand),
}

#[derive(Debug, Args)]
struct DoctorCommand {
    #[arg(long, value_enum, default_value_t = DoctorFormat::Table)]
    format: DoctorFormat,
}

#[derive(Debug, Subcommand)]
enum TaskCommand {
    #[command(about = "List tasks in the current vault.")]
    List(TaskListCommand),
    #[command(about = "Search tasks by text (alias for `task list --query`).")]
    Search(TaskSearchCommand),
    #[command(about = "Show a single task.")]
    Show(TaskShowCommand),
    #[command(about = "Create a task.")]
    Create(TaskCreateCommand),
    #[command(about = "Update one task.")]
    Update(TaskUpdateCommand),
    #[command(about = "Mark a task complete.")]
    Complete(TaskToggleCommand),
    #[command(about = "Reopen a completed task.")]
    Reopen(TaskToggleCommand),
    #[command(about = "Change a task date or schedule bucket.")]
    Reschedule(TaskRescheduleCommand),
    #[command(about = "Delete a task.")]
    Delete(TaskDeleteCommand),
}

#[derive(Debug, Args)]
struct TaskListCommand {
    #[arg(long, short = 'q')]
    query: Option<String>,
    #[arg(long, value_enum, default_value_t = TaskViewArg::All)]
    view: TaskViewArg,
    #[arg(long, short = 'n')]
    limit: Option<usize>,
    #[arg(long, value_enum, default_value_t = ListFormat::Table)]
    format: ListFormat,
}

#[derive(Debug, Args)]
struct TaskSearchCommand {
    query: String,
    #[arg(long, value_enum, default_value_t = TaskViewArg::All)]
    view: TaskViewArg,
    #[arg(long, short = 'n')]
    limit: Option<usize>,
    #[arg(long, value_enum, default_value_t = ListFormat::Table)]
    format: ListFormat,
}

#[derive(Debug, Args)]
struct TaskShowCommand {
    selector: String,
    #[arg(long, value_enum, default_value_t = TextOrJsonFormat::Text)]
    format: TextOrJsonFormat,
}

#[derive(Debug, Args)]
struct TaskCreateCommand {
    title: String,
    #[arg(long)]
    description: Option<String>,
    #[arg(long)]
    link: Option<String>,
    #[arg(long = "waiting-for")]
    waiting_for: Option<String>,
    #[arg(long, conflicts_with = "bucket")]
    date: Option<String>,
    #[arg(long, value_enum, conflicts_with = "date")]
    bucket: Option<ScheduleBucketArg>,
    #[arg(long, value_enum, default_value_t = TextOrJsonFormat::Text)]
    format: TextOrJsonFormat,
}

#[derive(Debug, Args)]
struct TaskUpdateCommand {
    selector: String,
    #[arg(long)]
    title: Option<String>,
    #[arg(long, conflicts_with = "clear_description")]
    description: Option<String>,
    #[arg(long = "clear-description", action = ArgAction::SetTrue)]
    clear_description: bool,
    #[arg(long, conflicts_with = "clear_link")]
    link: Option<String>,
    #[arg(long = "clear-link", action = ArgAction::SetTrue)]
    clear_link: bool,
    #[arg(long = "waiting-for", conflicts_with = "clear_waiting_for")]
    waiting_for: Option<String>,
    #[arg(long = "clear-waiting-for", action = ArgAction::SetTrue)]
    clear_waiting_for: bool,
    #[arg(long, conflicts_with_all = ["bucket", "clear_date", "clear_bucket"])]
    date: Option<String>,
    #[arg(long = "clear-date", action = ArgAction::SetTrue, conflicts_with_all = ["date", "bucket"])]
    clear_date: bool,
    #[arg(long, value_enum, conflicts_with_all = ["date", "clear_date", "clear_bucket"])]
    bucket: Option<ScheduleBucketArg>,
    #[arg(long = "clear-bucket", action = ArgAction::SetTrue, conflicts_with_all = ["bucket", "date"])]
    clear_bucket: bool,
    #[arg(long, value_enum, default_value_t = TextOrJsonFormat::Text)]
    format: TextOrJsonFormat,
}

#[derive(Debug, Args)]
struct TaskToggleCommand {
    selector: String,
    #[arg(long, value_enum, default_value_t = TextOrJsonFormat::Text)]
    format: TextOrJsonFormat,
}

#[derive(Debug, Args)]
struct TaskRescheduleCommand {
    selector: String,
    #[arg(long, conflicts_with_all = ["bucket", "clear"])]
    date: Option<String>,
    #[arg(long, value_enum, conflicts_with_all = ["date", "clear"])]
    bucket: Option<ScheduleBucketArg>,
    #[arg(long, action = ArgAction::SetTrue, conflicts_with_all = ["date", "bucket"])]
    clear: bool,
    #[arg(long, value_enum, default_value_t = TextOrJsonFormat::Text)]
    format: TextOrJsonFormat,
}

#[derive(Debug, Args)]
struct TaskDeleteCommand {
    selector: String,
}

pub(crate) fn should_handle_cli(argv: &[String]) -> bool {
    if argv.len() <= 1 {
        return false;
    }

    let mut skip_next = false;
    for arg in argv.iter().skip(1) {
        if skip_next {
            skip_next = false;
            continue;
        }

        match arg.as_str() {
            "--notes-folder" => {
                skip_next = true;
            }
            "-h" | "--help" | "-V" | "--version" | "task" | "doctor" => {
                return true;
            }
            _ if arg.starts_with("--notes-folder=") => {}
            _ => {}
        }
    }

    false
}

pub(crate) fn maybe_run_preflight(argv: &[String]) -> Option<i32> {
    if !should_handle_cli(argv) {
        return None;
    }

    let runtime = CliRuntime::default();
    let mut stdout = std::io::stdout();
    let mut stderr = std::io::stderr();
    Some(run_with_runtime(argv, &mut stdout, &mut stderr, &runtime))
}

fn run_with_runtime(
    argv: &[String],
    stdout: &mut dyn Write,
    stderr: &mut dyn Write,
    runtime: &CliRuntime,
) -> i32 {
    let cli = match Cli::try_parse_from(argv) {
        Ok(cli) => cli,
        Err(error) => {
            if error.use_stderr() {
                let _ = write!(stderr, "{error}");
            } else {
                let _ = write!(stdout, "{error}");
            }
            return match error.kind() {
                clap::error::ErrorKind::DisplayHelp | clap::error::ErrorKind::DisplayVersion => 0,
                _ => 2,
            };
        }
    };

    match dispatch(cli, stdout, runtime) {
        Ok(()) => 0,
        Err(error) => {
            let _ = writeln!(stderr, "error: {error}");
            1
        }
    }
}

fn dispatch(cli: Cli, stdout: &mut dyn Write, runtime: &CliRuntime) -> Result<(), String> {
    match cli.command {
        Some(Command::Doctor(args)) => {
            handle_doctor(args, cli.notes_folder.as_deref(), stdout, runtime)
        }
        Some(Command::Task(command)) => {
            handle_task(command, cli.notes_folder.as_deref(), stdout, runtime)
        }
        None => {
            let mut command = Cli::command();
            command
                .print_help()
                .map_err(|error| format!("Failed to render help: {error}"))?;
            writeln!(stdout).map_err(|error| error.to_string())
        }
    }
}

fn handle_doctor(
    args: DoctorCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    let context = build_doctor_context(cli_notes_folder, runtime);
    let mut warnings = Vec::new();

    let (tasks_db_path, tasks_db_exists, can_read_tasks, task_count) = if let Some(notes_folder) =
        &context.notes_folder
    {
        if !notes_folder.exists() {
            warnings.push(format!(
                "Notes folder does not exist: {}",
                notes_folder.display()
            ));
            (tasks::tasks_db_path(notes_folder), false, false, None)
        } else if !notes_folder.is_dir() {
            warnings.push(format!(
                "Notes folder is not a directory: {}",
                notes_folder.display()
            ));
            (tasks::tasks_db_path(notes_folder), false, false, None)
        } else {
            let (db_path, db_exists, can_read, count) = tasks_db_info(notes_folder);
            if !db_exists {
                warnings.push(format!(
                    "Task database not created yet: {}",
                    db_path.display()
                ));
            } else if !can_read {
                warnings.push(format!(
                    "Failed to read task database: {}",
                    db_path.display()
                ));
            }
            (db_path, db_exists, can_read, count)
        }
    } else {
        warnings.push(
            "Notes folder not set. Pass `--notes-folder PATH` or run `sly .` first.".to_string(),
        );
        (PathBuf::from(".sly/tasks.db"), false, false, None)
    };

    let report = CliDoctorReport {
        ok: context.notes_folder.is_some() && can_read_tasks,
        notes_folder: context
            .notes_folder
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        notes_folder_source: context.notes_folder_source.as_str().to_string(),
        tasks_enabled: context
            .notes_folder
            .as_ref()
            .and_then(|path| load_tasks_enabled(path)),
        tasks_db_path: tasks_db_path.to_string_lossy().into_owned(),
        tasks_db_exists,
        can_read_tasks,
        task_count,
        warnings,
    };

    let output = match args.format {
        DoctorFormat::Json => render_doctor_json(&report),
        DoctorFormat::Table => render_doctor_table(&report),
    };
    writeln!(stdout, "{output}").map_err(|error| error.to_string())
}

fn handle_task(
    command: TaskCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    match command {
        TaskCommand::List(args) => handle_task_list(args, cli_notes_folder, stdout, runtime),
        TaskCommand::Search(args) => handle_task_search(args, cli_notes_folder, stdout, runtime),
        TaskCommand::Show(args) => handle_task_show(args, cli_notes_folder, stdout, runtime),
        TaskCommand::Create(args) => handle_task_create(args, cli_notes_folder, stdout, runtime),
        TaskCommand::Update(args) => handle_task_update(args, cli_notes_folder, stdout, runtime),
        TaskCommand::Complete(args) => {
            handle_task_toggle(args, cli_notes_folder, stdout, runtime, true)
        }
        TaskCommand::Reopen(args) => {
            handle_task_toggle(args, cli_notes_folder, stdout, runtime, false)
        }
        TaskCommand::Reschedule(args) => {
            handle_task_reschedule(args, cli_notes_folder, stdout, runtime)
        }
        TaskCommand::Delete(args) => handle_task_delete(args, cli_notes_folder, stdout, runtime),
    }
}

fn handle_task_list(
    args: TaskListCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    let vault = resolve_notes_folder(cli_notes_folder, runtime, false, false)?;
    let tasks = tasks::list_tasks(&vault.notes_folder).map_err(|error| error.to_string())?;
    let summaries = build_task_summaries(
        tasks,
        args.query.as_deref(),
        args.view,
        args.limit,
        &runtime.today,
    );
    write_task_list_output(&summaries, args.format, stdout)
}

fn handle_task_search(
    args: TaskSearchCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    handle_task_list(
        TaskListCommand {
            query: Some(args.query),
            view: args.view,
            limit: args.limit,
            format: args.format,
        },
        cli_notes_folder,
        stdout,
        runtime,
    )
}

fn handle_task_show(
    args: TaskShowCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    let vault = resolve_notes_folder(cli_notes_folder, runtime, false, false)?;
    let task = resolve_full_task(&vault.notes_folder, &args.selector)?;
    write_task_output(&task, args.format, stdout)
}

fn handle_task_create(
    args: TaskCreateCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    let mut vault = resolve_notes_folder(cli_notes_folder, runtime, true, true)?;
    persist_tasks_enabled(&vault.notes_folder, &mut vault.settings)?;

    let mut task =
        tasks::create_task(&vault.notes_folder, &args.title).map_err(|error| error.to_string())?;
    let patch = patch_from_optional_fields(TaskPatchFieldArgs {
        description: args.description,
        clear_description: false,
        link: args.link,
        clear_link: false,
        waiting_for: args.waiting_for,
        clear_waiting_for: false,
        date: args.date,
        clear_date: false,
        bucket: args.bucket,
        clear_bucket: false,
    })?;

    if task_patch_has_changes(&patch) {
        task = tasks::update_task(&vault.notes_folder, &task.id, patch)
            .map_err(|error| error.to_string())?;
    }

    write_task_output(&task, args.format, stdout)
}

fn handle_task_update(
    args: TaskUpdateCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    let mut vault = resolve_notes_folder(cli_notes_folder, runtime, false, true)?;
    persist_tasks_enabled(&vault.notes_folder, &mut vault.settings)?;
    let resolved = resolve_task_selector(&vault.notes_folder, &args.selector)
        .map_err(selector_error_message)?;
    let patch = patch_from_optional_fields(TaskPatchFieldArgs {
        description: args.description,
        clear_description: args.clear_description,
        link: args.link,
        clear_link: args.clear_link,
        waiting_for: args.waiting_for,
        clear_waiting_for: args.clear_waiting_for,
        date: args.date,
        clear_date: args.clear_date,
        bucket: args.bucket,
        clear_bucket: args.clear_bucket,
    })?
    .with_title(args.title);

    if !task_patch_has_changes(&patch) {
        return Err("No task updates were specified.".to_string());
    }

    let task = tasks::update_task(&vault.notes_folder, &resolved.id, patch)
        .map_err(|error| error.to_string())?;
    write_task_output(&task, args.format, stdout)
}

fn handle_task_toggle(
    args: TaskToggleCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
    completed: bool,
) -> Result<(), String> {
    let mut vault = resolve_notes_folder(cli_notes_folder, runtime, false, true)?;
    persist_tasks_enabled(&vault.notes_folder, &mut vault.settings)?;
    let resolved = resolve_task_selector(&vault.notes_folder, &args.selector)
        .map_err(selector_error_message)?;
    let task = tasks::set_task_completed(&vault.notes_folder, &resolved.id, completed)
        .map_err(|error| error.to_string())?;
    write_task_output(&task, args.format, stdout)
}

fn handle_task_reschedule(
    args: TaskRescheduleCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    if args.date.is_none() && args.bucket.is_none() && !args.clear {
        return Err("Pass one of `--date`, `--bucket`, or `--clear`.".to_string());
    }

    let mut vault = resolve_notes_folder(cli_notes_folder, runtime, false, true)?;
    persist_tasks_enabled(&vault.notes_folder, &mut vault.settings)?;
    let resolved = resolve_task_selector(&vault.notes_folder, &args.selector)
        .map_err(selector_error_message)?;

    let patch = if args.clear {
        TaskPatch {
            action_at: Some(None),
            schedule_bucket: Some(None),
            ..Default::default()
        }
    } else if let Some(date) = args.date {
        TaskPatch {
            action_at: Some(Some(
                local_date_to_action_at(&date).map_err(|error| error.to_string())?,
            )),
            schedule_bucket: None,
            ..Default::default()
        }
    } else {
        TaskPatch {
            action_at: None,
            schedule_bucket: Some(Some(
                args.bucket
                    .expect("bucket should exist")
                    .as_str()
                    .to_string(),
            )),
            ..Default::default()
        }
    };

    let task = tasks::update_task(&vault.notes_folder, &resolved.id, patch)
        .map_err(|error| error.to_string())?;
    write_task_output(&task, args.format, stdout)
}

fn handle_task_delete(
    args: TaskDeleteCommand,
    cli_notes_folder: Option<&Path>,
    stdout: &mut dyn Write,
    runtime: &CliRuntime,
) -> Result<(), String> {
    let mut vault = resolve_notes_folder(cli_notes_folder, runtime, false, true)?;
    persist_tasks_enabled(&vault.notes_folder, &mut vault.settings)?;
    let resolved = resolve_task_selector(&vault.notes_folder, &args.selector)
        .map_err(selector_error_message)?;
    tasks::delete_task(&vault.notes_folder, &resolved.id).map_err(|error| error.to_string())?;
    writeln!(
        stdout,
        "{}",
        render_delete_message(&resolved.id, &resolved.title)
    )
    .map_err(|error| error.to_string())
}

fn build_task_summaries(
    tasks: Vec<TaskMetadata>,
    query: Option<&str>,
    view: TaskViewArg,
    limit: Option<usize>,
    today: &str,
) -> Vec<CliTaskSummary> {
    let mut filtered: Vec<TaskMetadata> = tasks
        .into_iter()
        .filter(|task| query.is_none_or(|value| task_matches_query(task, value)))
        .filter(|task| task_matches_view(task, view.as_task_view(), today))
        .collect();

    sort_tasks_for_view(&mut filtered, view.as_task_view(), today);

    if let Some(limit) = limit {
        filtered.truncate(limit);
    }

    filtered
        .into_iter()
        .map(|task| {
            let derived_view = derive_task_view(&task, today).as_str().to_string();
            let overdue = is_task_overdue(&task, today);
            CliTaskSummary {
                id: task.id,
                title: task.title,
                description: task.description,
                link: task.link,
                waiting_for: task.waiting_for,
                created_at: task.created_at,
                action_at: task.action_at,
                schedule_bucket: task.schedule_bucket,
                completed_at: task.completed_at.clone(),
                view: derived_view,
                overdue,
                completed: task.completed_at.is_some(),
            }
        })
        .collect()
}

fn write_task_list_output(
    tasks: &[CliTaskSummary],
    format: ListFormat,
    stdout: &mut dyn Write,
) -> Result<(), String> {
    let output = match format {
        ListFormat::Table => render_task_list_table(tasks),
        ListFormat::Json => render_task_list_json(tasks),
        ListFormat::Csv => render_task_list_csv(tasks),
    };
    writeln!(stdout, "{output}").map_err(|error| error.to_string())
}

fn write_task_output(
    task: &Task,
    format: TextOrJsonFormat,
    stdout: &mut dyn Write,
) -> Result<(), String> {
    let output = match format {
        TextOrJsonFormat::Text => render_task_text(task),
        TextOrJsonFormat::Json => render_task_json(task),
    };
    writeln!(stdout, "{output}").map_err(|error| error.to_string())
}

fn resolve_full_task(notes_folder: &Path, selector: &str) -> Result<Task, String> {
    let resolved = resolve_task_selector(notes_folder, selector).map_err(selector_error_message)?;
    tasks::read_task(notes_folder, &resolved.id).map_err(|error| error.to_string())
}

fn selector_error_message(error: tasks::ResolveTaskSelectorError) -> String {
    match error {
        tasks::ResolveTaskSelectorError::NotFound { selector } => {
            format!("Task not found for selector `{selector}`.")
        }
        tasks::ResolveTaskSelectorError::Ambiguous {
            selector,
            candidates,
        } => {
            let formatted = candidates
                .into_iter()
                .map(|candidate| format!("{} ({})", candidate.title, candidate.id))
                .collect::<Vec<_>>()
                .join(", ");
            format!("Selector `{selector}` matched multiple tasks: {formatted}")
        }
    }
}

fn load_tasks_enabled(path: &Path) -> Option<bool> {
    load_settings(path.to_string_lossy().as_ref()).tasks_enabled
}

struct TaskPatchFieldArgs {
    description: Option<String>,
    clear_description: bool,
    link: Option<String>,
    clear_link: bool,
    waiting_for: Option<String>,
    clear_waiting_for: bool,
    date: Option<String>,
    clear_date: bool,
    bucket: Option<ScheduleBucketArg>,
    clear_bucket: bool,
}

fn patch_from_optional_fields(args: TaskPatchFieldArgs) -> Result<TaskPatch, String> {
    let action_at = if let Some(date) = args.date {
        Some(Some(
            local_date_to_action_at(&date).map_err(|error| error.to_string())?,
        ))
    } else if args.clear_date {
        Some(None)
    } else {
        None
    };

    let schedule_bucket = if let Some(bucket) = args.bucket {
        Some(Some(bucket.as_str().to_string()))
    } else if args.clear_bucket {
        Some(None)
    } else {
        None
    };

    Ok(TaskPatch {
        title: None,
        description: if args.clear_description {
            Some(String::new())
        } else {
            args.description
        },
        link: if args.clear_link {
            Some(String::new())
        } else {
            args.link
        },
        waiting_for: if args.clear_waiting_for {
            Some(String::new())
        } else {
            args.waiting_for
        },
        action_at,
        schedule_bucket,
        starred: None,
        due_at: None,
    })
}

fn task_patch_has_changes(patch: &TaskPatch) -> bool {
    patch.title.is_some()
        || patch.description.is_some()
        || patch.link.is_some()
        || patch.waiting_for.is_some()
        || patch.action_at.is_some()
        || patch.schedule_bucket.is_some()
}

trait TaskPatchExt {
    fn with_title(self, title: Option<String>) -> Self;
}

impl TaskPatchExt for TaskPatch {
    fn with_title(mut self, title: Option<String>) -> Self {
        self.title = title;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::app_config::save_app_config_to_path;
    use crate::persistence::workspace_settings::load_settings;
    use tempfile::TempDir;

    fn make_runtime(root: &TempDir) -> CliRuntime {
        CliRuntime {
            app_config_path: Some(root.path().join("config.json")),
            today: "2026-04-10".to_string(),
        }
    }

    fn write_app_config(runtime: &CliRuntime, notes_folder: &Path) {
        save_app_config_to_path(
            runtime.app_config_path.as_ref().expect("config path"),
            &crate::AppConfig {
                notes_folder: Some(notes_folder.to_string_lossy().into_owned()),
                ..Default::default()
            },
        )
        .expect("write config");
    }

    fn seed_tasks(notes_folder: &Path) -> (Task, Task, Task) {
        let alpha = tasks::create_task(notes_folder, "Alpha task").expect("alpha");
        let dated = tasks::create_task(notes_folder, "Plan launch").expect("dated");
        let waiting = tasks::create_task(notes_folder, "Waiting on Sam").expect("waiting");

        tasks::update_task(
            notes_folder,
            &dated.id,
            TaskPatch {
                action_at: Some(Some("2026-04-11T17:00:00Z".to_string())),
                ..Default::default()
            },
        )
        .expect("dated patch");

        tasks::update_task(
            notes_folder,
            &waiting.id,
            TaskPatch {
                waiting_for: Some("Sam".to_string()),
                schedule_bucket: Some(Some("anytime".to_string())),
                ..Default::default()
            },
        )
        .expect("waiting patch");

        (
            tasks::read_task(notes_folder, &alpha.id).expect("read alpha"),
            tasks::read_task(notes_folder, &dated.id).expect("read dated"),
            tasks::read_task(notes_folder, &waiting.id).expect("read waiting"),
        )
    }

    fn run_cli(runtime: &CliRuntime, args: &[&str]) -> (i32, String, String) {
        let argv = args
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>();
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let code = run_with_runtime(&argv, &mut stdout, &mut stderr, runtime);
        (
            code,
            String::from_utf8(stdout).expect("stdout"),
            String::from_utf8(stderr).expect("stderr"),
        )
    }

    fn unique_prefix(ids: &[&str], target: &str) -> String {
        for len in 1..=target.len() {
            let prefix = &target[..len];
            if ids
                .iter()
                .filter(|candidate| candidate.starts_with(prefix))
                .count()
                == 1
            {
                return prefix.to_string();
            }
        }
        target.to_string()
    }

    #[test]
    fn help_lists_task_and_doctor_commands() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let (code, stdout, stderr) = run_cli(&runtime, &["sly", "--help"]);

        assert_eq!(code, 0);
        assert!(stderr.is_empty());
        assert!(stdout.contains("doctor"));
        assert!(stdout.contains("task"));
    }

    #[test]
    fn task_help_lists_create_command() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let (code, stdout, stderr) = run_cli(&runtime, &["sly", "task", "--help"]);

        assert_eq!(code, 0);
        assert!(stderr.is_empty());
        assert!(stdout.contains("create"));
        assert!(stdout.contains("reschedule"));
    }

    #[test]
    fn search_alias_returns_json_rows() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let notes_folder = root.path().join("vault");
        std::fs::create_dir_all(&notes_folder).expect("notes folder");
        write_app_config(&runtime, &notes_folder);
        seed_tasks(&notes_folder);

        let (code, stdout, stderr) = run_cli(
            &runtime,
            &["sly", "task", "search", "launch", "--format", "json"],
        );

        assert_eq!(code, 0);
        assert!(stderr.is_empty());
        assert!(stdout.contains("\"title\": \"Plan launch\""));
        assert!(stdout.contains("\"view\": \"upcoming\""));
    }

    #[test]
    fn list_csv_uses_fixed_header_order() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let notes_folder = root.path().join("vault");
        std::fs::create_dir_all(&notes_folder).expect("notes folder");
        write_app_config(&runtime, &notes_folder);
        seed_tasks(&notes_folder);

        let (code, stdout, stderr) = run_cli(&runtime, &["sly", "task", "list", "--format", "csv"]);

        assert_eq!(code, 0);
        assert!(stderr.is_empty());
        assert_eq!(
            stdout.lines().next().expect("header"),
            "id,title,view,completed,overdue,actionAt,scheduleBucket,waitingFor,link,createdAt,completedAt,description"
        );
    }

    #[test]
    fn selector_resolution_handles_exact_title_prefix_and_ambiguity() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let notes_folder = root.path().join("vault");
        std::fs::create_dir_all(&notes_folder).expect("notes folder");
        write_app_config(&runtime, &notes_folder);
        let first = tasks::create_task(&notes_folder, "Ship beta").expect("first");
        let second = tasks::create_task(&notes_folder, "Ship stable").expect("second");

        let (code1, stdout1, stderr1) = run_cli(
            &runtime,
            &["sly", "task", "show", "Ship beta", "--format", "json"],
        );
        assert_eq!(code1, 0);
        assert!(stderr1.is_empty());
        assert!(stdout1.contains(&first.id));

        let prefix = unique_prefix(&[first.id.as_str(), second.id.as_str()], &second.id);
        let (code2, stdout2, stderr2) = run_cli(
            &runtime,
            &["sly", "task", "show", &prefix, "--format", "json"],
        );
        assert_eq!(code2, 0);
        assert!(stderr2.is_empty());
        assert!(stdout2.contains(&second.id));

        let (code3, stdout3, stderr3) = run_cli(&runtime, &["sly", "task", "show", "Ship"]);
        assert_eq!(code3, 1);
        assert!(stdout3.is_empty());
        assert!(stderr3.contains("matched multiple tasks"));
    }

    #[test]
    fn create_sets_fields_and_auto_enables_tasks() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let notes_folder = root.path().join("vault");
        std::fs::create_dir_all(&notes_folder).expect("notes folder");
        write_app_config(&runtime, &notes_folder);

        let (code, stdout, stderr) = run_cli(
            &runtime,
            &[
                "sly",
                "task",
                "create",
                "Review release notes",
                "--description",
                "Short pass",
                "--waiting-for",
                "Jordan",
                "--bucket",
                "anytime",
                "--format",
                "json",
            ],
        );

        assert_eq!(code, 0);
        assert!(stderr.is_empty());
        assert!(stdout.contains("\"title\": \"Review release notes\""));
        assert!(stdout.contains("\"scheduleBucket\": \"anytime\""));

        let settings = load_settings(notes_folder.to_string_lossy().as_ref());
        assert_eq!(settings.tasks_enabled, Some(true));
    }

    #[test]
    fn update_supports_replace_and_clear_semantics() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let notes_folder = root.path().join("vault");
        std::fs::create_dir_all(&notes_folder).expect("notes folder");
        write_app_config(&runtime, &notes_folder);
        let task = tasks::create_task(&notes_folder, "Review").expect("task");

        let (code1, stdout1, stderr1) = run_cli(
            &runtime,
            &[
                "sly",
                "task",
                "update",
                &task.id,
                "--description",
                "Needs edits",
                "--link",
                "https://example.com",
                "--date",
                "2026-04-12",
                "--format",
                "json",
            ],
        );
        assert_eq!(code1, 0);
        assert!(stderr1.is_empty());
        assert!(stdout1.contains("\"description\": \"Needs edits\""));
        assert!(stdout1.contains("\"link\": \"https://example.com\""));

        let (code2, stdout2, stderr2) = run_cli(
            &runtime,
            &[
                "sly",
                "task",
                "update",
                &task.id,
                "--clear-description",
                "--clear-link",
                "--clear-date",
                "--format",
                "json",
            ],
        );
        assert_eq!(code2, 0);
        assert!(stderr2.is_empty());
        assert!(stdout2.contains("\"description\": \"\""));
        assert!(stdout2.contains("\"link\": \"\""));
        assert!(stdout2.contains("\"actionAt\": null"));
    }

    #[test]
    fn complete_reopen_and_reschedule_work() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let notes_folder = root.path().join("vault");
        std::fs::create_dir_all(&notes_folder).expect("notes folder");
        write_app_config(&runtime, &notes_folder);
        let task = tasks::create_task(&notes_folder, "Lifecycle").expect("task");

        let (complete_code, complete_stdout, complete_stderr) = run_cli(
            &runtime,
            &["sly", "task", "complete", &task.id, "--format", "json"],
        );
        assert_eq!(complete_code, 0);
        assert!(complete_stderr.is_empty());
        assert!(complete_stdout.contains("\"completedAt\": \""));

        let (reopen_code, reopen_stdout, reopen_stderr) = run_cli(
            &runtime,
            &["sly", "task", "reopen", &task.id, "--format", "json"],
        );
        assert_eq!(reopen_code, 0);
        assert!(reopen_stderr.is_empty());
        assert!(reopen_stdout.contains("\"completedAt\": null"));

        let (reschedule_code, reschedule_stdout, reschedule_stderr) = run_cli(
            &runtime,
            &[
                "sly",
                "task",
                "reschedule",
                &task.id,
                "--bucket",
                "someday",
                "--format",
                "json",
            ],
        );
        assert_eq!(reschedule_code, 0);
        assert!(reschedule_stderr.is_empty());
        assert!(reschedule_stdout.contains("\"scheduleBucket\": \"someday\""));
    }

    #[test]
    fn delete_removes_task_and_reports_not_found() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let notes_folder = root.path().join("vault");
        std::fs::create_dir_all(&notes_folder).expect("notes folder");
        write_app_config(&runtime, &notes_folder);
        let task = tasks::create_task(&notes_folder, "Remove me").expect("task");

        let (delete_code, delete_stdout, delete_stderr) =
            run_cli(&runtime, &["sly", "task", "delete", &task.id]);
        assert_eq!(delete_code, 0);
        assert!(delete_stderr.is_empty());
        assert!(delete_stdout.contains("Deleted task"));

        let (show_code, show_stdout, show_stderr) =
            run_cli(&runtime, &["sly", "task", "show", &task.id]);
        assert_eq!(show_code, 1);
        assert!(show_stdout.is_empty());
        assert!(show_stderr.contains("Task not found"));
    }

    #[test]
    fn doctor_reports_cli_flag_source_and_json_shape() {
        let root = TempDir::new().expect("tempdir");
        let runtime = make_runtime(&root);
        let notes_folder = root.path().join("vault");
        std::fs::create_dir_all(notes_folder.join(".sly")).expect("sly dir");
        tasks::create_task(&notes_folder, "Doctor task").expect("task");

        let (code, stdout, stderr) = run_cli(
            &runtime,
            &[
                "sly",
                "--notes-folder",
                notes_folder.to_string_lossy().as_ref(),
                "doctor",
                "--format",
                "json",
            ],
        );

        assert_eq!(code, 0);
        assert!(stderr.is_empty());
        assert!(stdout.contains("\"notesFolderSource\": \"cli flag\""));
        assert!(stdout.contains("\"taskCount\": 1"));
    }

    #[test]
    fn non_cli_launch_args_stay_out_of_preflight() {
        assert!(!should_handle_cli(&["sly".to_string()]));
        assert!(!should_handle_cli(&["sly".to_string(), ".".to_string()]));
        assert!(!should_handle_cli(&[
            "sly".to_string(),
            "note.md".to_string()
        ]));
        assert!(should_handle_cli(&[
            "sly".to_string(),
            "task".to_string(),
            "list".to_string()
        ]));
        assert!(should_handle_cli(&[
            "sly".to_string(),
            "--help".to_string()
        ]));
    }
}
