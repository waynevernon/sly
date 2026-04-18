<p align="left">
  <img src="./docs/assets/app-icon.png" alt="Sly app icon" width="160" />
</p>

# Sly
Sly is an editor-first markdown notes app for macOS. It keeps your notes on disk as plain markdown files, stays fast on real folders, and adds optional AI and Git workflows without turning your notes into a cloud product.

Sly is developed by [Wayne Vernon](https://github.com/waynevernon) as an independent fork of [Scratch](https://github.com/erictli/scratch), the original project created by Eric Li.

![macOS](https://img.shields.io/badge/platform-macOS-lightgrey)

[Releases](https://github.com/waynevernon/sly/releases) · [Report an Issue](https://github.com/waynevernon/sly/issues)

![Sly screenshot](./docs/assets/screenshot.png)

## Features

- Plain markdown notes you own. Open a folder, work directly with `.md` files on disk, and keep your notes usable outside the app.
- A serious writing and editing surface. Sly combines a polished rich editor with markdown source mode, Focus Mode, wikilinks, slash commands, Mermaid diagrams, KaTeX math, tables, inline link editing, image support, and syntax-highlighted code blocks.
- Fast navigation through large note collections. Full-text search, command palette workflows, recent notes, find-in-note, better keyboard folder navigation, and keyboard-first shortcuts keep you moving without digging through menus.
- A lightweight task mode when notes turn into action. Enable the beta tasks view to capture work in an inbox, sort it into Today, Upcoming, Someday, Waiting, and Logbook, and keep task notes in plain markdown inside your vault.
- Flexible organization that still feels lightweight. Use pinned and recent notes, a dedicated pinned notes view, recursive folder views, per-folder note sorting, folder sorting, note counts, drag-and-drop, multi-note move/delete, rename and duplicate commands, and customizable folder icons with color or emoji.
- Editor-first layouts that adapt to how you work. Switch between 1, 2, and 3 pane views, detach notes into their own windows, tune editor width, and keep folders, note lists, outline, assistant, and the current note visible in the balance you want.
- Optional AI help without AI lock-in. Use the built-in side assistant or run note editing flows through Claude Code, OpenAI Codex, OpenCode, or Ollama when you want assistance, while keeping plain files and local workflows at the center.
- Built-in Git workflows for notes on disk. Initialize a repo, inspect status, commit changes, configure remotes, and push without leaving the app.
- Deep workspace customization. Choose from a growing set of theme presets, bundled fonts, separate UI/note/code font controls, typography tuning, text direction, and interface zoom.
- Useful desktop extras. Open markdown files in standalone preview mode before choosing a notes folder, use the dedicated print preview window for PDF export, install the `sly` CLI on supported platforms to launch notes and manage tasks, and get in-app update checks through the Tauri updater.

## Installation

### macOS

Install stable from Homebrew:

```bash
brew tap waynevernon/sly
brew install --cask waynevernon/sly/sly
```

Install the beta channel from Homebrew:

```bash
brew tap waynevernon/sly
brew install --cask waynevernon/sly/sly@beta
```

The beta channel follows whichever published release is newer between the latest stable and latest beta, so stable promotions flow through automatically. Homebrew stable and beta installs conflict by design, so install one channel or the other.

If you prefer a direct install, download the latest DMG from the [Releases](https://github.com/waynevernon/sly/releases) page, open it, and drag Sly to Applications.

## Keyboard Shortcuts

Sly is designed to stay usable from the keyboard. A few of the core shortcuts:

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+N` | Create a new note |
| `Cmd/Ctrl+P` | Open the command palette |
| `Cmd/Ctrl+F` | Find in the current note |
| `Cmd/Ctrl+Shift+F` | Search notes |
| `Cmd/Ctrl+Shift+M` | Toggle markdown source mode |
| `Cmd/Ctrl+Shift+Enter` | Toggle focus mode |
| `Cmd/Ctrl+,` | Open settings |
| `Cmd/Ctrl+Shift+J`, `K`, `L` | Switch to 1, 2, or 3 panes |
| `Cmd/Ctrl+\\` | Cycle workspace layout |
| `Cmd/Ctrl+=`, `-`, `0` | Zoom in, out, reset |

Open Settings → Shortcuts inside the app for the full reference.

## CLI

On macOS, install the CLI from Settings → Assistant & CLI. The `sly` command keeps the existing launch behavior for the app:

- `sly` launches Sly
- `sly .` opens a notes folder
- `sly file.md` opens a markdown file

Task management commands:

```bash
sly doctor [--format table|json]
sly [--notes-folder PATH] task list [--view all|inbox|today|upcoming|waiting|anytime|someday|completed] [-q QUERY] [-n N] [--format table|json|csv]
sly [--notes-folder PATH] task search QUERY [--view all|inbox|today|upcoming|waiting|anytime|someday|completed] [-n N] [--format table|json|csv]
sly [--notes-folder PATH] task show SELECTOR [--format text|json]
sly [--notes-folder PATH] task create TITLE [--description TEXT] [--link URL] [--waiting-for TEXT] [--date YYYY-MM-DD | --bucket anytime|someday] [--format text|json]
sly [--notes-folder PATH] task update SELECTOR [--title TEXT] [--description TEXT | --clear-description] [--link URL | --clear-link] [--waiting-for TEXT | --clear-waiting-for] [--date YYYY-MM-DD | --clear-date] [--bucket anytime|someday | --clear-bucket] [--format text|json]
sly [--notes-folder PATH] task complete SELECTOR [--format text|json]
sly [--notes-folder PATH] task reopen SELECTOR [--format text|json]
sly [--notes-folder PATH] task reschedule SELECTOR (--date YYYY-MM-DD | --bucket anytime|someday | --clear) [--format text|json]
sly [--notes-folder PATH] task delete SELECTOR
```

Selector resolution order for single-task commands:

1. Exact UUID
2. Exact title
3. Unique UUID prefix
4. Unique case-insensitive title fragment

Global option available before any subcommand:

- `--notes-folder PATH`: use a specific notes folder instead of the folder saved in Sly app config

`doctor` options:

- `--format table|json`: show discovery details as a terminal report or machine-readable JSON

`task list` options (`task search` is an alias that takes the query as a positional argument):

- `-q`/`--query TEXT`: filter tasks by text across title, description, link, and waiting-for
- `--view ...`: filter to one task horizon or bucket
- `-n`/`--limit N`: cap the number of returned tasks
- `--format table|json|csv`: choose human-readable table output or machine-readable JSON/CSV

`task show` options:

- `SELECTOR`: exact UUID, exact title, unique UUID prefix, or unique case-insensitive title fragment
- `--format text|json`: show a terminal-friendly view or the full task object

`task create` options:

- `TITLE`: task title
- `--description TEXT`: set description
- `--link URL`: set link
- `--waiting-for TEXT`: mark the task as waiting on someone or something
- `--date YYYY-MM-DD`: schedule the task for a specific day
- `--bucket anytime|someday`: assign an unscheduled horizon bucket
- `--format text|json`: print terminal text or the full task object

`task update` options:

- `SELECTOR`: same selector rules as `task show`
- `--title TEXT`: replace the title
- `--description TEXT` or `--clear-description`: replace or clear the description
- `--link URL` or `--clear-link`: replace or clear the link
- `--waiting-for TEXT` or `--clear-waiting-for`: replace or clear the waiting-for field
- `--date YYYY-MM-DD` or `--clear-date`: replace or clear the scheduled day
- `--bucket anytime|someday` or `--clear-bucket`: replace or clear the schedule bucket
- `--format text|json`: print terminal text or the full task object

`task complete`, `task reopen`, and `task reschedule` options:

- `SELECTOR`: same selector rules as `task show`
- `task complete` / `task reopen`: toggle completion state
- `task reschedule --date YYYY-MM-DD`: assign a specific day
- `task reschedule --bucket anytime|someday`: assign a bucket instead of a date
- `task reschedule --clear`: clear both date and bucket
- `--format text|json`: print terminal text or the full task object

Examples:

```bash
# Show discovery and task-store status
sly doctor

# Use a specific vault without changing the app's saved folder
sly --notes-folder ~/Notes task list --view today

# Capture a new task directly into Anytime
sly task create "Plan launch notes" --bucket anytime

# Search tasks as JSON for scripting
sly task search launch --format json

# Schedule a task for a specific day
sly task reschedule "Plan launch notes" --date 2026-04-12

# Mark a task complete by UUID prefix
sly task complete 0195d9f1
```

## Build From Source

### Requirements

- macOS
- Node.js 18+
- Rust stable
- Xcode command line tools

### Local development

```bash
git clone https://github.com/waynevernon/sly.git
cd sly
npm install
npm run tauri dev
```

### Local verification

```bash
npm run verify
cd src-tauri
cargo test
cargo check
cargo clippy --all-targets --all-features -- -D warnings
```

## Credits

- Sly is maintained by [Wayne Vernon](https://github.com/waynevernon).
- Sly builds on [Scratch](https://github.com/erictli/scratch), the original project created by Eric Li.
- Scratch's original work remains credited under the MIT license.

## License

[MIT](./LICENSE)
