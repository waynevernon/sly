# Sly - Development Guide

## Project Overview

Sly is a cross-platform markdown note-taking app for macOS, Windows, and Linux. It is built with Tauri v2 (Rust backend) and React/TypeScript/Tailwind on the frontend, with TipTap for editing and Tantivy for search.

## Tech Stack

- **Backend**: Tauri v2, Rust
- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Editor**: TipTap with markdown support
- **Search**: Tantivy full-text search engine
- **File watching**: `notify` with custom debouncing

## Commands

```bash
npm run dev          # Start Vite dev server only
npm run build        # Build frontend (tsc + vite)
npm run tauri dev    # Run full app in development mode
npm run tauri build  # Build production app
```

## CI/CD

### CI (`ci.yml`)

Runs on pushes and pull requests to `main`. Validates the frontend build (`tsc` + Vite) plus Rust compilation (`cargo check` + `cargo clippy`) on Ubuntu. It does not produce release bundles.

### Release (`release.yml`)

Runs on `v*` tag push or manual `workflow_dispatch`. Builds in parallel for:

- **macOS**: Universal binary (`arm64` + `x86_64`), code-signed and notarized
- **Windows**: NSIS installer (`x64`)
- **Linux**: AppImage and `.deb`

Creates a **draft** GitHub release with platform artifacts and `latest.json` for the auto-updater.

### Releasing a New Version

1. Bump version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
2. Commit the version bump to `main`
3. Tag and push:
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   ```
4. Wait for the release workflow to finish
5. Review the draft release on GitHub
6. Publish it so the updater can serve the new `latest.json`

### GitHub Secrets Required

These must be configured in the repo settings under `Settings > Secrets and variables > Actions`:

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` export of the Developer ID certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` export |
| `APPLE_SIGNING_IDENTITY` | Example: `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the Tauri updater private key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the updater key, if one exists |

### Auto-Updater

The app checks for updates through the Tauri updater plugin:

- Endpoint: `https://github.com/waynevernon/sly/releases/latest/download/latest.json`
- Check timing: on startup (after a short delay) and manually from Settings > About
- UX: if a newer version is found, the app shows an "Update Now" toast
- Config location: `src-tauri/tauri.conf.json` under `plugins.updater`

### Local Build

For local testing without CI:

```bash
# macOS universal binary (requires signing env vars from .env.build)
source .env.build
npm run tauri build -- --target universal-apple-darwin

# Default local build for current platform
npm run tauri build
```

## Project Structure

```text
sly/
├── .github/workflows/             # CI and release automation
├── src/                           # React frontend
│   ├── components/
│   │   ├── editor/                # TipTap editor, toolbars, popovers, syntax helpers
│   │   ├── layout/                # Multi-pane workspace shell and pane components
│   │   ├── notes/                 # Note list and folder tree UI
│   │   ├── folders/               # Folder icons and icon picker
│   │   ├── settings/              # Settings screens
│   │   ├── ai/                    # AI edit modal and response toast
│   │   ├── preview/               # Single-file preview mode
│   │   ├── ui/                    # Shared UI primitives
│   │   └── icons/                 # Shared icon components
│   ├── context/                   # React context providers
│   ├── lib/                       # Appearance, emoji, folder tree, and utility helpers
│   ├── services/                  # Tauri command wrappers
│   ├── types/                     # Shared TypeScript types
│   ├── App.tsx                    # Main app component
│   └── main.tsx                   # React entrypoint
├── src-tauri/                     # Rust backend
│   ├── src/
│   │   ├── lib.rs                 # Tauri commands, state, file watcher, search
│   │   └── git.rs                 # Git CLI wrapper
│   ├── capabilities/default.json  # Tauri permissions config
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/                          # Design and supporting documentation
└── package.json
```

## Key Patterns

### Tauri Commands

All backend operations go through Tauri commands in `src-tauri/src/lib.rs`. Frontend code calls them via `invoke()` from `@tauri-apps/api/core`.

### State Management

- `NotesContext` manages note state, CRUD, search, file watching, and folder operations
- `GitContext` manages Git availability, status, commit, and sync flows
- `ThemeContext` manages theme mode, theme presets, fonts, typography, text direction, editor width, interface zoom, and pane mode

