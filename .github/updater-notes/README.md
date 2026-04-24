Name updater-note files after the exact release tag.

Examples:

- `.github/updater-notes/v1.3.0.md`
- `.github/updater-notes/v1.4.0-beta.1.md`

When a matching file exists, the release workflow uses its contents as the
Tauri updater `notes` field inside `latest.json`.

Because `tauri-action` also uses the same body to seed the initial draft GitHub
release text, expect the draft body to start with this short updater copy.
Codex should replace or expand the GitHub release notes from commits before the
release is published.

Keep updater notes short and user-facing. One brief paragraph of one or two
sentences works best because the text appears in the in-app updater prompt.
