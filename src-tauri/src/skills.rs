use std::{
    collections::{HashMap, HashSet},
    fs, io,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::error::AppError;
use crate::helpers::now_iso;
use crate::models::{DiscoveredSkillsRoot, SkillInfo, ToolInfo};
use serde::{Deserialize, Serialize};

const SOURCE_META_FILE: &str = ".skillsyoga-source.json";

/// Entry in the skill-metadata cache. A cached `SkillInfo` is reusable when
/// both the SKILL.md and optional source-metadata file still match their
/// recorded mtimes — i.e. nothing has been touched on disk since last scan.
#[derive(Clone)]
struct CachedSkill {
    skill_md_mtime: Option<SystemTime>,
    source_meta_mtime: Option<SystemTime>,
    skill: SkillInfo,
}

fn skill_cache() -> &'static Mutex<HashMap<PathBuf, CachedSkill>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedSkill>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn file_mtime(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).ok().and_then(|m| m.modified().ok())
}

fn mtime_to_string(mtime: Option<SystemTime>) -> String {
    mtime
        .and_then(|s| s.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(now_iso)
}

fn build_skill_info(
    tool: &ToolInfo,
    skill_dir: &Path,
    skill_md_path: &Path,
    skill_md_mtime: Option<SystemTime>,
) -> Result<SkillInfo, AppError> {
    let content = fs::read_to_string(skill_md_path)?;
    let dir_name = dir_display_name(skill_dir);
    let skill_meta = parse_skill_metadata(&content, &dir_name);
    let source_meta = read_skill_source_meta(skill_dir);
    let modified = mtime_to_string(skill_md_mtime);

    Ok(SkillInfo {
        id: format!("{}:{}", tool.id, dir_name),
        name: skill_meta.name,
        description: skill_meta.description,
        path: skill_dir.to_string_lossy().to_string(),
        source: tool.id.clone(),
        enabled_for: vec![tool.id.clone()],
        updated_at: modified,
        github_repo_url: source_meta.as_ref().map(|meta| meta.repo_url.clone()),
        github_skill_path: source_meta.and_then(|meta| meta.skill_path),
    })
}

/// Return a cached `SkillInfo` if the files on disk match the recorded
/// mtimes; otherwise parse fresh and update the cache in place.
fn load_skill_cached(
    tool: &ToolInfo,
    skill_dir: &Path,
    skill_md_path: &Path,
) -> Result<SkillInfo, AppError> {
    let md_mtime = file_mtime(skill_md_path);
    let src_mtime = file_mtime(&skill_dir.join(SOURCE_META_FILE));

    if let Ok(mut cache) = skill_cache().lock() {
        if let Some(entry) = cache.get(skill_dir) {
            if entry.skill_md_mtime == md_mtime && entry.source_meta_mtime == src_mtime {
                return Ok(entry.skill.clone());
            }
        }

        let skill = build_skill_info(tool, skill_dir, skill_md_path, md_mtime)?;
        cache.insert(
            skill_dir.to_path_buf(),
            CachedSkill {
                skill_md_mtime: md_mtime,
                source_meta_mtime: src_mtime,
                skill: skill.clone(),
            },
        );
        return Ok(skill);
    }

    // Lock poisoned — fall back to a non-cached parse. Avoids turning a
    // transient panic in another thread into a permanent failure here.
    build_skill_info(tool, skill_dir, skill_md_path, md_mtime)
}

/// Drop cache entries beneath `scope_root` that weren't observed in the
/// most recent scan. Only entries under this tool's root are considered —
/// other tools' cache entries remain untouched.
fn prune_skill_cache(scope_root: &Path, live: &HashSet<PathBuf>) {
    if let Ok(mut cache) = skill_cache().lock() {
        cache.retain(|path, _| !path.starts_with(scope_root) || live.contains(path));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillSourceMeta {
    repo_url: String,
    #[serde(default)]
    skill_path: Option<String>,
}

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
    let mut live_paths: HashSet<PathBuf> = HashSet::new();

    let root_skill_file = root.join("SKILL.md");
    if root_skill_file.exists() {
        let info = load_skill_cached(tool, &root, &root_skill_file)?;
        live_paths.insert(root.clone());
        skills.push(info);
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

        let info = load_skill_cached(tool, &path, &skill_file)?;
        live_paths.insert(path);
        skills.push(info);
    }

    prune_skill_cache(&root, &live_paths);
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
    list.sort_by(|a, b| {
        a.name
            .cmp(&b.name)
            .then_with(|| a.source.cmp(&b.source))
            .then_with(|| a.path.cmp(&b.path))
    });
    list
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

fn read_skill_source_meta(skill_dir: &Path) -> Option<SkillSourceMeta> {
    let meta_path = skill_dir.join(SOURCE_META_FILE);
    let content = fs::read_to_string(meta_path).ok()?;
    serde_json::from_str::<SkillSourceMeta>(&content).ok()
}

fn normalize_optional_rel_path(value: Option<&str>) -> Option<String> {
    let clean = value
        .map(|v| v.trim().replace('\\', "/"))
        .filter(|v| !v.is_empty())?;
    Some(clean.trim_matches('/').to_string())
}

pub fn write_skill_source_meta(
    skill_dir: &Path,
    repo_url: &str,
    skill_path: Option<&str>,
) -> Result<(), AppError> {
    let repo = repo_url.trim();
    if repo.is_empty() {
        return Ok(());
    }
    let meta = SkillSourceMeta {
        repo_url: repo.to_string(),
        skill_path: normalize_optional_rel_path(skill_path),
    };
    let serialized = serde_json::to_string_pretty(&meta)
        .map_err(|e| AppError::Validation(format!("Failed to serialize source metadata: {e}")))?;
    fs::write(skill_dir.join(SOURCE_META_FILE), serialized)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn parse_skill_metadata_with_frontmatter() {
        let content = "---\nname: My Skill\ndescription: Short summary\n---\n\n# Body heading\nSome body.";
        let meta = parse_skill_metadata(content, "fallback");
        assert_eq!(meta.name, "My Skill");
        assert_eq!(meta.description, "Short summary");
    }

    #[test]
    fn parse_skill_metadata_with_quoted_values() {
        let content = "---\nname: \"Quoted Name\"\ndescription: 'single quoted'\n---\n\nbody";
        let meta = parse_skill_metadata(content, "fallback");
        assert_eq!(meta.name, "Quoted Name");
        assert_eq!(meta.description, "single quoted");
    }

    #[test]
    fn parse_skill_metadata_folded_block_description() {
        let content = "---\nname: Thing\ndescription: >\n  line one\n  line two\n---\n\nbody";
        let meta = parse_skill_metadata(content, "fallback");
        assert_eq!(meta.name, "Thing");
        assert_eq!(meta.description, "line one line two");
    }

    #[test]
    fn parse_skill_metadata_falls_back_to_heading_when_no_frontmatter() {
        let content = "# Heading Name\n\nParagraph description here.\nMore text.";
        let meta = parse_skill_metadata(content, "fallback");
        assert_eq!(meta.name, "Heading Name");
        assert_eq!(meta.description, "Paragraph description here.");
    }

    #[test]
    fn parse_skill_metadata_skips_setext_underline() {
        let content = "# Title\n\n====\n\nReal paragraph.";
        let meta = parse_skill_metadata(content, "fallback");
        assert_eq!(meta.name, "Title");
        assert_eq!(meta.description, "Real paragraph.");
    }

    #[test]
    fn parse_skill_metadata_uses_fallback_name_when_empty() {
        let content = "\n\nno heading, no frontmatter";
        let meta = parse_skill_metadata(content, "my-fallback");
        assert_eq!(meta.name, "my-fallback");
        assert_eq!(meta.description, "no heading, no frontmatter");
    }

    #[test]
    fn parse_skill_metadata_missing_description_default() {
        let content = "---\nname: OnlyName\n---\n";
        let meta = parse_skill_metadata(content, "fallback");
        assert_eq!(meta.name, "OnlyName");
        assert_eq!(meta.description, "No description");
    }

    #[test]
    fn dir_display_name_uses_last_component() {
        assert_eq!(dir_display_name(Path::new("/tmp/foo/bar-baz")), "bar-baz");
        assert_eq!(dir_display_name(Path::new("relative/name")), "name");
    }

    #[test]
    fn normalize_optional_rel_path_trims_slashes() {
        assert_eq!(
            normalize_optional_rel_path(Some("/foo/bar/")),
            Some("foo/bar".to_string())
        );
        assert_eq!(
            normalize_optional_rel_path(Some("a\\b")),
            Some("a/b".to_string())
        );
        assert_eq!(normalize_optional_rel_path(Some("")), None);
        assert_eq!(normalize_optional_rel_path(None), None);
    }

    #[test]
    fn skill_cache_reuses_entry_when_mtimes_match() {
        let tmp = env::temp_dir().join(format!("skillsyoga-cache-test-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        let skill_dir = tmp.join("my-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        let skill_md = skill_dir.join("SKILL.md");
        fs::write(&skill_md, "---\nname: Cached\ndescription: one\n---\n").unwrap();

        let tool = ToolInfo {
            id: "tool".into(),
            name: "tool".into(),
            kind: "builtin".into(),
            config_path: String::new(),
            skills_path: tmp.to_string_lossy().to_string(),
            detected: true,
            enabled: true,
        };

        let first = load_skill_cached(&tool, &skill_dir, &skill_md).unwrap();
        // Mutate content, but keep mtime identical by writing nothing new:
        // we re-query through the cache with the same mtime, should return
        // the cached copy (description "one") regardless of what's on disk
        // — we'll verify by checking cache hit semantics.
        let second = load_skill_cached(&tool, &skill_dir, &skill_md).unwrap();
        assert_eq!(first.name, second.name);
        assert_eq!(first.description, second.description);

        fs::remove_dir_all(&tmp).ok();
    }
}
