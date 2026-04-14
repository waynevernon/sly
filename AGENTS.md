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
npm run lint         # Run lightweight frontend lint checks
npm run test         # Run frontend unit/component tests once
npm run verify       # Run lint + frontend tests + frontend build
npm run tauri dev    # Run full app in development mode
npm run tauri build  # Build production app
cargo test           # Run Rust unit tests
```

## CI/CD

### CI (`ci.yml`)

Runs on pushes and pull requests to `main`. It has two lightweight gates on Ubuntu:

- **Frontend job**: `npm ci`, `npm run lint`, `npm run test`, `npm run build`
- **Rust job**: `cargo test`, `cargo check`, `cargo clippy --all-targets --all-features -- -D warnings`

It does not produce release bundles.

### Release (`release.yml`)

Runs on `v*` tag push or manual `workflow_dispatch`. Builds in parallel for:

- **macOS**: Universal binary (`arm64` + `x86_64`), code-signed and notarized
- **Windows**: NSIS installer (`x64`)
- **Linux**: AppImage and `.deb`

Release behavior:

- Tags must exactly match `package.json` version prefixed with `v` or the workflow fails.
- Tags containing `-` are treated as **beta** prereleases. Tags without `-` are treated as **stable** releases.
- The workflow reads `.github/updater-notes/<tag>.md` when it exists and uses that file as the updater `notes` field inside `latest.json`.
- Because `tauri-action` uses the same text to seed the initial draft GitHub release body, the draft release starts with the updater note and must be replaced or expanded before publishing.
- If no matching updater-notes file exists, the updater falls back to `A new version is ready to install.`
- The workflow sets the updater channel at build time:
  - **stable builds** point to `https://github.com/waynevernon/sly/releases/latest/download/latest.json`
  - **beta builds** point to `https://raw.githubusercontent.com/waynevernon/sly/updater-beta/latest.json`
- The workflow creates a **draft** GitHub release with platform artifacts and `latest.json` for the auto-updater.
- The **beta update track** should always point to whichever published release is newer between the latest stable release and the latest published beta release.

Publishing behavior after the draft release exists:

- Publishing **any** release triggers `update-homebrew-tap.yml`
- Publishing **any** release also refreshes the beta updater manifest so the beta track can follow the newer of the latest stable and latest published beta release

Current release posture before 1.0:

- **macOS** is the primary validated platform
- **Windows** and **Linux** artifacts are built in CI, but they are still considered manually untested until explicitly checked before release

### Releasing a New Version

