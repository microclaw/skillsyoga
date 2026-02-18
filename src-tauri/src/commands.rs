use std::{
    env, fs,
    path::{Component, Path, PathBuf},
    process::Command,
};

use crate::error::AppError;
use crate::helpers::{ensure_dir, is_path_under_skills_root, now_iso, slugify, unique_dir};
use crate::models::{
    CreateGistRequest, CustomToolInput, DashboardData, DashboardStats, InstallFromRegistryRequest,
    InstallSkillRequest, SaveSkillEntryRequest, SaveSkillRequest, SearchSkillResult,
    SearchSkillsResponse, SkillFileEntry, SkillInfo,
};
use crate::skills::{
    collect_skills_from_tool, copy_dir_recursive, dir_display_name, discover_skill_dir,
    discover_skill_dir_by_name, merge_skills, parse_skill_metadata,
};
use crate::state::{app_data_dir, load_state, save_state};
use crate::tools::{built_in_tools, curated_sources, find_tool_by_id, tool_input_to_info};

fn normalize_relative_path(input: &str) -> Result<PathBuf, AppError> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err(AppError::Validation(
            "Relative path cannot be empty".to_string(),
        ));
    }

    let path = PathBuf::from(raw);
    if path.is_absolute() {
        return Err(AppError::InvalidPath(
            "Relative path must not be absolute".to_string(),
        ));
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(seg) => normalized.push(seg),
            Component::CurDir => {}
            _ => {
                return Err(AppError::InvalidPath(
                    "Relative path must not contain path traversal".to_string(),
                ));
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(AppError::Validation(
            "Relative path cannot be empty".to_string(),
        ));
    }

    Ok(normalized)
}

fn resolve_skill_child_path(skill_root: &Path, relative_path: &str) -> Result<PathBuf, AppError> {
    let rel = normalize_relative_path(relative_path)?;
    Ok(skill_root.join(rel))
}

