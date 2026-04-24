use std::{
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::error::AppError;

pub fn now_iso() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    ts.to_string()
}

pub fn home_dir() -> Result<PathBuf, AppError> {
    let home = env::var("HOME")
        .map_err(|_| AppError::NotFound("Unable to resolve HOME directory".to_string()))?;
    Ok(PathBuf::from(home))
}

pub fn expand_home(path: &str) -> Result<PathBuf, AppError> {
    if let Some(stripped) = path.strip_prefix("~/") {
        return Ok(home_dir()?.join(stripped));
    }
    Ok(PathBuf::from(path))
}

pub fn ensure_dir(path: &Path) -> Result<(), AppError> {
    fs::create_dir_all(path)?;
    Ok(())
}

pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut dash = false;

    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !dash {
            out.push('-');
            dash = true;
        }
    }

    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "skill".to_string()
    } else {
        out
    }
}

pub fn unique_dir(base: &Path, preferred: &str) -> PathBuf {
    let candidate = base.join(preferred);
    if !candidate.exists() {
        return candidate;
    }

    for n in 1..1000 {
        let path = base.join(format!("{}-{}", preferred, n));
        if !path.exists() {
            return path;
        }
    }

    base.join(format!("{}-{}", preferred, now_iso()))
}

pub fn unique_dir_with_timestamp_on_conflict(base: &Path, preferred: &str) -> PathBuf {
    let candidate = base.join(preferred);
    if !candidate.exists() {
        return candidate;
    }

    let ts = now_iso();
    let with_ts = base.join(format!("{}-{}", preferred, ts));
    if !with_ts.exists() {
        return with_ts;
    }

    for n in 1..1000 {
        let path = base.join(format!("{}-{}-{}", preferred, ts, n));
        if !path.exists() {
            return path;
        }
    }

    base.join(format!("{}-{}-{}", preferred, ts, now_iso()))
}

/// Check that `path` is a descendant of one of the known tool skills roots.
/// Prevents path traversal attacks that could read/write/delete arbitrary files.
pub fn is_path_under_skills_root(
    path: &Path,
    app: &tauri::AppHandle,
) -> Result<(), AppError> {
    use crate::tools::resolve_tools;

    let canonical = path.canonicalize().map_err(|_| {
        AppError::InvalidPath(format!("Invalid path: {}", path.display()))
    })?;

    let tools = resolve_tools(app)?;
    for tool in &tools {
        let skills_root = PathBuf::from(&tool.skills_path);
        if let Ok(root) = skills_root.canonicalize() {
            if canonical.starts_with(&root) {
                return Ok(());
            }
        }
    }

    Err(AppError::InvalidPath(format!(
        "Path {} is not under any known skills directory",
        path.display()
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Hello World"), "hello-world");
        assert_eq!(slugify("  My Skill  "), "my-skill");
        assert_eq!(slugify("foo / bar!"), "foo-bar");
    }

    #[test]
    fn slugify_collapses_separators() {
        assert_eq!(slugify("a   b---c"), "a-b-c");
        assert_eq!(slugify("__weird__name__"), "weird-name");
    }

    #[test]
    fn slugify_keeps_ascii_alphanumeric() {
        assert_eq!(slugify("ABC123"), "abc123");
        assert_eq!(slugify("x_y_z"), "x-y-z");
    }

    #[test]
    fn slugify_empty_falls_back_to_skill() {
        assert_eq!(slugify(""), "skill");
        assert_eq!(slugify("   "), "skill");
        assert_eq!(slugify("!!!"), "skill");
    }

    #[test]
    fn slugify_non_ascii_treated_as_separator() {
        // Non-ASCII characters become separators; pure non-ASCII input has
        // no alphanumerics left, so falls back to "skill".
        assert_eq!(slugify("café"), "caf");
        assert_eq!(slugify("中文"), "skill");
    }

    #[test]
    fn expand_home_non_tilde_passthrough() {
        let p = expand_home("/abs/path").unwrap();
        assert_eq!(p, PathBuf::from("/abs/path"));
        let p = expand_home("relative/path").unwrap();
        assert_eq!(p, PathBuf::from("relative/path"));
    }

    #[test]
    fn unique_dir_returns_preferred_when_free() {
        let tmp = env::temp_dir().join(format!("skillsyoga-test-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let got = unique_dir(&tmp, "my-skill");
        assert_eq!(got, tmp.join("my-skill"));
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn unique_dir_suffixes_on_conflict() {
        let tmp = env::temp_dir().join(format!("skillsyoga-test-conflict-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        fs::create_dir_all(tmp.join("my-skill")).unwrap();
        let got = unique_dir(&tmp, "my-skill");
        assert_eq!(got, tmp.join("my-skill-1"));
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn now_iso_returns_nonempty_digits() {
        let s = now_iso();
        assert!(!s.is_empty());
        assert!(s.chars().all(|c| c.is_ascii_digit()));
    }
}
