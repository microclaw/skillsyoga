import { invoke } from "@tauri-apps/api/core";
import type {
  CopySkillToToolRequest,
  CreateGitHubGistRequest,
  CustomToolInput,
  DashboardData,
  DiscoveredSkillsRoot,
  InstallFromRegistryRequest,
  InstallSkillRequest,
  SaveSkillEntryRequest,
  SaveSkillRequest,
  SkillFileEntry,
  SearchSkillResult,
  SkillInfo,
} from "@/types/models";

export async function getDashboardData() {
  return invoke<DashboardData>("get_dashboard_data");
}

export async function setToolEnabled(toolId: string, enabled: boolean) {
  return invoke<void>("set_tool_enabled", { toolId, enabled });
}

export async function readSkillFile(path: string) {
  return invoke<string>("read_skill_file", { path });
}

export async function listSkillFiles(path: string) {
  return invoke<SkillFileEntry[]>("list_skill_files", { path });
}

export async function readSkillEntry(path: string, relativePath: string) {
  return invoke<string>("read_skill_entry", { path, relativePath });
}

export async function saveSkillFile(request: SaveSkillRequest) {
  return invoke<SkillInfo>("save_skill_file", { request });
}

export async function saveSkillEntry(request: SaveSkillEntryRequest) {
  return invoke<void>("save_skill_entry", { request });
}

export async function createSkillDir(path: string, relativePath: string) {
  return invoke<void>("create_skill_dir", { path, relativePath });
}

export async function renameSkillEntry(path: string, oldRelativePath: string, newRelativePath: string) {
  return invoke<void>("rename_skill_entry", { path, oldRelativePath, newRelativePath });
}

export async function deleteSkillEntry(path: string, relativePath: string) {
  return invoke<void>("delete_skill_entry", { path, relativePath });
}

export async function deleteSkillEmptyDir(path: string, relativePath: string) {
  return invoke<void>("delete_skill_empty_dir", { path, relativePath });
}

export async function deleteSkill(path: string) {
  return invoke<void>("delete_skill", { path });
}

export async function installSkillFromGithub(request: InstallSkillRequest) {
  return invoke<SkillInfo>("install_skill_from_github", { request });
}

export async function upsertCustomTool(tool: CustomToolInput) {
  return invoke<DashboardData>("upsert_custom_tool", { tool });
}

export async function discoverSkillsPaths(scanRoot: string) {
  return invoke<DiscoveredSkillsRoot[]>("discover_skills_paths", { scanRoot });
}

export async function deleteCustomTool(toolId: string) {
  return invoke<DashboardData>("delete_custom_tool", { toolId });
}

export async function searchSkills(query: string) {
  return invoke<SearchSkillResult[]>("search_skills", { query });
}

export async function installFromRegistry(request: InstallFromRegistryRequest) {
  return invoke<SkillInfo>("install_from_registry", { request });
}

export async function reorderTools(toolOrder: string[]) {
  return invoke<void>("reorder_tools", { toolOrder });
}

export async function revealInFinder(path: string) {
  return invoke<void>("reveal_in_finder", { path });
}

export async function setGithubToken(token: string) {
  return invoke<void>("set_github_token", { token });
}

export async function createGithubGist(request: CreateGitHubGistRequest) {
  return invoke<string>("create_github_gist", { request });
}

export async function setSkillEditorDefaultMode(mode: "view" | "edit") {
  return invoke<void>("set_skill_editor_default_mode", { mode });
}

export async function copySkillToTool(request: CopySkillToToolRequest) {
  return invoke<SkillInfo>("copy_skill_to_tool", { request });
}

export async function debugLog(message: string) {
  return invoke<void>("debug_log", { message });
}
