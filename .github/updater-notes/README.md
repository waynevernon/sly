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

Write about what changed for the person using Sly, not how the change was
implemented. Avoid framework names, PR wording, low-level bug descriptions, and
engineering shorthand unless the user needs that detail to understand the
release.

Before committing an updater note, do a humanizer-style pass:

- remove AI-ish filler, excessive hype, and vague "polish" language
- replace technical commits with plain product outcomes
- avoid rule-of-three phrasing, em dash overuse, and title/PR residue
- read it aloud and make sure it sounds like a person wrote it for Sly users

Use the same standard for the full GitHub release notes before publishing the
draft release. The GitHub notes can be longer, but they should still be grouped
around user workflows and written in clear product language.
