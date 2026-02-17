# SkillsYoga

A desktop app to manage AI coding tool skills in one place.

SkillsYoga helps you view, create, edit, delete, and import `SKILL.md`-based skills for tools like Cursor, Gemini CLI, and more, without switching between multiple config folders manually.

## Why SkillsYoga

- Unified management for multi-tool skill folders
- Built-in tool detection and enable/disable control
- Monaco-powered `SKILL.md` editing experience
- GitHub marketplace import for reusable community skills
- Local-first data model (skills stay in tool directories)

## Features

- Skills dashboard with search and summary stats
- Create, edit, and delete skills
- Detect installed tools automatically
- Add and manage custom tools
- Import skill folders from GitHub repositories
- Curated marketplace sources
- Persisted local app state (tool toggles and custom tools)

## Tech Stack

- Core: Tauri 2 (Rust)
- Frontend: React 19 + TypeScript + Vite
- Styling: Tailwind CSS v4
- UI: Radix UI + shadcn/ui
- Editor: Monaco Editor

## Screenshots

You can place screenshots in `docs/screenshots/` and update links below.

![Skills Page](docs/screenshots/skills.png)
![Tools Page](docs/screenshots/tools.png)
![Marketplace Page](docs/screenshots/marketplace.png)

## Quick Start

### Prerequisites

- Bun
- Rust toolchain
- Tauri development dependencies for your OS

### Run in Development

```bash
bun install
bun run tauri dev
```

### Useful Commands

- Frontend only: `bun run dev`
- Build frontend: `bun run build`
- Rust check: `cd src-tauri && cargo check`

## Usage

See `USAGE.md` for a full step-by-step guide (Chinese).

Marketplace import flow:

1. Open `Tools` and enable at least one detected tool.
2. Open `Marketplace`, select a curated source or paste a GitHub URL.
3. Optional: set `Skill Path` when repo has multiple skill directories.
4. Select `Target Tool` and click `Install From GitHub`.
5. Verify imported skill in `Skills`.

## Data & Privacy

- App state is saved to local `state.json` in the system app data directory.
- Skill files are stored directly in each tool's `skills` path.
- Uninstalling SkillsYoga does not remove installed skills from tool folders.

## Roadmap

- Better marketplace filtering and metadata
- Import conflict handling improvements
- Bulk operations for skills

## Contributing

Issues and pull requests are welcome.

If you want to contribute:

1. Fork the repo
2. Create a feature branch
3. Commit your changes
4. Open a pull request

## License

MIT. See `LICENSE`.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=OWNER/REPO&type=Date)](https://www.star-history.com/#OWNER/REPO&Date)
