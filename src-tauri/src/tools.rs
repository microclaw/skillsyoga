use crate::error::AppError;
use crate::helpers::expand_home;
use crate::models::{AppState, CustomToolInput, SourceInfo, ToolInfo};
use crate::state::load_state;

pub fn built_in_tools() -> Vec<CustomToolInput> {
    vec![
        CustomToolInput {
            id: "cursor".to_string(),
            name: "Cursor".to_string(),
            config_path: "~/.cursor".to_string(),
            skills_path: "~/.cursor/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "gemini".to_string(),
            name: "Gemini CLI".to_string(),
            config_path: "~/.gemini".to_string(),
            skills_path: "~/.gemini/skills".to_string(),
            cli: true,
        },
        CustomToolInput {
            id: "antigravity".to_string(),
            name: "Antigravity".to_string(),
            config_path: "~/.gemini/antigravity".to_string(),
            skills_path: "~/.gemini/antigravity/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "trae".to_string(),
            name: "Trae".to_string(),
            config_path: "~/.trae".to_string(),
            skills_path: "~/.trae/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "claude-code".to_string(),
            name: "Claude Code".to_string(),
            config_path: "~/.claude".to_string(),
            skills_path: "~/.claude/skills".to_string(),
            cli: true,
        },
        CustomToolInput {
            id: "codex".to_string(),
            name: "Codex".to_string(),
            config_path: "~/.codex".to_string(),
            skills_path: "~/.codex/skills".to_string(),
            cli: true,
        },
        CustomToolInput {
            id: "openclaw".to_string(),
            name: "OpenClaw".to_string(),
            config_path: "~/.openclaw".to_string(),
            skills_path: "~/.openclaw/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "opencode".to_string(),
            name: "OpenCode".to_string(),
            config_path: "~/.config/opencode".to_string(),
            skills_path: "~/.config/opencode/skills".to_string(),
            cli: true,
        },
        CustomToolInput {
            id: "goose".to_string(),
            name: "Goose".to_string(),
            config_path: "~/.config/goose".to_string(),
            skills_path: "~/.config/goose/skills".to_string(),
            cli: true,
        },
        CustomToolInput {
            id: "letta".to_string(),
            name: "Letta".to_string(),
            config_path: "~/.letta".to_string(),
            skills_path: "~/.letta/skills".to_string(),
            cli: true,
        },
        CustomToolInput {
            id: "amp".to_string(),
            name: "Amp".to_string(),
            config_path: "~/.config/amp".to_string(),
            skills_path: "~/.config/agents/skills".to_string(),
            cli: true,
        },
        CustomToolInput {
            id: "github-copilot".to_string(),
            name: "GitHub Copilot".to_string(),
            config_path: "~/.copilot".to_string(),
            skills_path: "~/.copilot/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "windsurf".to_string(),
            name: "Windsurf".to_string(),
            config_path: "~/.codeium/windsurf".to_string(),
            skills_path: "~/.codeium/windsurf/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "cline".to_string(),
            name: "Cline".to_string(),
            config_path: "~/.cline".to_string(),
            skills_path: "~/.cline/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "roo-code".to_string(),
            name: "Roo Code".to_string(),
            config_path: "~/.roo".to_string(),
            skills_path: "~/.roo/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "marscode".to_string(),
            name: "MarsCode".to_string(),
            config_path: "~/.marscode".to_string(),
            skills_path: "~/.marscode/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "tongyi-lingma".to_string(),
            name: "Tongyi Lingma".to_string(),
            config_path: "~/.lingma".to_string(),
            skills_path: "~/.lingma/skills".to_string(),
            cli: false,
        },
        CustomToolInput {
            id: "baidu-comate".to_string(),
            name: "Baidu Comate".to_string(),
            config_path: "~/.comate".to_string(),
            skills_path: "~/.comate/skills".to_string(),
            cli: false,
        },
    ]
}

pub fn curated_sources() -> Vec<SourceInfo> {
    let mut sources = vec![
        SourceInfo {
            id: "cc-plugins".to_string(),
            name: "Claude Code Plugins + Skills".to_string(),
            repo_url: "https://github.com/jeremylongshore/claude-code-plugins-plus-skills"
                .to_string(),
            description: "Mixed plugin and skill examples for Claude-style workflows.".to_string(),
            tags: vec!["claude".to_string(), "skills".to_string()],
        },
        SourceInfo {
            id: "composio".to_string(),
            name: "Awesome Claude Skills (Composio)".to_string(),
            repo_url: "https://github.com/ComposioHQ/awesome-claude-skills".to_string(),
            description: "Curated list of reusable Claude skills.".to_string(),
            tags: vec!["claude".to_string(), "awesome-list".to_string()],
        },
        SourceInfo {
            id: "antigravity-awesome".to_string(),
            name: "Antigravity Awesome Skills".to_string(),
            repo_url: "https://github.com/sickn33/antigravity-awesome-skills".to_string(),
            description: "Skills tailored for Antigravity environments.".to_string(),
            tags: vec!["antigravity".to_string(), "skills".to_string()],
        },
        SourceInfo {
            id: "openclaw-awesome".to_string(),
            name: "Awesome OpenClaw Skills".to_string(),
            repo_url: "https://github.com/VoltAgent/awesome-openclaw-skills".to_string(),
            description: "Community source for OpenClaw skill packs.".to_string(),
            tags: vec!["openclaw".to_string(), "skills".to_string()],
        },
        SourceInfo {
            id: "superpowers".to_string(),
            name: "Obra Superpowers".to_string(),
            repo_url: "https://github.com/obra/superpowers".to_string(),
            description: "Collection of workflow superpowers compatible with agent tools."
                .to_string(),
            tags: vec!["automation".to_string(), "productivity".to_string()],
        },
    ];
    sources.sort_by(|a, b| a.name.cmp(&b.name));
    sources
}

pub fn tool_input_to_info(
    tool: &CustomToolInput,
    state: &AppState,
    kind: &str,
) -> Result<ToolInfo, AppError> {
    let config = expand_home(&tool.config_path)?;
    let skills = expand_home(&tool.skills_path)?;
    let detected = config.exists() || skills.exists();
    let enabled = state
        .tool_toggles
        .get(&tool.id)
        .copied()
        .unwrap_or(detected);

    Ok(ToolInfo {
        id: tool.id.clone(),
        name: tool.name.clone(),
        kind: kind.to_string(),
        config_path: config.to_string_lossy().to_string(),
        skills_path: skills.to_string_lossy().to_string(),
        detected,
        enabled,
        cli: tool.cli,
    })
}

/// Build the tool list without scanning skills (lightweight).
pub fn resolve_tools(app: &tauri::AppHandle) -> Result<Vec<ToolInfo>, AppError> {
    let state = load_state(app)?;
    let mut tools = vec![];

    for builtin in built_in_tools() {
        tools.push(tool_input_to_info(&builtin, &state, "builtin")?);
    }

    for custom in &state.custom_tools {
        tools.push(tool_input_to_info(custom, &state, "custom")?);
    }

    tools.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tools)
}

pub fn find_tool_by_id(app: &tauri::AppHandle, tool_id: &str) -> Result<ToolInfo, AppError> {
    let tools = resolve_tools(app)?;
    tools
        .into_iter()
        .find(|t| t.id == tool_id)
        .ok_or_else(|| AppError::NotFound(format!("Tool not found: {tool_id}")))
}