### Settings Storage

- **App config**: `{APP_DATA}/config.json`
- **Per-folder settings**: `{NOTES_FOLDER}/.sly/settings.json`

The settings UI currently covers:

- Theme mode and theme presets
- Separate UI / note / code font controls
- Typography tuning
- Text direction
- Editor width
- Pane mode (`1 / 2 / 3`)
- Folder icons
- Note and folder sorting
- Git integration
- Keyboard shortcuts reference
- App version and update checks

### Editor Features

- Auto-save with debounce
- Markdown source mode
- Focus mode
- Wikilinks
- Slash commands
- Mermaid rendering
- KaTeX math
- Table editing
- Syntax-highlighted code blocks
- Inline link editing
- Search in note
- Image insertion
- Slack-style emoji shortcode insertion
- AI editing via Claude, Codex, OpenCode, and Ollama CLIs

### Workspace Architecture

- `WorkspaceNavigation` is the main shell for the multi-pane layout
- `FoldersPane` owns folder navigation, folder tree, and footer actions
- `NotesPane` owns note search, sorting, and note list interactions
- `Editor` remains the primary working plane

### Command Reference

**Note Management:** `list_notes`, `read_note`, `save_note`, `delete_note`, `create_note`, `move_note`

**Folder Management:** `list_folders`, `create_folder`, `delete_folder`, `rename_folder`, `move_folder`

**Configuration:** `get_notes_folder`, `set_notes_folder`, `get_settings`, `update_settings`, `get_appearance_settings`, `update_appearance_settings`

**Search:** `search_notes`, `rebuild_search_index`

**File Watching:** `start_file_watcher`

**Git:** `git_is_available`, `git_get_status`, `git_init_repo`, `git_commit`, `git_push`, `git_add_remote`, `git_push_with_upstream`

**AI:** `ai_check_claude_cli`, `ai_execute_claude`, `ai_check_codex_cli`, `ai_execute_codex`, `ai_check_opencode_cli`, `ai_execute_opencode`, `ai_check_ollama_cli`, `ai_execute_ollama`

**Utilities:** `copy_to_clipboard`, `copy_image_to_assets`, `save_clipboard_image`

**UI Helpers:** `open_folder_dialog`, `open_in_file_manager`, `open_url_safe`, `open_file_preview`

## Keyboard Shortcuts

- `Cmd+N` - New note
- `Cmd+P` - Command palette
- `Cmd+K` - Add/edit link
- `Cmd+F` - Find in current note
- `Cmd+Shift+C` - Open Copy & Export menu
- `Cmd+Shift+M` - Toggle Markdown source mode
- `Cmd+Shift+Enter` - Toggle Focus mode
- `Cmd+Shift+F` - Search notes
- `Cmd+R` - Reload current note
- `Cmd+,` - Open settings
- `Cmd+1/2/3/4` - Switch settings tabs
- `Cmd+\` - Toggle sidebar
- `Cmd+B/I` - Bold/Italic
- `Cmd+=` - Zoom in
- `Cmd+-` - Zoom out
- `Cmd+0` - Reset zoom

On Windows and Linux, use `Ctrl` instead of `Cmd`.

## Development Philosophy

### Code Quality

- Keep the codebase clean and direct
- Prefer shared primitives and shared patterns over local one-offs
- Maintain type safety throughout the frontend and backend
- Avoid commented-out code and TODO-driven dead branches in production code
- Prefer idiomatic, clean solutions over workarounds; if a workaround is the only viable path, flag it explicitly before proceeding

### Performance

- Auto-save is debounced
- Search is debounced
- File watcher events are debounced
- Git status refresh is debounced
- Expensive list rendering should stay memoized where it matters

### UX

- Preserve the editor-first layout
- Keep interaction keyboard-friendly
- Favor calm hierarchy over decorative chrome
- Keep async work non-blocking and surface errors clearly

## UI Design Reference

Before changing user-facing UI, consult `docs/ui-design-language.md`. Treat it as the canonical design-language reference. Do not duplicate UI rules here unless they are repo-wide engineering constraints rather than design-language guidance.
