export type ToolKind = "builtin" | "custom";

export interface ToolInfo {
  id: string;
  name: string;
  kind: ToolKind;
  configPath: string;
  skillsPath: string;
  detected: boolean;
  enabled: boolean;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  source: string;
  enabledFor: string[];
  updatedAt: string;
  githubRepoUrl?: string;
  githubSkillPath?: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  repoUrl: string;
  description: string;
  tags: string[];
}

export interface DashboardStats {
  installedSkills: number;
  detectedTools: number;
  enabledTools: number;
}

export interface DashboardData {
  tools: ToolInfo[];
  skills: SkillInfo[];
  sources: SourceInfo[];
  stats: DashboardStats;
  appDataDir: string;
  hasGithubToken: boolean;
  skillEditorDefaultMode: "view" | "edit";
}

export interface SaveSkillRequest {
  content: string;
  targetToolId: string;
  existingPath?: string;
}

export interface InstallSkillRequest {
  repoUrl: string;
  skillPath?: string;
  targetToolId: string;
}

export interface UpdateSkillFromGithubRequest {
  path: string;
  repoUrl: string;
  skillPath?: string;
}

export interface CustomToolInput {
  id: string;
  name: string;
  configPath: string;
  skillsPath: string;
}

export interface SearchSkillResult {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export interface InstallFromRegistryRequest {
  source: string;
  skillId: string;
  targetToolId: string;
}

export interface SkillFileEntry {
  relativePath: string;
  isDir: boolean;
}

export interface SaveSkillEntryRequest {
  path: string;
  relativePath: string;
  content: string;
}

export interface CreateGitHubGistRequest {
  skillName: string;
  skillDescription: string;
  filePath: string;
  selectedText: string;
}

export interface CopySkillToToolRequest {
  sourcePath: string;
  targetToolId: string;
  conflictStrategy?: "overwrite" | "timestampedCopy";
}

export interface DiscoveredSkillsRoot {
  path: string;
  skillCount: number;
}
