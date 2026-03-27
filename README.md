<p align="left">
  <img src="./docs/assets/app-icon.png" alt="Sly app icon" width="160" />
</p>

# Sly
Sly is an editor-first markdown notes app for macOS, Windows, and Linux. It keeps your notes on disk as plain markdown files, stays fast and keyboard-friendly, and adds optional AI and Git workflows without locking your notes into a cloud service.

Sly is developed by [Wayne Vernon](https://github.com/waynevernon) as an independent fork of [Scratch](https://github.com/erictli/scratch), the original project created by Eric Li.

![macOS](https://img.shields.io/badge/platform-macOS-lightgrey) ![Windows](https://img.shields.io/badge/platform-Windows-blue) ![Linux](https://img.shields.io/badge/platform-Linux-orange)

[Releases](https://github.com/waynevernon/sly/releases) · [Report an Issue](https://github.com/waynevernon/sly/issues)

![Sly screenshot](./docs/assets/screenshot.png)

## Features

- Offline-first local notes stored as plain markdown files you own
- Rich markdown editing with source mode, wikilinks, slash commands, Mermaid, KaTeX, tables, and syntax-highlighted code blocks
- Editor-first workspace with 1, 2, and 3 pane layouts
- Keyboard-friendly workflows with a command palette and extensive shortcuts
- Fast note and folder organization with icons, sorting, drag-and-drop, manual ordering, and inline naming
- Appearance controls for theme presets, separate UI/note/code fonts, typography tuning, page width, text direction, and interface zoom
- Optional Git workflows for repository setup, status, commits, remotes, and push flows
- Optional AI editing through Claude Code, OpenAI Codex, OpenCode, and Ollama
- Standalone preview mode for opening markdown files without choosing a notes folder first
- Desktop `sly` CLI support on supported platforms
- In-app update checks and release delivery through the Tauri updater

## Platform Status

- macOS is the primary day-to-day development and validation target.
- Windows and Linux release artifacts are produced, but they are currently untested before 1.0.
- If you run Sly on Windows or Linux, treat those builds as early support until they have been manually validated.

## Installation

### macOS

Download the latest release from the [Releases](https://github.com/waynevernon/sly/releases) page, open the DMG, and drag Sly to Applications.

### Windows

Download the latest `.exe` installer from the [Releases](https://github.com/waynevernon/sly/releases) page and run it. WebView2 will be downloaded automatically if needed.

Windows builds are currently untested.

### Linux

Download the latest `.AppImage` or `.deb` from the [Releases](https://github.com/waynevernon/sly/releases) page.

Linux builds are currently untested.

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
| `Cmd/Ctrl+1`, `2`, `3` | Switch pane layout |
| `Cmd/Ctrl+\\` | Cycle workspace layout |
| `Cmd/Ctrl+=`, `-`, `0` | Zoom in, out, reset |

Open Settings → Shortcuts inside the app for the full reference.

## Build From Source

### Requirements

- Node.js 18+
- Rust stable
- Platform prerequisites for Tauri v2

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
