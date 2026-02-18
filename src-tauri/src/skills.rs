use std::{
    collections::{HashMap, HashSet},
    fs, io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::error::AppError;
use crate::helpers::now_iso;
use crate::models::{DiscoveredSkillsRoot, SkillInfo, ToolInfo};

/// Extract the display name from a directory path, falling back to "skill".
pub fn dir_display_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "skill".to_string())
}

/// Parsed metadata from a SKILL.md file per the Agent Skills spec.
/// See https://agentskills.io/specification
pub struct SkillMeta {
    pub name: String,
    pub description: String,
}

/// Split content into optional YAML frontmatter and markdown body.
fn split_frontmatter(content: &str) -> (Option<&str>, &str) {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (None, content);
    }
    let after_open = &trimmed[3..];
    match after_open.find("\n---") {
        Some(pos) => {
            let fm = after_open[..pos].trim();
            let body_start = pos + 4; // skip \n---
            let body = if body_start < after_open.len() {
                after_open[body_start..].trim_start_matches(['\r', '\n'])
            } else {
                ""
            };
            (Some(fm), body)
        }
        None => (None, content),
    }
}

/// Extract a top-level YAML string value, handling inline values and
/// multi-line folded/literal blocks with indented continuation lines.
/// Supports: `key: value`, `key: "value"`, `key: 'value'`,
///           `key: >\n  continued`, `key: |\n  continued`.
fn yaml_string_value(frontmatter: &str, key: &str) -> Option<String> {
    let prefix = format!("{}:", key);
    let mut lines = frontmatter.lines();

    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if !trimmed.starts_with(&prefix) {
            continue;
        }
        let after_key = trimmed[prefix.len()..].trim();

        // Block scalar: > (folded) or | (literal)
        if after_key == ">" || after_key == "|" {
            let mut parts = vec![];
            for cont in lines.by_ref() {
                if cont.starts_with(' ') || cont.starts_with('\t') {
                    parts.push(cont.trim());
                } else {
                    break;
                }
            }
            let joined = parts.join(" ");
            if !joined.is_empty() {
                return Some(joined);
            }
            return None;
        }

        // Inline value
        let v = after_key.trim_matches('"').trim_matches('\'').to_string();
        if !v.is_empty() {
            return Some(v);
        }
        return None;
    }
    None
}

/// Parse SKILL.md content following the Agent Skills spec.
/// Extracts `name` and `description` from YAML frontmatter.
/// Falls back to first `#` heading for name and first body paragraph
/// for description when frontmatter fields are missing (legacy files).
pub fn parse_skill_metadata(content: &str, fallback_name: &str) -> SkillMeta {
    let (frontmatter, body) = split_frontmatter(content);

    let fm_name = frontmatter.and_then(|fm| yaml_string_value(fm, "name"));
    let fm_desc = frontmatter.and_then(|fm| yaml_string_value(fm, "description"));

    let name = fm_name.unwrap_or_else(|| {
        body.lines()
            .find(|line| line.starts_with('#'))
            .map(|line| line.trim_start_matches('#').trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| fallback_name.to_string())
    });

    let description = fm_desc.unwrap_or_else(|| {
        for line in body.lines() {
            let t = line.trim();
            if t.is_empty() || t.starts_with('#') {
                continue;
            }
            if t.chars().all(|c| matches!(c, '-' | '=' | '*' | '_')) {
                continue;
            }
            return t.to_string();
        }
        "No description".to_string()
    });

    SkillMeta { name, description }
}

