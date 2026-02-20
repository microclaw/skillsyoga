use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub config_path: String,
    pub skills_path: String,
    pub detected: bool,
    pub enabled: bool,
    pub cli: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub source: String,
    pub enabled_for: Vec<String>,
    pub updated_at: String,
    #[serde(default)]
    pub github_repo_url: Option<String>,
    #[serde(default)]
    pub github_skill_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub id: String,
    pub name: String,
    pub repo_url: String,
    pub description: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub installed_skills: usize,
    pub detected_tools: usize,
    pub enabled_tools: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub tools: Vec<ToolInfo>,
    pub skills: Vec<SkillInfo>,
    pub sources: Vec<SourceInfo>,
    pub stats: DashboardStats,
    pub app_data_dir: String,
    pub has_github_token: bool,
    pub skill_editor_default_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub tool_toggles: HashMap<String, bool>,
    pub custom_tools: Vec<CustomToolInput>,
    #[serde(default)]
    pub tool_order: Vec<String>,
    #[serde(default)]
    pub github_token: Option<String>,
    #[serde(default = "default_skill_editor_default_mode")]
    pub skill_editor_default_mode: String,
}

fn default_skill_editor_default_mode() -> String {
    "view".to_string()
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            tool_toggles: HashMap::new(),
            custom_tools: vec![],
            tool_order: vec![],
            github_token: None,
            skill_editor_default_mode: default_skill_editor_default_mode(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSkillRequest {
    pub content: String,
    pub target_tool_id: String,
    pub existing_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillRequest {
    pub repo_url: String,
    pub skill_path: Option<String>,
    pub target_tool_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSkillFromGithubRequest {
    pub path: String,
    pub repo_url: String,
    pub skill_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomToolInput {
    pub id: String,
    pub name: String,
    pub config_path: String,
    pub skills_path: String,
    pub cli: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSkillResult {
    pub id: String,
    pub skill_id: String,
    pub name: String,
    pub installs: u64,
    pub source: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchSkillsResponse {
    pub skills: Vec<SearchSkillResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFromRegistryRequest {
    pub source: String,
    pub skill_id: String,
    pub target_tool_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGistRequest {
    pub skill_name: String,
    pub skill_description: String,
    pub file_path: String,
    pub selected_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFileEntry {
    pub relative_path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSkillEntryRequest {
    pub path: String,
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopySkillToToolRequest {
    pub source_path: String,
    pub target_tool_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSkillsRoot {
    pub path: String,
    pub skill_count: usize,
}