fn to_relative_string(skill_root: &Path, child: &Path) -> Option<String> {
    child
        .strip_prefix(skill_root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}

fn dashboard(app: &tauri::AppHandle) -> Result<DashboardData, AppError> {
    let state = load_state(app)?;
    let mut tools = vec![];

    for builtin in built_in_tools() {
        tools.push(tool_input_to_info(&builtin, &state, "builtin")?);
    }

    for custom in &state.custom_tools {
        tools.push(tool_input_to_info(custom, &state, "custom")?);
    }

    // Sort by persisted order; tools not in the list go at the end alphabetically
    tools.sort_by(|a, b| {
        let pos_a = state.tool_order.iter().position(|id| id == &a.id);
        let pos_b = state.tool_order.iter().position(|id| id == &b.id);
        match (pos_a, pos_b) {
            (Some(i), Some(j)) => i.cmp(&j),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.name.cmp(&b.name),
        }
    });

    let mut skills_raw = vec![];
    for tool in &tools {
        if !tool.enabled {
            continue;
        }
        let mut tool_skills = collect_skills_from_tool(tool)?;
        skills_raw.append(&mut tool_skills);
    }
    let skills = merge_skills(skills_raw);

    let stats = DashboardStats {
        installed_skills: skills.len(),
        detected_tools: tools.iter().filter(|t| t.detected).count(),
        enabled_tools: tools.iter().filter(|t| t.enabled).count(),
    };

    let skill_editor_default_mode = if state.skill_editor_default_mode == "edit" {
        "edit".to_string()
    } else {
        "view".to_string()
    };

    Ok(DashboardData {
        tools,
        skills,
        sources: curated_sources(),
        stats,
        app_data_dir: app_data_dir(app)?.to_string_lossy().to_string(),
        has_github_token: state
            .github_token
            .as_ref()
            .is_some_and(|token| !token.trim().is_empty()),
        skill_editor_default_mode,
    })
}

#[tauri::command]
pub fn get_dashboard_data(app: tauri::AppHandle) -> Result<DashboardData, AppError> {
    dashboard(&app)
}

#[tauri::command]
pub fn set_tool_enabled(
    app: tauri::AppHandle,
    tool_id: String,
    enabled: bool,
) -> Result<(), AppError> {
    let mut state = load_state(&app)?;
    state.tool_toggles.insert(tool_id, enabled);
    save_state(&app, &state)
}

#[tauri::command]
pub fn read_skill_file(app: tauri::AppHandle, path: String) -> Result<String, AppError> {
    let dir = PathBuf::from(&path);
    is_path_under_skills_root(&dir, &app)?;
    let skill_file = dir.join("SKILL.md");
    let content = fs::read_to_string(&skill_file)?;
    Ok(content)
}

#[tauri::command]
pub fn list_skill_files(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<SkillFileEntry>, AppError> {
    let skill_root = PathBuf::from(&path);
    is_path_under_skills_root(&skill_root, &app)?;

    if !skill_root.exists() {
        return Err(AppError::NotFound(format!(
            "Skill path does not exist: {}",
            skill_root.display()
        )));
    }

    let mut entries = vec![];
    let mut stack = vec![skill_root.clone()];

    while let Some(dir) = stack.pop() {
        for child in fs::read_dir(&dir)? {
            let child = child?;
            let child_path = child.path();

            let Some(relative) = to_relative_string(&skill_root, &child_path) else {
                continue;
            };

            if relative.is_empty() {
                continue;
            }

            let file_name = child.file_name();
            if file_name.to_string_lossy().starts_with('.') {
                continue;
            }

            let is_dir = child_path.is_dir();
            entries.push(SkillFileEntry {
                relative_path: relative,
                is_dir,
            });
            if is_dir {
                stack.push(child_path);
            }
        }
    }

    entries.sort_by(|a, b| {
        a.relative_path
            .cmp(&b.relative_path)
            .then_with(|| b.is_dir.cmp(&a.is_dir))
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_skill_entry(
    app: tauri::AppHandle,
    path: String,
    relative_path: String,
) -> Result<String, AppError> {
    let skill_root = PathBuf::from(&path);
    is_path_under_skills_root(&skill_root, &app)?;

    let target = resolve_skill_child_path(&skill_root, &relative_path)?;
    if !target.exists() {
        return Err(AppError::NotFound(format!(
            "File does not exist: {}",
            target.display()
        )));
    }
    if !target.is_file() {
        return Err(AppError::Validation(format!(
            "Path is not a file: {}",
            relative_path
        )));
    }

    fs::read_to_string(target).map_err(AppError::from)
}

#[tauri::command]
pub fn save_skill_entry(
    app: tauri::AppHandle,
    request: SaveSkillEntryRequest,
) -> Result<(), AppError> {
    let skill_root = PathBuf::from(&request.path);
    is_path_under_skills_root(&skill_root, &app)?;

    let target = resolve_skill_child_path(&skill_root, &request.relative_path)?;
    if let Some(parent) = target.parent() {
        ensure_dir(parent)?;
    }
    fs::write(target, request.content)?;
    Ok(())
}

#[tauri::command]
pub fn create_skill_dir(
    app: tauri::AppHandle,
    path: String,
    relative_path: String,
) -> Result<(), AppError> {
    let skill_root = PathBuf::from(&path);
    is_path_under_skills_root(&skill_root, &app)?;

    let target = resolve_skill_child_path(&skill_root, &relative_path)?;
    if target.exists() && !target.is_dir() {
        return Err(AppError::Validation(format!(
            "Path exists and is not a directory: {}",
            relative_path
        )));
    }
    ensure_dir(&target)?;
    Ok(())
}

#[tauri::command]
pub fn rename_skill_entry(
    app: tauri::AppHandle,
    path: String,
    old_relative_path: String,
    new_relative_path: String,
) -> Result<(), AppError> {
    let skill_root = PathBuf::from(&path);
    is_path_under_skills_root(&skill_root, &app)?;

    let old_target = resolve_skill_child_path(&skill_root, &old_relative_path)?;
    let new_target = resolve_skill_child_path(&skill_root, &new_relative_path)?;

    if !old_target.exists() {
        return Err(AppError::NotFound(format!(
            "Path does not exist: {}",
            old_relative_path
        )));
    }
    if new_target.exists() {
        return Err(AppError::Validation(format!(
            "Target path already exists: {}",
            new_relative_path
        )));
    }
    if let Some(parent) = new_target.parent() {
        ensure_dir(parent)?;
    }
    fs::rename(old_target, new_target)?;
    Ok(())
}

#[tauri::command]
pub fn delete_skill_entry(
    app: tauri::AppHandle,
    path: String,
    relative_path: String,
) -> Result<(), AppError> {
    let skill_root = PathBuf::from(&path);
    is_path_under_skills_root(&skill_root, &app)?;

    let target = resolve_skill_child_path(&skill_root, &relative_path)?;
    if !target.exists() {
        return Err(AppError::NotFound(format!(
            "Path does not exist: {}",
            relative_path
        )));
    }
    if !target.is_file() {
        return Err(AppError::Validation(format!(
            "Path is not a file: {}",
            relative_path
        )));
    }
    trash::delete(&target).map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    Ok(())
}

#[tauri::command]
pub fn delete_skill_empty_dir(
    app: tauri::AppHandle,
    path: String,
    relative_path: String,
) -> Result<(), AppError> {
    let skill_root = PathBuf::from(&path);
    is_path_under_skills_root(&skill_root, &app)?;

    let target = resolve_skill_child_path(&skill_root, &relative_path)?;
    if !target.exists() {
        return Err(AppError::NotFound(format!(
            "Path does not exist: {}",
            relative_path
        )));
    }
    if !target.is_dir() {
        return Err(AppError::Validation(format!(
            "Path is not a directory: {}",
            relative_path
        )));
    }
    let mut iter = fs::read_dir(&target)?;
    if iter.next().is_some() {
        return Err(AppError::Validation(format!(
            "Directory is not empty: {}",
            relative_path
        )));
    }
    trash::delete(&target).map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    Ok(())
}

#[tauri::command]
pub fn save_skill_file(
    app: tauri::AppHandle,
    request: SaveSkillRequest,
) -> Result<SkillInfo, AppError> {
    let tool = find_tool_by_id(&app, &request.target_tool_id)?;
    let skills_root = PathBuf::from(&tool.skills_path);
    ensure_dir(&skills_root)?;

    // Parse name/description from the content's frontmatter
    let meta = parse_skill_metadata(&request.content, "skill");

    let target_dir = if let Some(existing) = request.existing_path {
        let p = PathBuf::from(&existing);
        is_path_under_skills_root(&p, &app)?;
        p
    } else {
        unique_dir(&skills_root, &slugify(&meta.name))
    };

    ensure_dir(&target_dir)?;

    let skill_file = target_dir.join("SKILL.md");
    fs::write(&skill_file, &request.content)?;

    let dir_name = dir_display_name(&target_dir);

    Ok(SkillInfo {
        id: format!("{}:{}", tool.id, dir_name),
        name: meta.name,
        description: meta.description,
        path: target_dir.to_string_lossy().to_string(),
        source: tool.id.clone(),
        enabled_for: vec![tool.id],
        updated_at: now_iso(),
    })
}

#[tauri::command]
pub fn delete_skill(app: tauri::AppHandle, path: String) -> Result<(), AppError> {
    let dir = PathBuf::from(&path);
    is_path_under_skills_root(&dir, &app)?;
    if dir.exists() {
        trash::delete(&dir).map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    }
    Ok(())
}

#[tauri::command]
pub fn upsert_custom_tool(
    app: tauri::AppHandle,
    tool: CustomToolInput,
) -> Result<DashboardData, AppError> {
    let mut state = load_state(&app)?;

    let next_id = slugify(&tool.id);
    if built_in_tools().iter().any(|builtin| builtin.id == next_id) {
        return Err(AppError::Validation(
            "Custom tool id conflicts with a built-in integration".to_string(),
        ));
    }

    let clean_tool = CustomToolInput {
        id: next_id,
        name: tool.name,
        config_path: tool.config_path,
        skills_path: tool.skills_path,
        cli: tool.cli,
    };

    if let Some(existing) = state
        .custom_tools
        .iter_mut()
        .find(|t| t.id == clean_tool.id)
    {
        *existing = clean_tool;
    } else {
        state.custom_tools.push(clean_tool);
    }

    save_state(&app, &state)?;
    dashboard(&app)
}

#[tauri::command]
pub fn delete_custom_tool(
    app: tauri::AppHandle,
    tool_id: String,
) -> Result<DashboardData, AppError> {
    let mut state = load_state(&app)?;
    state.custom_tools.retain(|t| t.id != tool_id);
    state.tool_toggles.remove(&tool_id);
    save_state(&app, &state)?;
    dashboard(&app)
}

#[tauri::command]
pub fn install_skill_from_github(
    app: tauri::AppHandle,
    request: InstallSkillRequest,
) -> Result<SkillInfo, AppError> {
    let repo_url = request.repo_url.trim().to_string();
    if !repo_url.starts_with("https://github.com/") {
        return Err(AppError::Validation(
            "Only GitHub repository URLs are supported".to_string(),
        ));
    }

    let tool = find_tool_by_id(&app, &request.target_tool_id)?;
    let skills_root = PathBuf::from(&tool.skills_path);
    ensure_dir(&skills_root)?;

    let temp_root = env::temp_dir().join(format!("skillsyoga-{}", now_iso()));
    ensure_dir(&temp_root)?;

    let clone_output = Command::new("git")
        .arg("clone")
        .arg("--depth")
        .arg("1")
        .arg(&repo_url)
        .arg(&temp_root)
        .output()
        .map_err(|e| AppError::Git(format!("Failed to start git: {e}")))?;

    if !clone_output.status.success() {
        let stderr = String::from_utf8_lossy(&clone_output.stderr);
        let _ = fs::remove_dir_all(&temp_root);
        return Err(AppError::Git(format!("git clone failed: {stderr}")));
    }

    let source_dir = if let Some(skill_path) = request.skill_path {
        temp_root.join(skill_path)
    } else {
        discover_skill_dir(&temp_root, 0).ok_or_else(|| {
            AppError::NotFound(
                "Unable to determine skill directory automatically; provide `skillPath`"
                    .to_string(),
            )
        })?
    };

    if !source_dir.exists() || !source_dir.join("SKILL.md").exists() {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(AppError::NotFound(format!(
            "Skill folder invalid: {}",
            source_dir.to_string_lossy()
        )));
    }

    let default_name = dir_display_name(&source_dir);

    let target = unique_dir(&skills_root, &slugify(&default_name));
    copy_dir_recursive(&source_dir, &target)?;

    let content = fs::read_to_string(target.join("SKILL.md"))?;

    let skill_meta = parse_skill_metadata(&content, &default_name);

    let _ = fs::remove_dir_all(&temp_root);

    Ok(SkillInfo {
        id: format!("{}:{}", tool.id, slugify(&skill_meta.name)),
        name: skill_meta.name,
        description: skill_meta.description,
        path: target.to_string_lossy().to_string(),
        source: tool.id.clone(),
        enabled_for: vec![tool.id],
        updated_at: now_iso(),
    })
}

#[tauri::command]
pub async fn search_skills(query: String) -> Result<Vec<SearchSkillResult>, AppError> {
    let url = format!(
        "https://skills.sh/api/search?q={}&limit=20",
        urlencoding::encode(&query)
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Network(format!("Failed to reach skills.sh: {e}")))?;
    let data: SearchSkillsResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Network(format!("Invalid response from skills.sh: {e}")))?;
    Ok(data.skills)
}

#[tauri::command]
pub fn install_from_registry(
    app: tauri::AppHandle,
    request: InstallFromRegistryRequest,
) -> Result<SkillInfo, AppError> {
    let repo_url = format!("https://github.com/{}", request.source);

    let tool = find_tool_by_id(&app, &request.target_tool_id)?;
    let skills_root = PathBuf::from(&tool.skills_path);
    ensure_dir(&skills_root)?;

    let temp_root = env::temp_dir().join(format!("skillsyoga-{}", now_iso()));
    ensure_dir(&temp_root)?;

    let clone_output = Command::new("git")
        .arg("clone")
        .arg("--depth")
        .arg("1")
        .arg(&repo_url)
        .arg(&temp_root)
        .output()
        .map_err(|e| AppError::Git(format!("Failed to start git: {e}")))?;

    if !clone_output.status.success() {
        let stderr = String::from_utf8_lossy(&clone_output.stderr);
        let _ = fs::remove_dir_all(&temp_root);
        return Err(AppError::Git(format!("git clone failed: {stderr}")));
    }

    let source_dir = discover_skill_dir_by_name(&temp_root, &request.skill_id, 0)
        .or_else(|| discover_skill_dir(&temp_root, 0))
        .ok_or_else(|| {
            let _ = fs::remove_dir_all(&temp_root);
            AppError::NotFound(format!(
                "Could not find skill '{}' in repository",
                request.skill_id
            ))
        })?;

    if !source_dir.join("SKILL.md").exists() {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(AppError::NotFound(format!(
            "Skill folder invalid: {}",
            source_dir.to_string_lossy()
        )));
    }

    let default_name = dir_display_name(&source_dir);
    let target = unique_dir(&skills_root, &slugify(&default_name));
    copy_dir_recursive(&source_dir, &target)?;

    let content = fs::read_to_string(target.join("SKILL.md"))?;
    let skill_meta = parse_skill_metadata(&content, &default_name);

    let _ = fs::remove_dir_all(&temp_root);

    Ok(SkillInfo {
        id: format!("{}:{}", tool.id, slugify(&skill_meta.name)),
        name: skill_meta.name,
        description: skill_meta.description,
        path: target.to_string_lossy().to_string(),
        source: tool.id.clone(),
        enabled_for: vec![tool.id],
        updated_at: now_iso(),
    })
}

#[tauri::command]
pub fn reorder_tools(app: tauri::AppHandle, tool_order: Vec<String>) -> Result<(), AppError> {
    let mut state = load_state(&app)?;
    state.tool_order = tool_order;
    save_state(&app, &state)
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), AppError> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::NotFound(format!("Path not found: {path}")));
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg("-R").arg(&path).spawn()?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(p.parent().unwrap_or(&p))
            .spawn()?;
    }

    Ok(())
}

#[tauri::command]
pub fn set_github_token(app: tauri::AppHandle, token: String) -> Result<(), AppError> {
    let mut state = load_state(&app)?;
    let cleaned = token.trim().to_string();
    state.github_token = if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    };
    save_state(&app, &state)
}

