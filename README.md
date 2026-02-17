# SkillsYoga

SkillsYoga is a desktop skill management app built with:

- Core: Tauri 2 (Rust)
- Frontend: React 19 + TypeScript
- Styling: Tailwind CSS v4
- UI: Radix UI + shadcn/ui components (including `sidebar`)
- Editor: Monaco Editor

## Features

- Skills dashboard with searchable cards
- Tool detection and enable/disable management
- Add/remove custom tools
- Create/edit skills with Monaco (`SKILL.md`)
- Delete installed skills
- Import skill folders from GitHub repos
- Curated marketplace source list
- Local persisted state for tool toggles and custom tools
- Dark mode UI

## Development

```bash
bun install
bun run tauri dev
```

## Debugging

- Frontend only (Vite): `bun run dev`
- Full desktop app (Tauri + Rust): `bun run tauri dev`
- Frontend production build check: `bun run build`
- Rust check: `cd src-tauri && cargo check`

## How To Use Marketplace

1. Open `Tools`, make sure at least one detected tool is enabled.
2. Open `Marketplace`, click a curated source or paste a GitHub URL.
3. Optional: set `Skill Path` if the repo has multiple skill folders.
4. Select `Target Tool` and click `Install From GitHub`.
5. Open `Skills` and verify the imported skill card appears.

Build frontend only:

```bash
bun run build
```

Check Rust backend:

```bash
cd src-tauri
cargo check
```