pub fn collect_skills_from_tool(tool: &ToolInfo) -> Result<Vec<SkillInfo>, AppError> {
    let root = PathBuf::from(&tool.skills_path);
    if !root.exists() || !root.is_dir() {
        return Ok(vec![]);
    }

    let mut skills = vec![];

    let root_skill_file = root.join("SKILL.md");
    if root_skill_file.exists() {
        let content = fs::read_to_string(&root_skill_file)?;
        let dir_name = dir_display_name(&root);
        let skill_meta = parse_skill_metadata(&content, &dir_name);
        let file_meta = fs::metadata(&root_skill_file).ok();
        let modified = file_meta
            .and_then(|m| m.modified().ok())
            .and_then(|s| s.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(now_iso);

        skills.push(SkillInfo {
            id: format!("{}:{}", tool.id, dir_name),
            name: skill_meta.name,
            description: skill_meta.description,
            path: root.to_string_lossy().to_string(),
            source: tool.id.clone(),
            enabled_for: vec![tool.id.clone()],
            updated_at: modified,
        });
    }

    let entries = fs::read_dir(&root)?;
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let skill_file = path.join("SKILL.md");
        if !skill_file.exists() {
            continue;
        }

        let content = fs::read_to_string(&skill_file)?;

        let dir_name = dir_display_name(&path);
        let skill_meta = parse_skill_metadata(&content, &dir_name);

        let file_meta = fs::metadata(&skill_file).ok();
        let modified = file_meta
            .and_then(|m| m.modified().ok())
            .and_then(|s| s.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(now_iso);

        skills.push(SkillInfo {
            id: format!("{}:{}", tool.id, dir_name),
            name: skill_meta.name,
            description: skill_meta.description,
            path: path.to_string_lossy().to_string(),
            source: tool.id.clone(),
            enabled_for: vec![tool.id.clone()],
            updated_at: modified,
        });
    }

    Ok(skills)
}

pub fn discover_skills_roots(root: &Path) -> Vec<DiscoveredSkillsRoot> {
    if !root.exists() || !root.is_dir() {
        return vec![];
    }

    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    let mut discovered: HashMap<PathBuf, usize> = HashMap::new();

    while let Some((dir, depth)) = stack.pop() {
        let has_skill_file = dir.join("SKILL.md").is_file();

        let mut child_skill_count = 0usize;
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let child = entry.path();
            if !child.is_dir() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }

            if child.join("SKILL.md").is_file() {
                child_skill_count += 1;
            }

            if depth < 6 {
                let lower = name.to_ascii_lowercase();
                if lower != "node_modules" && lower != "target" && lower != "dist" && lower != "build" {
                    stack.push((child, depth + 1));
                }
            }
        }

        if has_skill_file || child_skill_count > 0 {
            let count = if child_skill_count > 0 { child_skill_count } else { 1 };
            discovered
                .entry(dir)
                .and_modify(|existing| *existing = (*existing).max(count))
                .or_insert(count);
        }
    }

    let mut out: Vec<DiscoveredSkillsRoot> = discovered
        .into_iter()
        .map(|(path, skill_count)| DiscoveredSkillsRoot {
            path: path.to_string_lossy().to_string(),
            skill_count,
        })
        .collect();

    out.sort_by(|a, b| {
        b.skill_count
            .cmp(&a.skill_count)
            .then_with(|| a.path.len().cmp(&b.path.len()))
            .then_with(|| a.path.cmp(&b.path))
    });
    out
}

pub fn merge_skills(mut list: Vec<SkillInfo>) -> Vec<SkillInfo> {
    let mut merged: HashMap<String, SkillInfo> = HashMap::new();

    for skill in list.drain(..) {
        let key = skill.name.to_lowercase();
        if let Some(existing) = merged.get_mut(&key) {
            let mut tool_set: HashSet<String> = existing.enabled_for.iter().cloned().collect();
            for tool in skill.enabled_for {
                if tool_set.insert(tool.clone()) {
                    existing.enabled_for.push(tool);
                }
            }
        } else {
            merged.insert(key, skill);
        }
    }

    let mut out: Vec<SkillInfo> = merged.into_values().collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

pub fn discover_skill_dir(root: &Path, depth: usize) -> Option<PathBuf> {
    if depth > 4 {
        return None;
    }

    if root.join("SKILL.md").exists() {
        return Some(root.to_path_buf());
    }

    let entries = fs::read_dir(root).ok()?;
    for entry in entries {
        let path = entry.ok()?.path();
        if !path.is_dir() {
            continue;
        }
        if path
            .file_name()
            .map(|n| n.to_string_lossy().starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        if let Some(found) = discover_skill_dir(&path, depth + 1) {
            return Some(found);
        }
    }

    None
}

/// DFS to find a directory matching `name` that contains a SKILL.md file.
/// Handles varied repo structures (skills/{id}/, {id}/, or nested).
pub fn discover_skill_dir_by_name(root: &Path, name: &str, depth: usize) -> Option<PathBuf> {
    if depth > 4 {
        return None;
    }

    if root.is_dir() {
        let dir_name = root.file_name().map(|n| n.to_string_lossy().to_string());
        if let Some(ref dn) = dir_name {
            if dn == name && root.join("SKILL.md").exists() {
                return Some(root.to_path_buf());
            }
        }
    }

    let entries = fs::read_dir(root).ok()?;
    for entry in entries {
        let path = entry.ok()?.path();
        if !path.is_dir() {
            continue;
        }
        if path
            .file_name()
            .map(|n| n.to_string_lossy().starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        if let Some(found) = discover_skill_dir_by_name(&path, name, depth + 1) {
            return Some(found);
        }
    }

    None
}

pub fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