#[tauri::command]
pub fn set_skill_editor_default_mode(app: tauri::AppHandle, mode: String) -> Result<(), AppError> {
    let clean = mode.trim().to_lowercase();
    if clean != "view" && clean != "edit" {
        return Err(AppError::Validation(
            "Mode must be either 'view' or 'edit'".to_string(),
        ));
    }
    let mut state = load_state(&app)?;
    state.skill_editor_default_mode = clean;
    save_state(&app, &state)
}

#[tauri::command]
pub async fn create_github_gist(
    app: tauri::AppHandle,
    request: CreateGistRequest,
) -> Result<String, AppError> {
    let state = load_state(&app)?;
    let token = state
        .github_token
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Validation("Please set GitHub Token in Settings.".to_string()))?;

    let selected_text = request.selected_text.trim();
    if selected_text.is_empty() {
        return Err(AppError::Validation(
            "Please select some text before creating a gist.".to_string(),
        ));
    }

    let skill_name = request.skill_name.trim();
    let skill_description = request.skill_description.trim();
    let file_path = request.file_path.trim();
    let fence = if selected_text.contains("```") {
        "````"
    } else {
        "```"
    };
    let gist_content = format!(
        "# SkillsYoga Excerpt\n\n## Skill\n- Name: {skill_name}\n- Description: {skill_description}\n- File: {file_path}\n\n## Selected Text\n{fence}\n{selected_text}\n{fence}\n"
    );

    let safe_name = if skill_name.is_empty() {
        "skill"
    } else {
        skill_name
    };
    let gist_file_name = format!("{}-excerpt.md", slugify(safe_name));
    let body = serde_json::json!({
      "description": format!("SkillsYoga excerpt from {}", if skill_name.is_empty() { "skill" } else { skill_name }),
      "public": false,
      "files": {
        gist_file_name: { "content": gist_content }
      }
    });

    let response = reqwest::Client::new()
        .post("https://api.github.com/gists")
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "skillsyoga")
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Failed to create gist: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::Network(format!(
            "GitHub Gist API failed ({status}): {message}"
        )));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Network(format!("Invalid GitHub response: {e}")))?;
    let url = data
        .get("html_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Network("GitHub response missing gist URL".to_string()))?;

    Ok(url.to_string())
}