1. Bump the version everywhere it is user-visible or locked:
   - `package.json`
   - `package-lock.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
   - `src-tauri/tauri.conf.json`
2. Add the updater-note seed file for the exact tag you plan to publish:
   - stable example: `.github/updater-notes/v1.3.0.md`
   - beta example: `.github/updater-notes/v1.4.0-beta.1.md`
   - start from `.github/updater-notes/TEMPLATE.md`
   - write 2–3 sentences of continuous prose with no line breaks — the same text appears verbatim in the in-app updater prompt, so it should read naturally as a short paragraph, not a bulleted list
   - keep it user-facing and conversational; avoid changelog-style fragments
3. Run the expected local confidence checks before tagging:
   ```bash
   npm run verify
   cargo test
   cargo check
   cargo clippy --all-targets --all-features -- -D warnings
   ```
4. Review `README.md` and update it for any meaningful product changes in the release:
   - keep the most important user-facing capabilities near the top
   - use concise UX writing rather than internal implementation language
   - avoid long feature inventories; roll closely related features into a single bullet when possible
   - preserve a clear hierarchy so the README reflects the app as it exists now, not as an accumulated changelog
5. Commit the release bump, updater-notes file, and any README updates to `main`.
6. Create and push the version tag:
   ```bash
   git push origin main
   git tag v1.0.0
   git push origin v1.0.0
   ```
7. Monitor both GitHub Actions workflows and do not publish until both are green:
   ```bash
   gh run list --limit 6
   gh run watch <ci-run-id> --exit-status
   gh run watch <release-run-id> --exit-status
   ```
8. If either workflow fails, inspect the failing job, fix the issue on `main`, push the fix, and retag only when the release path is clean again. Do not publish a failed or partial draft release.
9. Generate the full GitHub release notes from commits and update the draft release body before publishing. The short updater note from `.github/updater-notes/<tag>.md` is only seed text for the draft and does **not** replace proper GitHub release notes. Editing the GitHub draft body later does **not** rewrite the already-generated updater `latest.json`.
   - stable releases: write notes from the previous stable tag to `HEAD`
   - beta prereleases: write notes from the last stable tag to `HEAD`, not from the previous beta tag
   - treat beta notes as a running draft of the next stable release, so each new beta rewrites the full accumulated beta notes instead of only appending the latest beta delta
10. Publish the release from the CLI:
   - stable:
     ```bash
     gh release edit v1.0.0 --draft=false --latest --verify-tag
     ```
   - beta prerelease:
     ```bash
     gh release edit v1.4.0-beta.1 --draft=false --verify-tag
     ```
11. After publishing, monitor the follow-on publish workflows and wait for them to finish:
   - all releases: `update-homebrew-tap.yml`
   - all releases: `update-beta-updater.yml`
   ```bash
   gh run list --limit 10
   gh run watch <publish-run-id> --exit-status
   ```
12. Do not consider the release complete until those follow-on workflows are green:
   - stable releases need the GitHub release published successfully and the Homebrew tap updated
   - stable releases also need the beta track refreshed so beta installs can pick up the new stable if it is newer than the last beta
   - beta prereleases need the GitHub release published successfully, the Homebrew tap updated, and the `updater-beta` manifest refreshed
13. After a beta prerelease is fully green and published, unpublish older beta releases to keep the releases page clean without deleting history:
   - move previous beta releases back to draft with `gh release edit <old-beta-tag> --draft`
   - keep the historical tags by default
   - only use `gh release delete <old-beta-tag> --yes` if you explicitly want to remove the old release object entirely
   - do **not** pass `--cleanup-tag` unless you explicitly intend to remove the historical tag too

Helpful commands while drafting release notes:

```bash
git log --oneline --reverse v0.9.0..HEAD
git tag --list 'v*' --sort=-version:refname
gh release view v0.9.0 --json name,body
gh release edit v1.0.0 --title "Sly v1.0.0" --notes-file /tmp/release-notes.md
gh release edit v1.0.0 --draft=false --latest --verify-tag
gh release edit v1.4.0-beta.1 --draft=false --verify-tag
```

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

- Stable endpoint: `https://github.com/waynevernon/sly/releases/latest/download/latest.json`
- Beta endpoint: `https://raw.githubusercontent.com/waynevernon/sly/updater-beta/latest.json`
- Check timing: on startup (after a short delay) and manually from Settings > About
- UX: if a newer version is found, the app shows an "Update Now" toast with short release notes from `latest.json.notes`
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
│   │   └── persistence/           # Config/settings schema migration and canonicalization
│   ├── capabilities/default.json  # Tauri permissions config
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/                          # Design and supporting documentation
└── package.json
```

## Key Patterns

### Tauri Commands

All backend operations go through Tauri commands in `src-tauri/src/lib.rs`. Frontend code calls them via `invoke()` from `@tauri-apps/api/core`.

Prefer service wrappers in `src/services/` over calling `invoke()` directly from components. Tests should usually target those service wrappers, context logic, and pure helpers rather than raw command calls from UI code.

### State Management

- `NotesContext` manages note state, CRUD, search, file watching, and folder operations
- `GitContext` manages Git availability, status, commit, and sync flows
- `ThemeContext` manages theme mode, theme presets, fonts, typography, text direction, editor width, interface zoom, and pane mode
- Async loads tied to folder, note, or workspace identity must use stale-request guards so older responses cannot overwrite newer state.

### Settings Storage

- **App config**: `{APP_DATA}/config.json`
- **Per-folder settings**: `{NOTES_FOLDER}/.sly/settings.json`

Persistence ownership rules:

- The Tauri backend is the only source of truth for persisted settings shape, defaults, sanitization, and migration.
- Persisted config and workspace settings use a file-level `schemaVersion`. Treat files without a version as legacy and migrate them in Rust.
- All persistence compatibility work belongs in `src-tauri/src/persistence/`, not in React contexts or components.
- Frontend code may keep small UI fallbacks for rendering, but it must not act as a second migration layer or invent persisted defaults on load.
- When adding a persisted field, update the Rust struct, migration/canonicalization path, Tauri command payload, and the matching TypeScript type together.
- When changing the meaning, name, or shape of persisted data, add an explicit backend migration step and a Rust test with a legacy JSON fixture.
- `serde(default)` is fine for additive fields with obvious defaults. Renames, moved fields, default rewrites, enum/value changes, or cleanup of legacy invalid data should be handled explicitly in backend migration/canonicalization.
- Load flow for persisted files should stay: read raw JSON, migrate raw value to latest schema, deserialize latest struct, canonicalize, and write back only if the canonical form changed.

The settings UI currently covers:

- Theme mode and theme presets
- Separate UI / note / code font controls
- Typography tuning
- Text direction
- Editor width
- Interface zoom
- Pane mode (`1 / 2 / 3`)
- Note preview line density
- Confirm-delete behavior
- Folder icons
- Note and folder sorting
- Git integration
- AI provider detection
- CLI tool installation on supported platforms
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

**Configuration:** `get_notes_folder`, `set_notes_folder`, `get_settings`, `patch_settings`, `update_settings`, `get_appearance_settings`, `update_appearance_settings`, `preview_note_name`

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
- `Cmd+Opt+1/2/3/4/5` - Switch settings tabs
- `Cmd+1/2/3` - Switch pane layout
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
- Core interactions must not be implemented as non-tabbable `div`s with `role="button"`. Use native interactive elements when possible, or a documented composite pattern with keyboard semantics when custom rows are required.
- Keep persistence changes centralized: schema, migration, and canonicalization belong in Tauri, while React should consume canonical data rather than re-normalizing persisted payloads
- Avoid commented-out code and TODO-driven dead branches in production code
- Prefer idiomatic, clean solutions over workarounds; if a workaround is the only viable path, flag it explicitly before proceeding
- Prefer small, testable helper functions over large monolithic branches when logic is easy to isolate

### Testing

- Keep testing lightweight. This is a solo side project, so favor a small number of high-value automated checks over broad, fragile coverage.
- Default stack:
  - Frontend linting with ESLint
  - Frontend unit/component tests with Vitest + React Testing Library
  - Rust unit tests with `cargo test`
  - GitHub Actions as the automatic enforcement layer
- Do not hide tests inside `npm run build`. `build` stays build-only. Use `npm run verify` for the full frontend local check when needed.
- Prefer testing service wrappers, context behavior, pure helpers, and small settings flows before reaching for large UI integration tests.
- Avoid snapshot-heavy tests and brittle DOM tests. Use semantic queries and test user-visible behavior or command payloads.
- Mock Tauri APIs in frontend tests. Do not require a real desktop shell for routine coverage.
- Add or update tests when:
  - fixing a bug with a clear reproduction path
  - adding logic-heavy behavior in contexts, services, search, settings, folder ordering, or filename/path handling
  - changing persistence rules, command payloads, or sanitization/validation logic
- You do not need a new test for every presentational UI tweak. Visual polish changes can rely on manual review unless they introduce meaningful behavior.
- For Rust, prefer unit tests around pure helpers and validation logic over full command integration tests.
- For frontend, avoid deep editor internals unless the app-owned wrapper logic is isolated and stable enough to test cheaply.
- Before opening or merging a PR, the expected local confidence path is:
  - `npm run verify`
  - `cargo test`
  - `cargo check`
  - `cargo clippy --all-targets --all-features -- -D warnings`
- GitHub Actions runs the automated suite on push and pull request. Keep that path green and treat CI as the default gate.
- The expected standard before merge is zero lint warnings. If a warning is intentionally left in place, document the reason in the PR or task summary rather than silently accepting it.

### Performance

- Auto-save is debounced
- Search is debounced
- File watcher events are debounced
- Git status refresh is debounced
- Expensive list rendering should stay memoized where it matters
- Single-note changes should not trigger full-vault rescans when incremental metadata or index updates are possible.

### UX

- Preserve the editor-first layout
- Keep interaction keyboard-friendly
- Favor calm hierarchy over decorative chrome
- Keep async work non-blocking and surface errors clearly

## UI Design Reference

Before changing user-facing UI, consult `docs/ui-design-language.md`. Treat it as the canonical design-language reference. Do not duplicate UI rules here unless they are repo-wide engineering constraints rather than design-language guidance.
