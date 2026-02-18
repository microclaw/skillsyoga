# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
bun install                      # Install frontend dependencies
bun run dev                      # Frontend-only dev server (port 1420)
bun run tauri dev                # Full desktop app with hot reload
bun run build                    # TypeScript check + Vite production build
cd src-tauri && cargo check      # Rust compilation check (fast)
bun run tauri build              # Full production desktop build
```

No test framework is configured. No linter is configured.

## Architecture

Tauri 2 desktop app: Rust backend serves commands over IPC to a React 19 + TypeScript frontend rendered in a WebView.

### Frontend (src/)

- **App.tsx** — Shell with sidebar navigation, view switching via local state (`ViewKey`), search bar, dialog triggers
- **views/** — Page components: SkillsView, ToolsView, MarketplaceView, SettingsView (stateless, receive data via props)
- **components/** — SkillEditorDialog (Monaco editor for SKILL.md), CustomToolDialog
- **components/ui/** — shadcn/ui primitives (Radix-based)
- **hooks/use-dashboard.ts** — Central data hook: fetches `DashboardData` from Rust, provides `refresh()` callback
- **lib/api.ts** — Thin wrapper around `@tauri-apps/api/core` `invoke()` calls, one function per Tauri command
- **types/models.ts** — TypeScript interfaces mirroring Rust structs (camelCase)

No router — views switch via `useState<ViewKey>`. Path alias `@/` maps to `src/`.

### Backend (src-tauri/src/)

- **lib.rs** — Module declarations + `run()` with Tauri handler registration
- **commands.rs** — All `#[tauri::command]` functions (8 commands exposed to frontend)
- **models.rs** — Shared data structs with `#[serde(rename_all = "camelCase")]`
- **tools.rs** — Built-in tool definitions (Cursor, Gemini, Antigravity, Trae, OpenClaw), `resolve_tools()` for lightweight tool list, `find_tool_by_id()`
- **skills.rs** — Skill discovery (scan dirs for SKILL.md), parsing, merging across tools, `copy_dir_recursive`
- **state.rs** — JSON persistence to app data dir (`state.json` with tool_toggles + custom_tools)
- **helpers.rs** — Path utilities (`expand_home`, `slugify`, `unique_dir`), path traversal validation
- **error.rs** — `AppError` enum via thiserror (Io, Serde, Git, NotFound, InvalidPath, Validation), serializes to string for frontend

### Data Flow

Frontend calls `invoke<T>("command_name", { args })` → Rust command returns `Result<T, AppError>` → serde serializes to JSON → frontend receives typed response or catches error string via toast.

`dashboard()` in commands.rs is the main aggregation: loads state, builds tool list, scans enabled tools' skills directories, merges duplicates, returns `DashboardData`.

`resolve_tools()` is a lightweight alternative that builds the tool list without scanning skills — used by `find_tool_by_id()` to avoid full dashboard rebuilds.

### Security

- `is_path_under_skills_root()` validates all user-supplied paths (read, write, delete) are under a known tool's skills directory
- CSP is currently disabled (`app.security.csp: null` in Tauri config)
- GitHub install only accepts `https://github.com/` URLs

## Key Patterns

- Rust structs use `snake_case` fields with `#[serde(rename_all = "camelCase")]` — TypeScript interfaces use `camelCase`
- All Rust commands return `Result<T, AppError>` — the `?` operator auto-converts io::Error and serde_json::Error
- Skills are directories containing a `SKILL.md` file; skill name is extracted from the first `#` heading
- Built-in tools are hardcoded in `tools.rs`; custom tools are persisted in `state.json`

## Styling

Tailwind CSS v4 with `@tailwindcss/vite` plugin. Custom dark theme using OKLch color space defined in `src/index.css`. UI components from shadcn/ui.
