import { invoke } from "@tauri-apps/api/core";
import type {
  CustomToolInput,
  DashboardData,
  InstallFromRegistryRequest,
  InstallSkillRequest,
  SaveSkillRequest,
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

export async function saveSkillFile(request: SaveSkillRequest) {
  return invoke<SkillInfo>("save_skill_file", { request });
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
