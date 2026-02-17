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
