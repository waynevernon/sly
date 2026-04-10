/// Returns the byte offset just after the closing `---` of a YAML frontmatter block,
/// or `None` if the content does not begin with a valid `---` … `---` block.
///
/// The returned slice starts on the first character after the closing delimiter
/// (including the newline that follows it, if any).
pub(crate) fn strip_frontmatter(content: &str) -> Option<&str> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = trimmed.strip_prefix("---")?;
    // The opening `---` must be followed by a newline (not more dashes).
    if !rest.starts_with('\n') && !rest.starts_with('\r') {
        return None;
    }
    let end = rest.find("\n---")?;
    let after_close = &rest[end + 4..]; // skip `\n---`
    Some(
        after_close
            .strip_prefix("\r\n")
            .or_else(|| after_close.strip_prefix('\n'))
            .unwrap_or(after_close),
    )
}

/// Extract the raw YAML text between the opening and closing `---` markers.
/// Returns `None` if the content does not have a valid frontmatter block.
pub(crate) fn extract_frontmatter_block(content: &str) -> Option<&str> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = trimmed.strip_prefix("---")?;
    if !rest.starts_with('\n') && !rest.starts_with('\r') {
        return None;
    }
    // Rest starts with the newline after the opening ---
    let inner_start = if rest.starts_with("\r\n") { 2 } else { 1 };
    let end = rest.find("\n---")?;
    Some(&rest[inner_start..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_removes_frontmatter() {
        let content = "---\ntitle: Test\n---\n# Body";
        assert_eq!(strip_frontmatter(content), Some("# Body"));
    }

    #[test]
    fn strip_no_frontmatter_returns_none() {
        assert_eq!(strip_frontmatter("# Just markdown"), None);
    }

    #[test]
    fn strip_handles_crlf() {
        let content = "---\r\ntitle: Test\r\n---\r\nBody";
        assert!(strip_frontmatter(content).is_some());
    }

    #[test]
    fn extract_block_returns_inner_yaml() {
        let content = "---\ntitle: Hello\naction_at: 2026-04-10\n---\nBody";
        let block = extract_frontmatter_block(content).unwrap();
        assert!(block.contains("title: Hello"));
        assert!(block.contains("action_at: 2026-04-10"));
    }
}
