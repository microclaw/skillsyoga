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
- Bump patch version: `bun run version:patch`
- Bump minor version: `bun run version:minor`
- Bump major version: `bun run version:major`

## Release

Version scripts:

- `./inc_patch_version.sh`
- `./inc_minor_version.sh`
- `./inc_major_version.sh`

Homebrew release script:

- `./scripts/release_homebrew.sh`

Environment variables for Homebrew release (as needed):

- `SIGNING_IDENTITY`
- `NOTARYTOOL_PROFILE` or (`APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`)
- `TAP_REPO` (default: `everettjf/homebrew-tap`)
- `CASK_PATH` (default: `Casks/skillsyoga.rb`)
- `SKIP_BUMP=1` to publish current version
- `SKIP_NOTARIZE=1` to skip notarization
- `SKIP_CASK_UPDATE=1` to skip tap update

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
