# 使用指南

SkillsYoga 是一个桌面应用，用于统一管理多个 AI 编程工具的 Skills（技能文件）。你可以在一处查看、创建、编辑、删除和导入 Skills，而无需手动在各工具的配置目录间切换。

## 什么是 Skill？

Skill 是一个包含 `SKILL.md` 文件的目录。AI 编程工具（如 Cursor、Gemini CLI 等）会读取该文件，将其作为指令引导 AI 的行为。例如，一个 "code-review" Skill 可以告诉 AI 审查代码时应关注哪些方面。

典型的 Skill 目录结构：

```
~/.cursor/skills/
  code-review/
    SKILL.md        ← AI 读取的指令文件
  refactor-guide/
    SKILL.md
```

## 界面概览

应用有四个页面，通过左侧边栏导航切换：

| 页面 | 用途 |
|------|------|
| **Skills** | 查看所有已安装的 Skills，搜索、编辑、删除 |
| **Tools** | 查看已检测到的工具，启用/禁用，添加自定义工具 |
| **Marketplace** | 从 GitHub 仓库导入 Skill |
| **Settings** | 查看应用数据目录、快捷键等信息 |

## 快速开始

### 1. 检查工具检测

打开 **Tools** 页面。应用会自动检测本机已安装的工具：

- **Cursor** — `~/.cursor`
- **Gemini CLI** — `~/.gemini`
- **Antigravity** — `~/.antigravity`
- **Trae** — `~/.trae`
- **OpenClaw** — `~/.openclaw`

已检测到的工具会显示绿色 **Detected** 标签。用开关按钮启用或禁用工具——只有启用的工具的 Skills 才会出现在 Skills 页面。

### 2. 查看已有 Skills

打开 **Skills** 页面。顶部显示统计卡片（已安装 Skills 数、启用工具数、检测到的工具数），下方列出所有已安装的 Skill 卡片。

使用顶栏搜索框可按名称、描述或关联工具筛选。

### 3. 创建新 Skill

1. 在 Skills 页面点击右上角 **New Skill** 按钮。
2. 填写：
   - **Skill Name** — 技能名称，将用作目录名（如 `code-review`）。
   - **Target Tool** — 选择要安装到的工具。
   - **Description** — 简短描述，显示在卡片上。
3. 在 Monaco 编辑器中编写 `SKILL.md` 内容。第一行建议使用 `# 标题` 格式。
4. 点击 **Create Skill**。

文件将保存到所选工具的 skills 目录下（如 `~/.cursor/skills/code-review/SKILL.md`）。

### 4. 编辑已有 Skill

在 Skills 页面，点击 Skill 卡片右上角的铅笔图标，编辑器将加载当前 `SKILL.md` 内容。修改后点击 **Save Changes**。

### 5. 删除 Skill

点击 Skill 卡片右上角的垃圾桶图标，确认后将删除整个 Skill 目录。此操作不可撤销。

## 从 Marketplace 导入

Marketplace 页面提供两种导入方式：

### 使用预置源

左侧列出已收录的开源 Skill 仓库：

- **Awesome Claude Skills (Composio)** — 社区整理的 Claude 技能合集
- **Claude Code Plugins + Skills** — Claude 工作流的插件与技能示例
- **Antigravity Awesome Skills** — Antigravity 环境专用技能
- **Awesome OpenClaw Skills** — OpenClaw 技能包
- **Obra Superpowers** — 兼容多工具的自动化增强技能

点击任一源，其 GitHub URL 会自动填入安装表单。

### 手动输入仓库 URL

1. 在 **Repository URL** 中粘贴 GitHub 仓库地址（必须以 `https://github.com/` 开头）。
2. 如果仓库内有多个 Skill 目录，在 **Skill Path** 中指定子路径（如 `skills/my-skill`）。留空则自动搜索。
3. 选择 **Target Tool**（只显示已启用且已检测的工具）。
4. 点击 **Install From GitHub**。

应用会 `git clone --depth 1` 该仓库，定位包含 `SKILL.md` 的目录，将其复制到目标工具的 skills 路径下。

## 添加自定义工具

如果你使用的工具不在内置列表中：

1. 打开 **Tools** 页面，点击右上角 **Add Custom Tool**。
2. 填写：
   - **ID** — 唯一标识（如 `codex`）
   - **Name** — 显示名称（如 `Codex`）
   - **Config Path** — 工具配置目录（如 `~/.codex`）
   - **Skills Path** — Skills 存放目录（如 `~/.codex/skills`），路径中需包含 `skills`
   - **CLI Tool** — 是否为命令行工具
3. 点击 **Save Tool**。

自定义工具与内置工具功能完全一致，同样支持 Skill 管理和 Marketplace 导入。要删除自定义工具，点击其卡片上的垃圾桶图标。

## 快捷键

| 快捷键 | 操作 |
|--------|------|
| `Cmd/Ctrl + Shift + R` | 刷新仪表盘数据 |

## 数据存储

- **应用状态**（工具开关、自定义工具列表）保存在系统应用数据目录下的 `state.json`。可在 Settings 页面查看并复制该目录路径。
- **Skills 文件** 直接存放在各工具的 skills 目录中，不由应用集中管理——删除应用不会影响已安装的 Skills。
